import { ERROR_CODES, OPERATION_TYPES } from '../constants.js';
import { clone, isAncestor, reachable } from '../utils.js';
import {
  stateOf,
  success,
  gitFailure,
  moveHead,
  headRef,
  remoteRef,
  branchRef,
  createChange
} from './common.js';
import { mergeForPull } from './refs.js';

export const REMOTE_OPERATIONS = Object.freeze({
  fetch: (repo, params) => fetchRemote(repo, params.remote),
  pull,
  push: (repo, params) => pushRemote(repo, params.remote, params.branch)
});

function fetchRemote(repo, name) {
  const state = stateOf(repo);
  const remote = state.remotes[name];
  const changes = [];

  for (const [branch, commit] of Object.entries(remote.branches || {})) {
    const ref = remoteRef(name, branch);
    const previous = state.remoteTracking[ref] || null;

    state.remoteTracking[ref] = commit;

    if (previous !== commit) {
      changes.push(createChange(OPERATION_TYPES.REMOTE_REF, {
        ref,
        from: previous,
        to: commit
      }));
    }

    for (const id of reachable(remote.commits, commit)) {
      if (!state.commits[id] && remote.commits?.[id]) {
        state.commits[id] = clone(remote.commits[id]);
      }
    }
  }

  return success({ remote: name, changes });
}

function pull(repo, params) {
  const fetched = fetchRemote(repo, params.remote);
  const state = stateOf(repo);
  const branch = params.branch || state.head.branch;
  const remoteId = state.remoteTracking[remoteRef(params.remote, branch)];

  if (!remoteId) {
    return gitFailure(
      ERROR_CODES.NO_REMOTE_BRANCH,
      `Remote branch does not exist: ${branch}`,
      fetched.data
    );
  }

  if (remoteId === state.head.commit) {
    return success({ ...fetched.data, upToDate: true });
  }

  if (isAncestor(state.commits, state.head.commit, remoteId)) {
    const previous = state.head.commit;
    state.branches[branch] = remoteId;
    state.head.commit = remoteId;
    state.workingTree = clone(state.commits[remoteId].tree);
    repo.refChange(
      branchRef(branch),
      previous,
      remoteId,
      `pull: ${remoteRef(params.remote, branch)}`
    );

    return success({
      ...fetched.data,
      fastForward: true
    });
  }

  const original = state.branches[branch];
  const temporaryBranch = remoteRef(params.remote, branch);

  state.branches[temporaryBranch] = remoteId;
  const result = mergeForPull(repo, temporaryBranch);
  delete state.branches[temporaryBranch];
  state.branches[branch] = state.head.commit || original;

  return result.ok
    ? success({ ...fetched.data, ...result.data })
    : result;
}

function pushRemote(repo, remoteName, branch) {
  const state = stateOf(repo);
  const remote = state.remotes[remoteName];
  const local = state.branches[branch];
  const remoteId = remote.branches?.[branch];

  if (remoteId && !isAncestor(state.commits, remoteId, local)) {
    return gitFailure(
      ERROR_CODES.NON_FAST_FORWARD,
      `Remote ${remoteRef(remoteName, branch)} contains work not in the local branch.`
    );
  }

  remote.branches ||= {};
  remote.commits ||= {};
  remote.branches[branch] = local;

  for (const id of reachable(state.commits, local)) {
    remote.commits[id] = clone(state.commits[id]);
  }

  state.remoteTracking[remoteRef(remoteName, branch)] = local;

  return success({
    remote: remoteName,
    branch,
    commit: local,
    changes: [createChange(OPERATION_TYPES.PUSH, {
      ref: remoteRef(remoteName, branch),
      to: local
    })]
  });
}
