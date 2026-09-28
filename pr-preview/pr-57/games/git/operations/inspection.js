import { DEFAULTS } from '../constants.js';
import { clone, diffTrees, applyChanges, hasChanges } from '../utils.js';
import { stateOf, success } from './common.js';

export const READ_OPERATIONS = Object.freeze({
  status: repo => success(getStatus(stateOf(repo))),
  log: (repo, params) => success(getLog(stateOf(repo), params.commit, params.limit)),
  show: (repo, params) => success(getShow(stateOf(repo), params.commit)),
  diff: (repo, params) => success(getDiff(stateOf(repo), params.file)),
  reflog: repo => success(clone(stateOf(repo).reflog))
});

function getStatus(state) {
  const headTree = state.commits[state.head.commit]?.tree || {};
  const stagedTree = applyChanges(headTree, state.staging);

  return {
    head: clone(state.head),
    staged: diffTrees(headTree, stagedTree),
    unstaged: diffTrees(stagedTree, state.workingTree),
    conflicts: clone(state.conflicts),
    clean: !hasChanges(state) && state.conflicts.length === 0
  };
}

function getLog(state, start = state.head.commit, limit = DEFAULTS.logLimit) {
  const result = [];
  const queue = [start];
  const seen = new Set();
  const maxEntries = Math.max(1, Number(limit) || DEFAULTS.logLimit);

  while (queue.length && result.length < maxEntries) {
    const id = queue.shift();

    if (!id || seen.has(id) || !state.commits[id]) continue;

    seen.add(id);
    const commit = state.commits[id];

    result.push({
      id: commit.id,
      message: commit.message,
      parents: clone(commit.parents),
      author: clone(commit.author),
      date: commit.date
    });
    queue.push(...commit.parents);
  }

  return result;
}

function getShow(state, id = state.head.commit) {
  const commit = state.commits[id];

  return {
    commit: clone(commit),
    branches: refsAtCommit(state.branches, id),
    tags: refsAtCommit(state.tags, id)
  };
}

function getDiff(state, file) {
  const changes = diffTrees(
    state.commits[state.head.commit]?.tree || {},
    state.workingTree
  );

  return file
    ? changes.filter(change => change.file === file)
    : changes;
}

function refsAtCommit(refs, commit) {
  return Object.entries(refs)
    .filter(([, value]) => value === commit)
    .map(([name]) => name);
}
