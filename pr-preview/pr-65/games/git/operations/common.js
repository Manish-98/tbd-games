import { OPERATION_TYPES, REF_PREFIX } from '../constants.js';
import { clone } from '../utils.js';
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
  state.branches[state.head.branch] = commit;
  state.head.commit = commit;
}

export function headRef(repo) {
  return branchRef(stateOf(repo).head.branch);
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
