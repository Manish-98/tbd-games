import { COMMIT_MESSAGES, CONFLICT_MARKERS, ERROR_CODES } from '../constants.js';
import { clone, diffTrees } from '../utils.js';
import { stateOf, success, gitFailure } from './common.js';
import { applyDerivedCommit } from './working-tree.js';

export const HISTORY_OPERATIONS = Object.freeze({
  revert: (repo, params) => revert(repo, params.commit),
  'cherry-pick': (repo, params) => params.abort ? abortCherryPick(repo) : cherryPick(repo, params.commit)
});

function revert(repo, commitId) {
  const state = stateOf(repo);
  const commit = state.commits[commitId];
  const parent = state.commits[commit.parents[0]];
  const patch = diffTrees(commit.tree, parent?.tree || {});
  const tree = applyPatch(state.workingTree, patch);

  return applyDerivedCommit(
    repo,
    tree,
    `${COMMIT_MESSAGES.REVERT_PREFIX}${commit.message}${COMMIT_MESSAGES.REVERT_SUFFIX}`,
    'revert',
    commitId
  );
}

function cherryPick(repo, commitId) {
  const state = stateOf(repo);
  const sourceCommit = state.commits[commitId];
  const sourceParent = state.commits[sourceCommit.parents[0]];
  const targetCommit = state.head.commit;
  const targetTree = clone(state.commits[targetCommit].tree);
  const patch = diffTrees(sourceParent?.tree || {}, sourceCommit.tree);
  const nextTree = clone(targetTree);
  const conflicts = [];
  const appliedChanges = {};
  const patchFiles = patch.map(change => change.file);

  for (const change of patch) {
    const targetValue = Object.prototype.hasOwnProperty.call(nextTree, change.file) ? nextTree[change.file] : null;
    const expectedValue = change.oldValue;
    const incomingValue = change.newValue;
    if (targetValue === expectedValue) {
      if (incomingValue === null) delete nextTree[change.file];
      else nextTree[change.file] = incomingValue;
      appliedChanges[change.file] = incomingValue;
      continue;
    }
    if (targetValue === incomingValue) continue;
    conflicts.push({ file: change.file, base: expectedValue, ours: targetValue, theirs: incomingValue });
    nextTree[change.file] = createConflictText(targetValue, incomingValue);
  }

  if (!conflicts.length) {
    return applyDerivedCommit(repo, nextTree, sourceCommit.message, 'cherry-pick', commitId, sourceCommit.author);
  }

  state.workingTree = nextTree;
  state.staging = appliedChanges;
  state.conflicts = conflicts;
  state.cherryPickInProgress = {
    sourceCommit: commitId,
    targetCommit,
    targetTree,
    patchFiles,
    message: sourceCommit.message,
    author: clone(sourceCommit.author),
    preOperation: { workingTree: clone(targetTree), staging: {}, conflicts: [] }
  };

  return gitFailure(ERROR_CODES.CHERRY_PICK_CONFLICT,
    'Cherry-pick stopped because some files changed on both sides. Resolve the conflicts, stage the resolutions, and commit; or abort the cherry-pick.',
    { conflicts: clone(conflicts) });
}

function abortCherryPick(repo) {
  const state = stateOf(repo);
  const operation = state.cherryPickInProgress;
  if (!operation) return gitFailure(ERROR_CODES.NOT_CHERRY_PICKING, 'There is no cherry-pick in progress to abort.');

  state.workingTree = clone(operation.preOperation.workingTree);
  state.staging = clone(operation.preOperation.staging);
  state.conflicts = clone(operation.preOperation.conflicts);
  state.cherryPickInProgress = null;

  return success({ aborted: true, sourceCommit: operation.sourceCommit, restoredHead: operation.targetCommit });
}

function createConflictText(ours, theirs) {
  return [CONFLICT_MARKERS.START, ours ?? '', CONFLICT_MARKERS.SEPARATOR, theirs ?? '', CONFLICT_MARKERS.END, ''].join('\n');
}
