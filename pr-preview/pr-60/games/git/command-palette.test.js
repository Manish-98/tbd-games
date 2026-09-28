import { COMMANDS } from './constants.js';
import { createGitEngine } from './engine.js';
import {
  createCommandBuilder,
  createCommandController,
  formatCommand,
  getCommandDefinition,
  getCommandDefinitions,
  getParameterOptions,
  searchCommands,
  updateCommandParameter,
  validateCommandBuilder
} from './command-palette.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testDefinitions() {
  const definitions = getCommandDefinitions();
  const types = definitions.map(definition => definition.type);

  assert(definitions.length === COMMANDS.length, 'Every engine command must have a palette definition.');
  assert(new Set(types).size === types.length, 'Command definitions must be unique.');
  assert(
    COMMANDS.every(type => types.includes(type)),
    'Every engine command must have a palette definition.'
  );
  assert(
    definitions.every(definition => definition.explanation),
    'Every command must expose an explanation.'
  );
}

function testSearchAndBuilder() {
  const repository = createGitEngine();
  const results = searchCommands('merge');

  assert(results.length === 1 && results[0].type === 'merge', 'Search should find merge.');

  const builder = createCommandBuilder('commit', repository.snapshot());
  assert(builder.type === 'commit', 'Builder should preserve command type.');

  const updated = updateCommandParameter(builder, 'message', 'Add feature');
  assert(updated.params.message === 'Add feature', 'Builder should update parameters.');
}

function testContextOptionsAndValidation() {
  const repository = createGitEngine({
    branches: { feature: 'not-used-yet' },
    remotes: { origin: { branches: {} } }
  });
  const state = repository.snapshot();

  assert(
    getParameterOptions('switch', 'branch', state).some(
      option => option.value === 'feature'
    ),
    'Branch options should come from repository state.'
  );

  const builder = updateCommandParameter(
    createCommandBuilder('switch', state),
    'branch',
    'missing'
  );

  const validation = validateCommandBuilder(builder, state);
  assert(!validation.valid, 'Unknown branch should be blocked before execution.');
}

function testBuilderValidation() {
  const repository = createGitEngine();
  const state = repository.snapshot();

  const missingMessage = validateCommandBuilder(
    createCommandBuilder('commit', state),
    state
  );

  assert(!missingMessage.valid, 'Required commit message should be validated.');
  assert(
    missingMessage.errors[0].code === 'REQUIRED',
    'Required validation should identify the parameter.'
  );

  const invalidLimit = updateCommandParameter(
    createCommandBuilder('log', state),
    'limit',
    'not-a-number'
  );

  const validation = validateCommandBuilder(invalidLimit, state);
  assert(!validation.valid, 'Invalid numeric parameters should be blocked.');
  assert(
    validation.errors[0].code === 'INVALID_NUMBER',
    'Numeric validation should identify invalid values.'
  );
}

function testResetModes() {
  const repository = createGitEngine();
  const state = repository.snapshot();

  const defaultMode = validateCommandBuilder(
    updateCommandParameter(
      createCommandBuilder('reset', state),
      'commit',
      state.head.commit
    ),
    state
  );
  assert(defaultMode.valid, 'Reset should allow the engine default mode when omitted.');
  assert(defaultMode.command.params.mode === undefined, 'Omitted reset mode should remain omitted.');

  for (const mode of ['soft', 'mixed', 'hard']) {
    const builder = updateCommandParameter(
      updateCommandParameter(createCommandBuilder('reset', state), 'mode', mode),
      'commit',
      state.head.commit
    );
    const validation = validateCommandBuilder(builder, state);
    assert(validation.valid, 'Reset should accept the ' + mode + ' mode.');
    assert(validation.command.params.mode === mode, 'Reset should preserve the selected mode.');
  }

  const invalidMode = updateCommandParameter(
    updateCommandParameter(createCommandBuilder('reset', state), 'mode', 'invalid'),
    'commit',
    state.head.commit
  );
  const validation = validateCommandBuilder(invalidMode, state);
  assert(!validation.valid, 'Reset should reject unsupported modes.');
  assert(
    validation.errors[0].code === 'INVALID_OPTION',
    'Reset mode validation should identify invalid selections.'
  );
}

function testToggleAndConditionalParameters() {
  const repository = createGitEngine({
    branches: { feature: 'not-used-yet' }
  });
  const state = repository.snapshot();

  const createBranch = updateCommandParameter(
    updateCommandParameter(createCommandBuilder('branch', state), 'name', 'new-feature'),
    'delete',
    false
  );
  const validCreate = validateCommandBuilder(createBranch, state);
  assert(validCreate.valid, 'Branch creation should validate with the delete toggle disabled.');

  const deleteBranch = updateCommandParameter(
    updateCommandParameter(createCommandBuilder('branch', state), 'name', 'feature'),
    'delete',
    true
  );
  const validDelete = validateCommandBuilder(deleteBranch, state);
  assert(validDelete.valid, 'Branch deletion should validate with the delete toggle enabled.');

  const invalidDelete = updateCommandParameter(
    updateCommandParameter(deleteBranch, 'startPoint', 'missing'),
    'delete',
    true
  );
  const validation = validateCommandBuilder(invalidDelete, state);
  assert(
    validation.valid,
    'Hidden start points should be ignored when deleting a branch.'
  );
  assert(
    validation.command.params.startPoint === undefined,
    'Hidden start points should not be passed to the Git command.'
  );

  const invalidToggle = updateCommandParameter(
    updateCommandParameter(createCommandBuilder('branch', state), 'name', 'new-feature'),
    'delete',
    'true'
  );
  const toggleValidation = validateCommandBuilder(invalidToggle, state);
  assert(!toggleValidation.valid, 'Toggle parameters should reject non-boolean values.');
  assert(
    toggleValidation.errors[0].code === 'INVALID_BOOLEAN',
    'Toggle validation should identify invalid values.'
  );
}

function testExecutionHistoryAndReset() {
  const repository = createGitEngine();
  const controller = createCommandController(repository);

  const builder = controller.selectCommand('status');
  assert(builder.type === 'status', 'Selecting a command should create a builder.');

  const result = controller.execute();
  assert(result.ok, 'A valid status command should execute.');

  const history = controller.getHistory();
  assert(history.length === 1, 'Read-only commands should appear in command history.');
  assert(history[0].display === 'git status', 'History should contain a readable command.');
  assert(result.data?.head, 'Read-only command results should remain available to the UI.');

  controller.selectCommand('reflog');
  const reflogResult = controller.execute();
  assert(reflogResult.ok, 'A valid reflog command should execute.');
  assert(Array.isArray(reflogResult.data), 'Reflog execution should return structured inspection data.');

  controller.selectCommand('log');
  controller.setParameter('limit', 1);
  assert(controller.execute().ok, 'A valid numeric parameter should execute.');

  controller.selectCommand('commit');
  controller.setParameter('message', 'should fail');
  assert(!controller.validate().valid, 'Commit without staging should be blocked.');

  controller.reset();
  assert(controller.getHistory().length === 0, 'Reset should clear command history.');
  assert(controller.getBuilder() === null, 'Reset should clear the active builder.');
}

function testEngineFailuresArePreserved() {
  const repository = createGitEngine();
  const controller = createCommandController(repository);

  controller.selectCommand('stash');
  const result = controller.execute();

  assert(!result.ok, 'A valid stash command should preserve the Git failure.');
  assert(result.error.code === 'CLEAN_WORKTREE', 'Git failure must remain a Git error.');
}

function testFormatting() {
  assert(
    formatCommand({ type: 'switch', params: { branch: 'feature' } }) === 'git switch feature',
    'Command formatting should be readable.'
  );
  assert(
    formatCommand({ type: 'commit', params: { message: 'Add feature' } }) === 'git commit -m Add feature',
    'Commit formatting should preserve -m.'
  );
}

[
  testDefinitions,
  testSearchAndBuilder,
  testContextOptionsAndValidation,
  testBuilderValidation,
  testResetModes,
  testToggleAndConditionalParameters,
  testExecutionHistoryAndReset,
  testEngineFailuresArePreserved,
  testFormatting
].forEach(test => test());
