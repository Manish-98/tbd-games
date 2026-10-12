import { OPERATION_TYPES, REF_PREFIX } from '../constants.js';
import { getRepositoryState } from '../repository-state.js';

export function stateOf(repo) {
  return getRepositoryState(repo);
}

export function success(data = {}) {
  return { ok: true, data, error: null };
}

export function gitFailure(code, message, data = {}) {
  return { ok: false, data, error: { code, message } };
}

export function moveHead(repo, commit) {
  const state = stateOf(repo);
  if (state.head.type !== 'detached' && state.head.branch) {
    state.branches[state.head.branch] = commit;
  }
  state.head.commit = commit;
}

export function headRef(repo) {
  const state = stateOf(repo);
  return state.head.type === 'detached' || !state.head.branch
    ? 'HEAD'
    : branchRef(state.head.branch);
}

export function branchRef(branch) {
  return `${REF_PREFIX.BRANCH}${branch}`;
}

export function remoteRef(remote, branch) {
  return `${remote}/${branch}`;
}

export function createChange(type, values = {}) {
  return { type, ...values };
}

export const CHANGE_TYPES = OPERATION_TYPES;
