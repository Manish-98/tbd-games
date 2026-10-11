import { CONFLICT_MARKERS, DEFAULTS, OPERATION_TYPES } from '../constants.js';
import { applyChanges, clone } from '../utils.js';
import {
  stateOf,
  success,
  moveHead,
  headRef,
  createChange
} from './common.js';

export const WORKING_TREE_OPERATIONS = Object.freeze({
  add: stageFile,
  resolve: resolveConflict,
  commit,
  restore,
  reset
});

function stageFile(repo, params) {
  const state = stateOf(repo);

  state.staging[params.file] = Object.prototype.hasOwnProperty.call(
    state.workingTree,
    params.file
  )
    ? state.workingTree[params.file]
    : null;

  const content = state.workingTree[params.file];
  const hasMarkers = typeof content === 'string' && Object.values(CONFLICT_MARKERS)
    .some(marker => content.includes(marker));

  if (!hasMarkers) {
    state.conflicts = state.conflicts.filter(conflict => conflict.file !== params.file);
  }

  return success({
    resolved: !hasMarkers,
    changes: [createChange(OPERATION_TYPES.STAGE, { file: params.file })]
  });
}

function resolveConflict(repo, params) {
  const state = stateOf(repo);
  state.workingTree[params.file] = params.content;

  return success({
    file: params.file,
    resolved: !Object.values(CONFLICT_MARKERS).some(marker => params.content.includes(marker))
  });
}

function commit(repo, params) {
  const state = stateOf(repo);
  const parent = state.head.commit;
  const merge = state.mergeInProgress;
  const tree = applyChanges(state.commits[parent].tree, state.staging);
  const workingTreeAfterCommit = clone(state.workingTree);
  const stagedFiles = new Set(Object.keys(state.staging));
  const parents = merge ? [parent, merge.theirs] : [parent];
  const commit = repo.createCommit({
    message: params.message,
    parents,
    tree,
    author: params.author || DEFAULTS.author
  });

  moveHead(repo, commit.id);
  // Commit only the staged snapshot. Keep unstaged edits and untracked files;
  // staged paths now match the committed tree and no longer need worktree diffs.
  for (const file of stagedFiles) {
    if (Object.prototype.hasOwnProperty.call(tree, file)) {
      workingTreeAfterCommit[file] = tree[file];
    } else {
      delete workingTreeAfterCommit[file];
    }
  }
  state.workingTree = workingTreeAfterCommit;
  state.staging = {};
  state.conflicts = [];
  state.mergeInProgress = null;
  repo.refChange(
    headRef(repo),
    parent,
    commit.id,
    `commit: ${commit.message}`
  );

  return success({
    commit: clone(commit),
    changes: [createChange(OPERATION_TYPES.COMMIT, { commit: commit.id })]
  });
}

function restore(repo, params) {
  const state = stateOf(repo);
  const sourceCommit = params.source || state.head.commit;
  const sourceTree = state.commits[sourceCommit].tree;

  if (Object.prototype.hasOwnProperty.call(sourceTree, params.file)) {
    state.workingTree[params.file] = sourceTree[params.file];
  } else {
    delete state.workingTree[params.file];
  }

  if (params.staged) {
    state.staging[params.file] = sourceTree[params.file] ?? null;
  }

  return success({ restored: params.file, source: sourceCommit });
}

function reset(repo, params) {
  const state = stateOf(repo);
  const previous = state.head.commit;
  const target = state.commits[params.commit];

  moveHead(repo, target.id);

  if (params.mode === 'hard') {
    state.workingTree = clone(target.tree);
    state.staging = {};
  } else if (params.mode === 'mixed') {
    state.staging = {};
  }

  repo.refChange(
    headRef(repo),
    previous,
    target.id,
    `reset: ${params.mode}`
  );

  return success({
    from: previous,
    to: target.id,
    mode: params.mode,
    changes: [createChange(OPERATION_TYPES.REF, {
      from: previous,
      to: target.id
    })]
  });
}

export function applyDerivedCommit(
  repo,
  tree,
  message,
  operation,
  source,
  author = DEFAULTS.author
) {
  const state = stateOf(repo);
  const parent = state.head.commit;
  const commit = repo.createCommit({
    message,
    parents: [parent],
    tree,
    author
  });

  moveHead(repo, commit.id);
  state.workingTree = clone(tree);
  state.staging = {};
  state.conflicts = [];
  repo.refChange(
    headRef(repo),
    parent,
    commit.id,
    `${operation}: ${source}`
  );

  return success({
    commit: clone(commit),
    changes: [createChange(operation, { from: source, to: commit.id })]
  });
}
