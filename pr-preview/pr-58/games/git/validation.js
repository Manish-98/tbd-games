import {
  COMMANDS,
  ERROR_CODES,
  RESET_MODES,
  STASH_RESTORE_ACTIONS
} from './constants.js';
import { hasChanges, isRefName } from './utils.js';

export function validateCommand(state, command) {
  if (!isStructuredCommand(command)) {
    return invalid(
      ERROR_CODES.INVALID_COMMAND,
      'Commands must be objects with a type and optional params.'
    );
  }

  const normalized = normalizeCommand(command);

  if (!COMMANDS.includes(normalized.type)) {
    return invalid(
      ERROR_CODES.UNKNOWN_COMMAND,
      `Unsupported Git command: ${normalized.type || '(empty)'}`
    );
  }

  const validator = VALIDATORS[normalized.type];
  return validator
    ? validator(state, normalized.params)
    : valid(normalized);
}

const VALIDATORS = Object.freeze({
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
});

function validateCommitCommand(state, params) {
  if (!String(params.message || '').trim()) {
    return invalid(ERROR_CODES.EMPTY_MESSAGE, 'Commit message cannot be empty.');
  }

  if (!Object.keys(state.staging).length) {
    return invalid(ERROR_CODES.NOTHING_STAGED, 'There is nothing staged to commit.');
  }

  if (state.conflicts.length) {
    return invalid(
      ERROR_CODES.UNRESOLVED_CONFLICTS,
      'Resolve merge conflicts before committing.'
    );
  }

  return valid({ type: 'commit', params });
}

function validateBranchCommand(state, params) {
  if (!isRefName(params.name)) {
    return invalid(ERROR_CODES.INVALID_REF, `Invalid branch name: ${params.name || ''}`);
  }

  const exists = Boolean(state.branches[params.name]);

  if (params.delete && !exists) {
    return invalid(ERROR_CODES.UNKNOWN_BRANCH, `Unknown branch: ${params.name}`);
  }

  if (!params.delete && exists) {
    return invalid(ERROR_CODES.BRANCH_EXISTS, `Branch already exists: ${params.name}`);
  }

  if (params.delete && state.head.branch === params.name) {
    return invalid(
      ERROR_CODES.DELETE_CURRENT_BRANCH,
      'Cannot delete the current branch.'
    );
  }

  if (params.startPoint && !state.commits[params.startPoint]) {
    return invalid(
      ERROR_CODES.UNKNOWN_COMMIT,
      `Unknown commit: ${params.startPoint}`
    );
  }

  return valid({ type: 'branch', params });
}

function validateSwitchCommand(state, params) {
  const targetCommit = state.branches[params.branch];

  console.debug('[Git Debug] switch validation', {
    branch: params.branch,
    targetCommit,
    targetExists: Boolean(state.commits[targetCommit]),
    head: state.head,
    commitIds: Object.keys(state.commits)
  });

  if (!targetCommit) {
    return invalid(ERROR_CODES.UNKNOWN_BRANCH, `Unknown branch: ${params.branch}`);
  }

  if (!state.commits[targetCommit]) {
    return invalid(
      ERROR_CODES.UNKNOWN_COMMIT,
      `Branch ${params.branch} points to an unknown commit.`
    );
  }

  if (hasChanges(state)) {
    return invalid(
      ERROR_CODES.DIRTY_WORKTREE,
      'Local changes would be overwritten by switching branches.'
    );
  }

  return valid({ type: 'switch', params });
}

function validateResetCommand(state, params) {
  if (!state.commits[params.commit]) {
    return invalid(ERROR_CODES.UNKNOWN_COMMIT, `Unknown commit: ${params.commit}`);
  }

  const mode = params.mode || 'mixed';

  if (!RESET_MODES.includes(mode)) {
    return invalid(
      ERROR_CODES.INVALID_MODE,
      'Reset mode must be soft, mixed, or hard.'
    );
  }

  return valid({ type: 'reset', params: { ...params, mode } });
}

function validateRestoreCommand(state, params) {
  if (!params.file) {
    return invalid(ERROR_CODES.EMPTY_FILE, 'A file is required.');
  }

  if (params.source && !state.commits[params.source]) {
    return invalid(
      ERROR_CODES.UNKNOWN_COMMIT,
      `Unknown commit: ${params.source}`
    );
  }

  return valid({ type: 'restore', params });
}

function validatePushCommand(state, params) {
  const remoteResult = validateRemote(state, params.remote, 'push');

  if (!remoteResult.valid) return remoteResult;

  const branch = params.branch || state.head.branch;

  if (!state.branches[branch]) {
    return invalid(ERROR_CODES.UNKNOWN_BRANCH, `Unknown branch: ${branch}`);
  }

  return valid({
    type: 'push',
    params: { ...params, branch }
  });
}

function validateStashCommand(state, params) {
  if (STASH_RESTORE_ACTIONS.includes(params.action)) {
    return state.stash.length
      ? valid({ type: 'stash', params })
      : invalid(ERROR_CODES.EMPTY_STASH, 'There are no stashed changes.');
  }

  return hasChanges(state)
    ? valid({ type: 'stash', params: { ...params, action: 'push' } })
    : invalid(ERROR_CODES.CLEAN_WORKTREE, 'There are no local changes to stash.');
}

function validateBranchOperation(state, params, type) {
  const targetCommit = state.branches[params.branch];

  console.debug('[Git Debug] branch operation validation', {
    type,
    branch: params.branch,
    targetCommit,
    targetExists: Boolean(state.commits[targetCommit]),
    head: state.head,
    headExists: Boolean(state.commits[state.head?.commit]),
    commitIds: Object.keys(state.commits)
  });

  if (!targetCommit) {
    return invalid(ERROR_CODES.UNKNOWN_BRANCH, `Unknown branch: ${params.branch}`);
  }

  if (!state.commits[targetCommit]) {
    return invalid(
      ERROR_CODES.UNKNOWN_COMMIT,
      `Branch ${params.branch} points to an unknown commit.`
    );
  }

  if (state.head.type !== 'branch') {
    return invalid(
      ERROR_CODES.DETACHED_HEAD,
      `${type} requires HEAD to be attached to a branch.`
    );
  }

  if (!state.commits[state.head.commit]) {
    return invalid(
      ERROR_CODES.UNKNOWN_COMMIT,
      'HEAD points to an unknown commit.'
    );
  }

  if (hasChanges(state)) {
    return invalid(
      ERROR_CODES.DIRTY_WORKTREE,
      `Commit or stash local changes before ${type}.`
    );
  }

  return valid({ type, params });
}

function validateCommit(state, commit, type) {
  return state.commits[commit]
    ? valid({ type, params: { commit } })
    : invalid(ERROR_CODES.UNKNOWN_COMMIT, `Unknown commit: ${commit}`);
}

function validateOptionalCommit(state, commit, type) {
  return !commit || state.commits[commit]
    ? valid({ type, params: { commit } })
    : invalid(ERROR_CODES.UNKNOWN_COMMIT, `Unknown commit: ${commit}`);
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
    : invalid(ERROR_CODES.UNKNOWN_FILE, `File does not exist: ${file}`);
}

function validateRemote(state, name, type) {
  return state.remotes[name]
    ? valid({ type, params: { remote: name } })
    : invalid(ERROR_CODES.UNKNOWN_REMOTE, `Unknown remote: ${name}`);
}

function isStructuredCommand(command) {
  return Boolean(
    command &&
    typeof command === 'object' &&
    !Array.isArray(command)
  );
}

function normalizeCommand(command) {
  return {
    type: String(command.type || '').trim(),
    params: command.params ? { ...command.params } : {}
  };
}

function valid(command) {
  return { valid: true, command };
}

function invalid(code, message) {
  return { valid: false, error: { code, message } };
}
