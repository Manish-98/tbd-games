import { DEFAULTS, OPERATION_TYPES } from '../constants.js';
import { applyPatch, clone, diffTrees } from '../utils.js';
import { stateOf, success, createChange } from './common.js';

export const STASH_OPERATIONS = Object.freeze({
  stash
});

function stash(repo, params) {
  const state = stateOf(repo);

  if (params.action === 'apply' || params.action === 'pop') {
    const entry = state.stash[0];
    const base = state.commits[entry.head]?.tree || {};

    state.workingTree = applyPatch(
      state.workingTree,
      diffTrees(base, entry.workingTree)
    );
    state.staging = clone(entry.staging);

    if (params.action === 'pop') {
      state.stash.shift();
    }

    return success({
      action: params.action,
      changes: [createChange(OPERATION_TYPES.STASH_APPLY)]
    });
  }

  state.stash.unshift({
    message: params.message || DEFAULTS.stashMessage,
    head: state.head.commit,
    workingTree: clone(state.workingTree),
    staging: clone(state.staging),
    timestamp: repo.now()
  });
  state.workingTree = clone(state.commits[state.head.commit].tree);
  state.staging = {};

  return success({
    action: 'push',
    changes: [createChange(OPERATION_TYPES.STASH)]
  });
}
