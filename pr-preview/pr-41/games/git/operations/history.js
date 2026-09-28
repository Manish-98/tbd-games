import { COMMIT_MESSAGES } from '../constants.js';
import { diffTrees, applyPatch } from '../utils.js';
import { stateOf } from './common.js';
import { applyDerivedCommit } from './working-tree.js';

export const HISTORY_OPERATIONS = Object.freeze({
  revert: (repo, params) => revert(repo, params.commit),
  'cherry-pick': (repo, params) => cherryPick(repo, params.commit)
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
  const commit = state.commits[commitId];
  const parent = state.commits[commit.parents[0]];
  const patch = diffTrees(parent?.tree || {}, commit.tree);
  const tree = applyPatch(state.workingTree, patch);

  return applyDerivedCommit(
    repo,
    tree,
    commit.message,
    'cherry-pick',
    commitId,
    commit.author
  );
}
