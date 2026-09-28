import { COMMANDS, RESET_MODES, STASH_RESTORE_ACTIONS } from './constants.js';
import { hasChanges, isRefName } from './utils.js';

export function validateCommand(state, command) {
  const normalized = normalizeCommand(command);

  if (!COMMANDS.includes(normalized.type)) {
    return invalid(
      'UNKNOWN_COMMAND',
      `Unsupported Git command: ${normalized.type || '(empty)'}`
    );
  }

  const validator = VALIDATORS[normalized.type];
  return validator
    ? validator(state, normalized.params)
    : valid(normalized);
}

const VALIDATORS = {
  status: params => valid({ type: 'status', params }),
  log: (state, params) => validateOptionalCommit(state, params.commit, 'log'),
  show: (state, params) => validateCommit(state, params.commit, 'show'),
  diff: params => valid({ type: 'diff', params }),
  add: (state, params) => validateFileForAdd(state, params.file),
  commit: validateCommitCommand,
  branch: validateBranchCommand,
  switch: validateSwitchCommand,
  merge: (state, params) => validateBranchOperation(state, params, 'merge'),
  rebase: (state, params) => validateBranchOperation(state, params, 'rebase'),
  reset: validateResetCommand,
  restore: validateRestoreCommand,
  revert: (state, params) => validateCommit(state, params.commit, 'revert'),
  'cherry-pick': (state, params) => validateCommit(state, params.commit, 'cherry-pick'),
  fetch: (state, params) => validateRemote(state, params.remote, 'fetch'),
  pull: (state, params) => validateRemote(state, params.remote, 'pull'),
  push: validatePushCommand,
  stash: validateStashCommand,
  reflog: params => valid({ type: 'reflog', params })
};

function validateCommitCommand(state, params) {
  if (!String(params.message || '').trim()) {
    return invalid('EMPTY_MESSAGE', 'Commit message cannot be empty.');
  }

  if (!Object.keys(state.staging).length) {
    return invalid('NOTHING_STAGED', 'There is nothing staged to commit.');
  }

  if (state.conflicts.length) {
    return invalid(
      'UNRESOLVED_CONFLICTS',
      'Resolve merge conflicts before committing.'
    );
  }

  return valid({ type: 'commit', params });
}

function validateBranchCommand(state, params) {
  if (!isRefName(params.name)) {
    return invalid('INVALID_REF', `Invalid branch name: ${params.name || ''}`);
  }

  const exists = Boolean(state.branches[params.name]);

  if (params.delete && !exists) {
    return invalid('UNKNOWN_BRANCH', `Unknown branch: ${params.name}`);
  }

  if (!params.delete && exists) {
    return invalid('BRANCH_EXISTS', `Branch already exists: ${params.name}`);
  }

  if (params.delete && state.head.branch === params.name) {
    return invalid('DELETE_CURRENT_BRANCH', 'Cannot delete the current branch.');
  }

  if (params.startPoint && !state.commits[params.startPoint]) {
    return invalid('UNKNOWN_COMMIT', `Unknown commit: ${params.startPoint}`);
  }

  return valid({ type: 'branch', params });
}

function validateSwitchCommand(state, params) {
  if (!state.branches[params.branch]) {
    return invalid('UNKNOWN_BRANCH', `Unknown branch: ${params.branch}`);
  }

  if (hasChanges(state)) {
    return invalid(
      'DIRTY_WORKTREE',
      'Local changes would be overwritten by switching branches.'
    );
  }

  return valid({ type: 'switch', params });
}

function validateResetCommand(state, params) {
  if (!state.commits[params.commit]) {
    return invalid('UNKNOWN_COMMIT', `Unknown commit: ${params.commit}`);
  }

  const mode = params.mode || 'mixed';

  if (!RESET_MODES.has(mode)) {
    return invalid(
      'INVALID_MODE',
      'Reset mode must be soft, mixed, or hard.'
    );
  }

  return valid({ type: 'reset', params: { ...params, mode } });
}

function validateRestoreCommand(state, params) {
  if (!params.file) {
    return invalid('EMPTY_FILE', 'A file is required.');
  }

  if (params.source && !state.commits[params.source]) {
    return invalid('UNKNOWN_COMMIT', `Unknown commit: ${params.source}`);
  }

  return valid({ type: 'restore', params });
}

function validatePushCommand(state, params) {
  const remoteResult = validateRemote(state, params.remote, 'push');

  if (!remoteResult.valid) return remoteResult;

  const branch = params.branch || state.head.branch;

  if (!state.branches[branch]) {
    return invalid('UNKNOWN_BRANCH', `Unknown branch: ${branch}`);
  }

  return valid({
    type: 'push',
    params: { ...params, branch }
  });
}

function validateStashCommand(state, params) {
  if (STASH_RESTORE_ACTIONS.has(params.action)) {
    return state.stash.length
      ? valid({ type: 'stash', params })
      : invalid('EMPTY_STASH', 'There are no stashed changes.');
  }

  return hasChanges(state)
    ? valid({ type: 'stash', params: { ...params, action: 'push' } })
    : invalid('CLEAN_WORKTREE', 'There are no local changes to stash.');
}

function validateBranchOperation(state, params, type) {
  if (!state.branches[params.branch]) {
    return invalid('UNKNOWN_BRANCH', `Unknown branch: ${params.branch}`);
  }

  if (state.head.type !== 'branch') {
    return invalid(
      'DETACHED_HEAD',
      `${type} requires HEAD to be attached to a branch.`
    );
  }

  if (hasChanges(state)) {
    return invalid(
      'DIRTY_WORKTREE',
      `Commit or stash local changes before ${type}.`
    );
  }

  return valid({ type, params });
}

function validateCommit(state, commit, type) {
  return state.commits[commit]
    ? valid({ type, params: { commit } })
    : invalid('UNKNOWN_COMMIT', `Unknown commit: ${commit}`);
}

function validateOptionalCommit(state, commit, type) {
  return !commit || state.commits[commit]
    ? valid({ type, params: { commit } })
    : invalid('UNKNOWN_COMMIT', `Unknown commit: ${commit}`);
}

function validateFileForAdd(state, file) {
  const existsInWorktree = Object.prototype.hasOwnProperty.call(
    state.workingTree,
    file
  );
  const existsInHead = Object.prototype.hasOwnProperty.call(
    state.commits[state.head.commit]?.tree || {},
    file
  );

  return existsInWorktree || existsInHead
    ? valid({ type: 'add', params: { file } })
    : invalid('UNKNOWN_FILE', `File does not exist: ${file}`);
}

function validateRemote(state, name, type) {
  return state.remotes[name]
    ? valid({ type, params: { remote: name } })
    : invalid('UNKNOWN_REMOTE', `Unknown remote: ${name}`);
}

function normalizeCommand(command) {
  if (typeof command === 'string') {
    return { type: command.trim(), params: {} };
  }

  return {
    type: String(command?.type || '').trim(),
    params: command?.params ? { ...command.params } : {}
  };
}

function valid(command) {
  return { valid: true, command };
}

function invalid(code, message) {
  return { valid: false, error: { code, message } };
}
