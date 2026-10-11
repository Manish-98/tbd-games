import { buildCommitGraph } from './visualization-layout.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fixture(commits) {
  return {
    commits: Object.fromEntries(commits.map(commit => [commit.id, {
      date: '2026-01-01T00:00:00.000Z',
      parents: [],
      ...commit
    }]))
  };
}

export function runGitVisualizationLayoutTests() {
  const linear = buildCommitGraph(fixture([
    { id: 'a', parents: [] },
    { id: 'b', parents: ['a'] },
    { id: 'c', parents: ['b'] }
  ]));
  assert(linear.positions.get('a').y < linear.positions.get('b').y, 'parents must precede children');
  assert(linear.positions.get('b').y < linear.positions.get('c').y, 'linear history must be topologically ordered');
  assert(linear.lanes.get('a') === linear.lanes.get('b') && linear.lanes.get('b') === linear.lanes.get('c'),
    'linear history should stay in one lane');

  const branched = buildCommitGraph(fixture([
    { id: 'base', parents: [] },
    { id: 'main-1', parents: ['base'], date: '2026-01-02' },
    { id: 'feature-1', parents: ['base'], date: '2026-01-03' },
    { id: 'main-2', parents: ['main-1'], date: '2026-01-04' },
    { id: 'merge', parents: ['main-2', 'feature-1'], date: '2026-01-05' }
  ]));
  assert(branched.lanes.get('main-1') !== branched.lanes.get('feature-1'),
    'diverging child histories must use distinct lanes');
  assert(branched.positions.get('main-2').y < branched.positions.get('merge').y,
    'merge must follow its first parent');
  assert(branched.positions.get('feature-1').y < branched.positions.get('merge').y,
    'merge must follow its second parent');
  assert(branched.positions.get('main-1').y < branched.positions.get('main-2').y,
    'topology must take precedence over dates');

  const disconnected = buildCommitGraph(fixture([
    { id: 'root-a', parents: [] },
    { id: 'root-b', parents: [] },
    { id: 'child-b', parents: ['root-b'] }
  ]));
  assert(disconnected.lanes.get('root-a') !== disconnected.lanes.get('root-b'),
    'disconnected histories should be visually separated');
  assert(disconnected.positions.get('root-b').y < disconnected.positions.get('child-b').y,
    'each disconnected history must retain parent ordering');

  const repeated = buildCommitGraph(fixture([
    { id: 'a', parents: [] },
    { id: 'b', parents: ['a'] },
    { id: 'c', parents: ['a'] },
    { id: 'd', parents: ['b', 'c'] }
  ]));
  const repeatedAgain = buildCommitGraph(fixture([
    { id: 'a', parents: [] },
    { id: 'b', parents: ['a'] },
    { id: 'c', parents: ['a'] },
    { id: 'd', parents: ['b', 'c'] }
  ]));
  assert(JSON.stringify([...repeated.positions]) === JSON.stringify([...repeatedAgain.positions]),
    'equivalent graph input should produce deterministic coordinates');
  return true;
}
