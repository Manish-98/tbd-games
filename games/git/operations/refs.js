import { OPERATION_TYPES } from '../constants.js';
import { clone, findMergeBase, firstParentPath, isAncestor, diffTrees, applyPatch } from '../utils.js';
import {
  stateOf,
  success,
  gitFailure,
  moveHead,
  headRef,
  branchRef,
  createChange
} from './common.js';

export const REF_OPERATIONS = Object.freeze({
  branch: updateBranch,
  switch: switchBranch,
  merge,
  rebase
});

function updateBranch(repo, params) {
  const state = stateOf(repo);

  if (params.delete) {
    const old = state.branches[params.name];
    delete state.branches[params.name];
    repo.refChange(branchRef(params.name), old, null, 'branch deleted');
    return success({ deleted: params.name });
  }

  const commit = params.startPoint || state.head.commit;
  state.branches[params.name] = commit;
  repo.refChange(branchRef(params.name), null, commit, 'branch created');

  return success({ created: params.name, commit });
}

function switchBranch(repo, params) {
  const state = stateOf(repo);
  const previousCommit = state.head.commit;
  const nextCommit = state.branches[params.branch];

  state.head = {
    type: 'branch',
    branch: params.branch,
    commit: nextCommit
  };
  state.workingTree = clone(state.commits[nextCommit].tree);
  state.staging = {};
  repo.refChange('HEAD', previousCommit, nextCommit, `switch: ${params.branch}`);

  return success({
    head: clone(state.head),
    changes: [createChange(OPERATION_TYPES.HEAD, {
      from: previousCommit,
      to: nextCommit
    })]
  });
}

export function mergeForPull(repo, branch) {
  return merge(repo, branch);
}

function merge(repo, branch) {
  const state = stateOf(repo);
  const ours = state.head.commit;
  const theirs = state.branches[branch];

  if (isAncestor(state.commits, ours, theirs)) {
    moveHead(repo, theirs);
    state.workingTree = clone(state.commits[theirs].tree);
    repo.refChange(headRef(repo), ours, theirs, `merge: ${branch}`);

    return success({
      fastForward: true,
      changes: [createChange(OPERATION_TYPES.HEAD, { from: ours, to: theirs })]
    });
  }

  const base = findMergeBase(state.commits, ours, theirs);
  const result = mergeTrees(
    state.commits[base]?.tree || {},
    state.commits[ours].tree,
    state.commits[theirs].tree
  );

  state.workingTree = clone(result.tree);

  if (result.conflicts.length) {
    state.conflicts = result.conflicts;
    return gitFailure(
      'MERGE_CONFLICT',
      'Automatic merge failed; resolve conflicts and commit the result.',
      { conflicts: clone(result.conflicts) }
    );
  }

  const commit = repo.createCommit({
    message: `Merge branch ${branch}`,
    parents: [ours, theirs],
    tree: result.tree
  });

  moveHead(repo, commit.id);
  state.staging = {};
  repo.refChange(headRef(repo), ours, commit.id, `merge: ${branch}`);

  return success({
    commit: clone(commit),
    changes: [createChange(OPERATION_TYPES.MERGE, { commit: commit.id })]
  });
}

function rebase(repo, branch) {
  const state = stateOf(repo);
  const current = state.head.commit;
  const target = state.branches[branch];

  if (isAncestor(state.commits, current, target)) {
    moveHead(repo, target);
    state.workingTree = clone(state.commits[target].tree);
    return success({
      fastForward: true,
      changes: [createChange(OPERATION_TYPES.HEAD, { from: current, to: target })]
    });
  }

  const base = findMergeBase(state.commits, current, target);
  const originalCommits = firstParentPath(state.commits, base, current);
  let parent = target;
  const rewritten = [];

  for (const originalId of originalCommits) {
    const original = state.commits[originalId];
    const originalParent = state.commits[original.parents[0]];
    const patch = diffTrees(originalParent?.tree || {}, original.tree);
    const tree = applyPatch(state.commits[parent].tree, patch);
    const replacement = repo.createCommit({
      message: original.message,
      parents: [parent],
      tree,
      author: original.author
    });

    parent = replacement.id;
    rewritten.push({ from: originalId, to: replacement.id });
  }

  moveHead(repo, parent);
  state.workingTree = clone(state.commits[parent].tree);
  repo.refChange(headRef(repo), current, parent, `rebase: ${branch}`);

  return success({
    rewritten,
    changes: [createChange(OPERATION_TYPES.REBASE, { rewritten })]
  });
}

function mergeTrees(base, ours, theirs) {
  const tree = {};
  const conflicts = [];
  const files = new Set([
    ...Object.keys(base),
    ...Object.keys(ours),
    ...Object.keys(theirs)
  ]);

  for (const file of files) {
    const baseValue = base[file];
    const oursValue = ours[file];
    const theirsValue = theirs[file];
    const oursChanged = oursValue !== baseValue;
    const theirsChanged = theirsValue !== baseValue;

    if (oursChanged && theirsChanged && oursValue !== theirsValue) {
      conflicts.push({
        file,
        base: baseValue ?? null,
        ours: oursValue ?? null,
        theirs: theirsValue ?? null
      });
      tree[file] = conflictText(oursValue, theirsValue);
    } else if (theirsChanged) {
      if (theirsValue !== undefined) tree[file] = theirsValue;
    } else if (oursValue !== undefined) {
      tree[file] = oursValue;
    }
  }

  return { tree, conflicts };
}

function conflictText(ours, theirs) {
  return [
    '<<<<<<< HEAD',
    ours ?? '',
    '=======',
    theirs ?? '',
    '>>>>>>> incoming',
    ''
  ].join('\n');
}
