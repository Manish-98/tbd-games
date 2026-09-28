export const DEFAULTS = Object.freeze({
  seed: 'playroom-git',
  branch: 'main',
  initialFile: 'README.md',
  initialContent: '# Repository',
  initialMessage: 'Initial commit',
  commitPrefix: 'Commit ',
  stashMessage: 'WIP',
  author: Object.freeze({ name: 'Player', email: 'player@playroom.local' }),
  logLimit: 20,
  startTime: '2000-01-01T00:00:00.000Z'
});

export const COMMANDS = Object.freeze([
  'status', 'log', 'show', 'diff', 'add', 'commit', 'branch', 'switch',
  'merge', 'rebase', 'reset', 'restore', 'revert', 'cherry-pick',
  'fetch', 'pull', 'push', 'stash', 'reflog'
]);

export const READ_ONLY_COMMANDS = Object.freeze([
  'status', 'log', 'show', 'diff', 'reflog'
]);

export const RESET_MODES = Object.freeze(['soft', 'mixed', 'hard']);
export const STASH_RESTORE_ACTIONS = Object.freeze(['apply', 'pop']);
export const HEAD_TYPES = Object.freeze({ BRANCH: 'branch', DETACHED: 'detached' });

export const ERROR_CODES = Object.freeze({
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  UNIMPLEMENTED_COMMAND: 'UNIMPLEMENTED_COMMAND',
  INVALID_REPOSITORY: 'INVALID_REPOSITORY',
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  EMPTY_MESSAGE: 'EMPTY_MESSAGE',
  NOTHING_STAGED: 'NOTHING_STAGED',
  UNRESOLVED_CONFLICTS: 'UNRESOLVED_CONFLICTS',
  INVALID_REF: 'INVALID_REF',
  UNKNOWN_BRANCH: 'UNKNOWN_BRANCH',
  BRANCH_EXISTS: 'BRANCH_EXISTS',
  DELETE_CURRENT_BRANCH: 'DELETE_CURRENT_BRANCH',
  UNKNOWN_COMMIT: 'UNKNOWN_COMMIT',
  DIRTY_WORKTREE: 'DIRTY_WORKTREE',
  INVALID_MODE: 'INVALID_MODE',
  EMPTY_FILE: 'EMPTY_FILE',
  UNKNOWN_REMOTE: 'UNKNOWN_REMOTE',
  EMPTY_STASH: 'EMPTY_STASH',
  CLEAN_WORKTREE: 'CLEAN_WORKTREE',
  DETACHED_HEAD: 'DETACHED_HEAD',
  NO_REMOTE_BRANCH: 'NO_REMOTE_BRANCH',
  NON_FAST_FORWARD: 'NON_FAST_FORWARD',
  MERGE_CONFLICT: 'MERGE_CONFLICT',
  INVALID_COMMAND: 'INVALID_COMMAND'
});

export const REF_PREFIX = Object.freeze({
  HEAD: 'HEAD',
  BRANCH: 'refs/heads/'
});

export const CONFLICT_MARKERS = Object.freeze({
  START: '<<<<<<< HEAD',
  SEPARATOR: '=======',
  END: '>>>>>>> incoming'
});

export const COMMIT_MESSAGES = Object.freeze({
  MERGE_PREFIX: 'Merge branch ',
  REVERT_PREFIX: 'Revert "',
  REVERT_SUFFIX: '"'
});

export const OPERATION_TYPES = Object.freeze({
  STAGE: 'stage',
  COMMIT: 'commit',
  HEAD: 'head',
  MERGE: 'merge',
  REBASE: 'rebase',
  REF: 'ref',
  REMOTE_REF: 'remote-ref',
  PUSH: 'push',
  STASH: 'stash',
  STASH_APPLY: 'stash-apply'
});
