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

function sameSnapshot(left, right, message) {
  assert(
    JSON.stringify(left) === JSON.stringify(right),
    message
  );
}

export function runGitEngineTests() {
  const input = {
    seed: 'engine-test',
    reflog: [{
      id: 7,
      ref: 'refs/heads/recovered',
      oldValue: 'abc123',
      newValue: null,
      reason: 'branch deleted',
      timestamp: '2000-01-01T00:00:00.000Z'
    }],
    files: {
      'README.md': '# Test',
      'app.js': 'old'
    },
    workingTree: {
      'README.md': '# Test',
      'app.js': 'new',
      'feature.js': 'feature'
    }
  };

  const engine = createGitEngine(input);
  const initial = engine.inspect();
  const initialHead = initial.head.commit;

  assert(initial.branches.main === initialHead, 'main should point at HEAD');
  assert(
    initial.reflog[0].ref === 'refs/heads/recovered',
    'repository fixtures should preserve seeded reflog entries'
  );
  assert(
    initial.workingTree['app.js'] === 'new',
    'working tree should preserve the supplied fixture'
  );

  assertInvalid(
    validateCommand(initial, 'status'),
    'INVALID_COMMAND',
    'raw command strings must not cross the engine boundary'
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

  const statusResult = engine.execute({ type: 'status', params: {} });
  assert(
    statusResult.ok && statusResult.data.clean,
    'status should report a clean tree'
  );

  const resetResult = engine.execute({
    type: 'reset',
    params: { commit: initialHead, mode: 'mixed' }
  });
  assertValid(resetResult, 'reset should succeed');

  const resetState = engine.inspect();
  assert(
    resetState.head.commit === initialHead,
    'reset should restore the initial repository HEAD'
  );

  assertValid(
    engine.execute({
      type: 'add',
      params: { file: 'app.js' }
    }),
    'add should work after a mixed reset'
  );

  const postResetCommit = engine.execute({
    type: 'commit',
    params: { message: 'Update app' }
  });
  assertValid(postResetCommit, 'commit should work after reset');
  assert(
    postResetCommit.data.commit.id === commitResult.data.commit.id,
    'reset should restore deterministic commit sequencing'
  );

  const first = createGitEngine(input).inspect();
  const second = createGitEngine(input).inspect();
  sameSnapshot(
    first,
    second,
    'identical repository inputs should produce identical snapshots'
  );

  return true;
}
