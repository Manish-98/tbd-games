export const DEFAULTS = Object.freeze({
  seed: 'playroom-git',
  branch: 'main',
  initialFile: 'README.md',
  initialContent: '# Repository',
  initialMessage: 'Initial commit',
  commitPrefix: 'Commit ',
  stashMessage: 'WIP',
  author: Object.freeze({ name: 'Player', email: 'player@playroom.local' }),
  logLimit: 20
});

export const COMMANDS = Object.freeze([
  'status', 'log', 'show', 'diff', 'add', 'commit', 'branch', 'switch',
  'merge', 'rebase', 'reset', 'restore', 'revert', 'cherry-pick',
  'fetch', 'pull', 'push', 'stash', 'reflog'
]);

export const READ_ONLY_COMMANDS = new Set(['status', 'log', 'show', 'diff', 'reflog']);
export const RESET_MODES = new Set(['soft', 'mixed', 'hard']);
export const STASH_RESTORE_ACTIONS = new Set(['apply', 'pop']);
export const HEAD_TYPES = Object.freeze({ BRANCH: 'branch', DETACHED: 'detached' });
