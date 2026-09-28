import { createGitEngine, validateCommand } from './engine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function runGitEngineTests() {
  const engine = createGitEngine({
    seed: 'engine-test',
    files: { 'README.md': '# Test', 'app.js': 'old' }
  });

  const initial = engine.inspect();
  const main = initial.head.commit;

  assert(initial.branches.main === main, 'main should point at HEAD');
  assert(initial.workingTree['app.js'] === 'old', 'working tree should start from HEAD');
  assert(!validateCommand(initial, { type: 'add', params: { file: 'missing.js' } }).valid, 'unknown files must fail validation');

  engine.state.workingTree['app.js'] = 'new';
  assert(engine.execute({ type: 'add', params: { file: 'app.js' } }).ok, 'add should stage a file');

  const commitResult = engine.execute({ type: 'commit', params: { message: 'Update app' } });
  assert(commitResult.ok, 'commit should succeed');
  assert(engine.inspect().branches.main === commitResult.data.commit.id, 'main should move to the new commit');

  assert(engine.execute({ type: 'branch', params: { name: 'feature' } }).ok, 'branch creation should succeed');
  assert(engine.execute({ type: 'switch', params: { branch: 'feature' } }).ok, 'switch should succeed');

  engine.state.workingTree['feature.js'] = 'feature';
  engine.execute({ type: 'add', params: { file: 'feature.js' } });
  const featureCommit = engine.execute({ type: 'commit', params: { message: 'Add feature' } });
  assert(featureCommit.ok, 'feature commit should succeed');

  const logResult = engine.execute({ type: 'log', params: { limit: 10 } });
  assert(logResult.ok && logResult.data.length >= 3, 'log should expose history');

  assert(engine.execute({ type: 'switch', params: { branch: 'main' } }).ok, 'switch back to main should succeed');

  const cherryPick = engine.execute({ type: 'cherry-pick', params: { commit: featureCommit.data.commit.id } });
  assert(cherryPick.ok, 'cherry-pick should create a new commit');
  assert(cherryPick.data.commit.id !== featureCommit.data.commit.id, 'cherry-pick should create a distinct commit');

  const statusResult = engine.execute({ type: 'status' });
  assert(statusResult.ok && statusResult.data.clean, 'status should report a clean tree');

  engine.reset();
  assert(engine.inspect().head.commit === main, 'reset should restore the initial repository');
  return true;
}
