import {
  createGitEngine,
  validateCommand
} from './engine.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertValid(result, message) {
  assert(result.ok, message);
}

function assertInvalid(result, code, message) {
  assert(!result.valid, message);
  assert(result.error.code === code, `Expected ${code}, received ${result.error.code}`);
}

export function runGitEngineTests() {
  const engine = createGitEngine({
    seed: 'engine-test',
    files: {
      'README.md': '# Test',
      'app.js': 'old'
    }
  });

  const initial = engine.inspect();
  const initialHead = initial.head.commit;

  assert(initial.branches.main === initialHead, 'main should point at HEAD');
  assert(
    initial.workingTree['app.js'] === 'old',
    'working tree should start from HEAD'
  );

  assertInvalid(
    validateCommand(initial, {
      type: 'add',
      params: { file: 'missing.js' }
    }),
    'UNKNOWN_FILE',
    'unknown files must fail validation'
  );

  assertInvalid(
    validateCommand(initial, {
      type: 'branch',
      params: { name: 'main', delete: true }
    }),
    'DELETE_CURRENT_BRANCH',
    'the current branch must not be deletable'
  );

  engine.state.workingTree['app.js'] = 'new';
  assertValid(
    engine.execute({
      type: 'add',
      params: { file: 'app.js' }
    }),
    'add should stage a file'
  );

  const commitResult = engine.execute({
    type: 'commit',
    params: { message: 'Update app' }
  });
  assertValid(commitResult, 'commit should succeed');
  assert(
    engine.inspect().branches.main === commitResult.data.commit.id,
    'main should move to the new commit'
  );

  assertValid(
    engine.execute({
      type: 'branch',
      params: { name: 'feature' }
    }),
    'branch creation should succeed'
  );
  assertValid(
    engine.execute({
      type: 'switch',
      params: { branch: 'feature' }
    }),
    'switch should succeed'
  );

  engine.state.workingTree['feature.js'] = 'feature';
  assertValid(
    engine.execute({
      type: 'add',
      params: { file: 'feature.js' }
    }),
    'new files should be stageable'
  );

  const featureCommit = engine.execute({
    type: 'commit',
    params: { message: 'Add feature' }
  });
  assertValid(featureCommit, 'feature commit should succeed');

  const logResult = engine.execute({
    type: 'log',
    params: { limit: 10 }
  });
  assert(
    logResult.ok && logResult.data.length >= 3,
    'log should expose history'
  );

  assertValid(
    engine.execute({
      type: 'switch',
      params: { branch: 'main' }
    }),
    'switch back to main should succeed'
  );

  const cherryPick = engine.execute({
    type: 'cherry-pick',
    params: { commit: featureCommit.data.commit.id }
  });
  assertValid(cherryPick, 'cherry-pick should create a new commit');
  assert(
    cherryPick.data.commit.id !== featureCommit.data.commit.id,
    'cherry-pick should create a distinct commit'
  );

  const statusResult = engine.execute({ type: 'status' });
  assert(
    statusResult.ok && statusResult.data.clean,
    'status should report a clean tree'
  );

  engine.reset();

  const resetState = engine.inspect();
  assert(
    resetState.head.commit === initialHead,
    'reset should restore the initial repository'
  );

  engine.state.workingTree['app.js'] = 'again';
  assertValid(
    engine.execute({
      type: 'add',
      params: { file: 'app.js' }
    }),
    'add should work after reset'
  );

  const postResetCommit = engine.execute({
    type: 'commit',
    params: { message: 'Post-reset change' }
  });
  assertValid(postResetCommit, 'commit should work after reset');
  assert(
    postResetCommit.data.commit.id === commitResult.data.commit.id,
    'reset should restore deterministic commit sequencing'
  );

  return true;
}
