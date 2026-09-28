import { COMMANDS, RESET_MODES } from './constants.js';
import { validateCommand } from './validation.js';
import { clone } from './utils.js';

const PARAMETER_TYPES = Object.freeze({
  SELECT: 'select',
  TEXT: 'text',
  TOGGLE: 'toggle',
  NUMBER: 'number'
});

const COMMAND_DEFINITIONS = Object.freeze([
  createDefinition('status', 'Status', 'git status', 'Show HEAD, staged changes, unstaged changes, and conflicts.'),
  createDefinition('log', 'Log', 'git log', 'Show commits reachable from a starting commit.', [
    parameter('commit', 'Starting commit', PARAMETER_TYPES.SELECT, false, optionalCommitOptions),
    parameter('limit', 'Maximum entries', PARAMETER_TYPES.NUMBER)
  ]),
  createDefinition('show', 'Show', 'git show', 'Show a commit and references pointing to it.', [
    parameter('commit', 'Commit', PARAMETER_TYPES.SELECT, true, commitOptions)
  ]),
  createDefinition('diff', 'Diff', 'git diff', 'Show changes between HEAD and the working tree.', [
    parameter('file', 'File', PARAMETER_TYPES.SELECT, false, optionalFileOptions)
  ]),
  createDefinition('add', 'Add', 'git add', 'Stage changes for a file.', [
    parameter('file', 'File', PARAMETER_TYPES.SELECT, true, fileOptions)
  ]),
  createDefinition('commit', 'Commit', 'git commit -m', 'Create a commit from staged changes.', [
    parameter('message', 'Commit message', PARAMETER_TYPES.TEXT, true, null, {
      formatPrefix: '-m'
    })
  ]),
  createDefinition('branch', 'Branch', 'git branch', 'Create or delete a branch, optionally starting from a commit.', [
    parameter('name', 'Branch name', PARAMETER_TYPES.TEXT, true),
    parameter('delete', 'Delete branch', PARAMETER_TYPES.TOGGLE),
    parameter('startPoint', 'Start point', PARAMETER_TYPES.SELECT, false, optionalCommitOptions, {
      visibleWhen: params => !params.delete
    })
  ]),
  createDefinition('switch', 'Switch', 'git switch', 'Move HEAD to an existing branch.', [
    parameter('branch', 'Branch', PARAMETER_TYPES.SELECT, true, branchOptions)
  ]),
  createDefinition('merge', 'Merge', 'git merge', 'Merge another branch into the current branch.', [
    parameter('branch', 'Branch', PARAMETER_TYPES.SELECT, true, branchOptions)
  ]),
  createDefinition('rebase', 'Rebase', 'git rebase', 'Replay the current branch on top of another branch.', [
    parameter('branch', 'Branch', PARAMETER_TYPES.SELECT, true, branchOptions)
  ]),
  createDefinition('reset', 'Reset', 'git reset', 'Move the current branch and optionally update the index and working tree.', [
    parameter('mode', 'Reset mode', PARAMETER_TYPES.SELECT, false, resetModeOptions),
    parameter('commit', 'Commit', PARAMETER_TYPES.SELECT, true, commitOptions)
  ]),
  createDefinition('restore', 'Restore', 'git restore', 'Restore a file from the current tree or a selected commit.', [
    parameter('file', 'File', PARAMETER_TYPES.SELECT, true, fileOptions),
    parameter('source', 'Source commit', PARAMETER_TYPES.SELECT, false, optionalCommitOptions)
  ]),
  createDefinition('revert', 'Revert', 'git revert', 'Create a new commit that reverses a selected commit.', [
    parameter('commit', 'Commit', PARAMETER_TYPES.SELECT, true, commitOptions)
  ]),
  createDefinition('cherry-pick', 'Cherry-pick', 'git cherry-pick', 'Apply the changes introduced by a selected commit.', [
    parameter('commit', 'Commit', PARAMETER_TYPES.SELECT, true, commitOptions)
  ]),
  createDefinition('fetch', 'Fetch', 'git fetch', 'Update remote-tracking references from a remote.', [
    parameter('remote', 'Remote', PARAMETER_TYPES.SELECT, true, remoteOptions)
  ]),
  createDefinition('pull', 'Pull', 'git pull', 'Fetch from a remote and integrate its tracked branch.', [
    parameter('remote', 'Remote', PARAMETER_TYPES.SELECT, true, remoteOptions)
  ]),
  createDefinition('push', 'Push', 'git push', 'Update a remote branch from a local branch.', [
    parameter('remote', 'Remote', PARAMETER_TYPES.SELECT, true, remoteOptions),
    parameter('branch', 'Branch', PARAMETER_TYPES.SELECT, false, branchOptions)
  ]),
  createDefinition('stash', 'Stash', 'git stash', 'Save local changes temporarily or restore the latest stash.', [
    parameter('action', 'Action', PARAMETER_TYPES.SELECT, false, stashActionOptions),
    parameter('message', 'Message', PARAMETER_TYPES.TEXT, false, null, {
      visibleWhen: params => !params.action || params.action === 'push'
    })
  ]),
  createDefinition('reflog', 'Reflog', 'git reflog', 'Show recorded reference movements.')
]);

const DEFINITION_BY_TYPE = new Map(
  COMMAND_DEFINITIONS.map(definition => [definition.type, definition])
);

export { PARAMETER_TYPES };

export function getCommandDefinitions() {
  return COMMAND_DEFINITIONS;
}

export function getCommandDefinition(type) {
  return DEFINITION_BY_TYPE.get(type) || null;
}

export function searchCommands(query = '', availableCommands = COMMANDS) {
  const normalizedQuery = String(query).trim().toLowerCase();
  const allowed = new Set(availableCommands);

  return COMMAND_DEFINITIONS.filter(definition => {
    if (!allowed.has(definition.type)) return false;
    if (!normalizedQuery) return true;

    return [
      definition.type,
      definition.label,
      definition.syntax,
      definition.explanation
    ].some(value => value.toLowerCase().includes(normalizedQuery));
  });
}

export function createCommandBuilder(type, repositoryState = {}) {
  const definition = getCommandDefinition(type);

  if (!definition) {
    throw new RangeError('Unknown command definition: ' + type);
  }

  return {
    type,
    params: Object.fromEntries(
      definition.parameters
        .filter(item => item.default !== undefined)
        .map(item => [item.name, item.default(repositoryState)])
    )
  };
}

export function updateCommandParameter(builder, name, value) {
  const definition = getCommandDefinition(builder?.type);

  if (!definition) {
    throw new TypeError('A valid command builder is required.');
  }

  if (!definition.parameters.some(item => item.name === name)) {
    throw new RangeError('Unknown parameter: ' + name);
  }

  return {
    ...builder,
    params: {
      ...builder.params,
      [name]: value
    }
  };
}

export function getParameterOptions(type, name, repositoryState) {
  const definition = getCommandDefinition(type);
  const item = definition?.parameters.find(parameter => parameter.name === name);

  if (!item) {
    throw new RangeError('Unknown command parameter: ' + name);
  }

  return item.options ? item.options(repositoryState) : [];
}

export function validateCommandBuilder(builder, repositoryState) {
  const definition = getCommandDefinition(builder?.type);

  if (!definition) {
    return invalid('INVALID_BUILDER', 'A valid command builder is required.');
  }

  const params = builder.params || {};
  const errors = [];

  for (const item of definition.parameters) {
    if (!isVisible(item, params)) continue;

    const value = params[item.name];

    if (item.required && isEmpty(value)) {
      errors.push({
        parameter: item.name,
        code: 'REQUIRED',
        message: item.label + ' is required.'
      });
      continue;
    }

    if (isEmpty(value)) continue;

    validateParameterType(item, value, errors);
    validateParameterOptions(item, value, repositoryState, errors);
  }

  if (errors.length) {
    return { valid: false, errors };
  }

  const result = validateCommand(repositoryState, {
    type: builder.type,
    params
  });

  return result.valid
    ? { valid: true, command: result.command }
    : {
        valid: false,
        errors: [{
          parameter: null,
          code: result.error.code,
          message: result.error.message
        }]
      };
}

export function formatCommand(command) {
  const definition = getCommandDefinition(command?.type);

  if (!definition) return '';

  const values = definition.parameters
    .filter(item => isVisible(item, command.params || {}))
    .filter(item => !isEmpty(command.params?.[item.name]))
    .map(item => formatParameter(item, command.params[item.name]))
    .filter(Boolean);

  return [definition.syntax, ...values].join(' ');
}

export function createCommandController(repository, availableCommands = COMMANDS) {
  if (
    !repository ||
    typeof repository.snapshot !== 'function' ||
    typeof repository.execute !== 'function' ||
    typeof repository.reset !== 'function'
  ) {
    throw new TypeError('A GitRepository instance is required.');
  }

  let builder = null;
  let history = [];

  return {
    listCommands(query = '') {
      return searchCommands(query, availableCommands);
    },

    selectCommand(type) {
      if (!availableCommands.includes(type)) {
        throw new RangeError(
          'Command is not available in this scenario: ' + type
        );
      }

      builder = createCommandBuilder(type, repository.snapshot());
      return clone(builder);
    },

    getBuilder() {
      return builder ? clone(builder) : null;
    },

    setParameter(name, value) {
      if (!builder) {
        throw new TypeError('Select a command before setting parameters.');
      }

      builder = updateCommandParameter(builder, name, value);
      return clone(builder);
    },

    validate() {
      if (!builder) {
        return invalid('NO_COMMAND', 'Select a command before execution.');
      }

      return validateCommandBuilder(builder, repository.snapshot());
    },

    execute() {
      const validation = this.validate();

      if (!validation.valid) return validation;

      const command = clone(validation.command);
      const result = repository.execute(command);

      if (result.ok) {
        history = history.concat({
          command,
          display: formatCommand(command),
          result: clone(result)
        });
        builder = null;
      }

      return {
        ...result,
        command
      };
    },

    getHistory() {
      return clone(history);
    },

    reset() {
      repository.reset();
      builder = null;
      history = [];
      return repository.snapshot();
    }
  };
}

function createDefinition(type, label, syntax, explanation, parameters = []) {
  return Object.freeze({
    type,
    label,
    syntax,
    explanation,
    parameters: Object.freeze(parameters)
  });
}

function parameter(
  name,
  label,
  type,
  required = false,
  options = null,
  metadata = {}
) {
  return Object.freeze({
    name,
    label,
    type,
    required,
    options,
    ...metadata
  });
}

function validateParameterType(item, value, errors) {
  if (
    item.type === PARAMETER_TYPES.NUMBER &&
    (!Number.isFinite(Number(value)) || Number(value) < 1)
  ) {
    errors.push({
      parameter: item.name,
      code: 'INVALID_NUMBER',
      message: item.label + ' must be a positive number.'
    });
  }

  if (item.type === PARAMETER_TYPES.TOGGLE && typeof value !== 'boolean') {
    errors.push({
      parameter: item.name,
      code: 'INVALID_BOOLEAN',
      message: item.label + ' must be a boolean.'
    });
  }
}

function validateParameterOptions(item, value, state, errors) {
  if (!item.options) return;

  const values = item.options(state).map(option => option.value);

  if (!values.includes(value)) {
    errors.push({
      parameter: item.name,
      code: 'INVALID_OPTION',
      message: item.label + ' has an invalid selection.'
    });
  }
}

function isVisible(item, params) {
  return item.visibleWhen ? item.visibleWhen(params) : true;
}

function formatParameter(item, value) {
  if (item.type === PARAMETER_TYPES.TOGGLE) {
    return value ? '--delete' : '';
  }

  if (item.formatPrefix) {
    return item.formatPrefix + ' ' + String(value);
  }

  if (item.name === 'action' && value !== 'push') {
    return value;
  }

  return String(value);
}

function isEmpty(value) {
  return value === undefined || value === null || value === '';
}

function invalid(code, message) {
  return {
    valid: false,
    errors: [{ parameter: null, code, message }]
  };
}

function optionsFromEntries(entries) {
  return entries.map(([value, label]) => ({ value, label }));
}

function branchOptions(state) {
  return optionsFromEntries(
    Object.keys(state.branches || {}).map(name => [name, name])
  );
}

function commitOptions(state) {
  return optionsFromEntries(
    Object.values(state.commits || {}).map(commit => [
      commit.id,
      commit.id.slice(0, 7) + ' — ' + commit.message
    ])
  );
}

function fileOptions(state) {
  const files = new Set([
    ...Object.keys(state.workingTree || {}),
    ...Object.keys(state.commits?.[state.head?.commit]?.tree || {})
  ]);

  return optionsFromEntries(
    [...files].sort().map(file => [file, file])
  );
}

function remoteOptions(state) {
  return optionsFromEntries(
    Object.keys(state.remotes || {}).map(name => [name, name])
  );
}

function optionalCommitOptions(state) {
  return [{ value: '', label: 'Current HEAD' }, ...commitOptions(state)];
}

function optionalFileOptions(state) {
  return [{ value: '', label: 'All files' }, ...fileOptions(state)];
}

function resetModeOptions() {
  return RESET_MODES.map(value => ({ value, label: value }));
}

function stashActionOptions() {
  return [
    { value: 'push', label: 'Save changes' },
    { value: 'apply', label: 'Apply latest stash' },
    { value: 'pop', label: 'Apply and remove latest stash' }
  ];
}
