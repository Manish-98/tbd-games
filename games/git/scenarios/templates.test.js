import { createGitEngine } from '../engine.js';
import { evaluateScenario } from './template.js';
import {
  generateRegisteredScenario,
  getScenarioTemplate,
  getScenarioTemplates
} from './registry.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(callback, expectedError, message) {
  try {
    callback();
  } catch (error) {
    assert(error instanceof expectedError, message);
    return;
  }

  throw new Error(message);
}

const templates = getScenarioTemplates();

assert(templates.length === 4, 'the initial scenario set must contain four templates');
assert(
  new Set(templates.map(template => template.id)).size === templates.length,
  'scenario template ids must be unique'
);

for (const template of templates) {
  const first = generateRegisteredScenario(template.id, { seed: 'playability' });
  const second = generateRegisteredScenario(template.id, { seed: 'playability' });

  assert(
    JSON.stringify(first) === JSON.stringify(second),
    template.id + ' must generate deterministically for the same seed'
  );
  assert(
    first.story.includes(first.parameters.branch || '') ||
      first.story.length > 0,
    template.id + ' must provide a player-facing story'
  );
  assert(
    first.availableCommands.length > 0,
    template.id + ' must expose at least one command'
  );
  assert(
    first.objectives.length > 0,
    template.id + ' must define at least one objective'
  );

  const repository = createGitEngine(first.repository);
  const initial = evaluateScenario(first, repository.inspect());

  assert(!initial.complete, template.id + ' should not start completed');
}

const recovery = generateRegisteredScenario('missing-feature', { seed: 'recovery' });
const recoveryRepo = createGitEngine(recovery.repository);
const recoveryTarget = recoveryRepo.inspect().reflog[0].oldValue;
const recoveryResult = recoveryRepo.execute({
  type: 'branch',
  params: {
    name: recovery.parameters.branch,
    startPoint: recoveryTarget
  }
});
assert(recoveryResult.ok, 'missing-feature must be completable with branch recovery');
assert(
  evaluateScenario(recovery, recoveryRepo.inspect()).complete,
  'missing-feature objective must pass after recovery'
);

const merge = generateRegisteredScenario('friday-afternoon-merge', { seed: 'merge' });
const mergeRepo = createGitEngine(merge.repository);
const mergeResult = mergeRepo.execute({
  type: 'merge',
  params: { branch: 'main' }
});
assert(mergeResult.ok, 'friday-afternoon-merge must allow a clean merge');
assert(
  evaluateScenario(merge, mergeRepo.inspect()).complete,
  'friday-afternoon-merge objective must pass after integration'
);

const presentable = generateRegisteredScenario('presentable-pr', { seed: 'rebase' });
const presentableRepo = createGitEngine(presentable.repository);
const rebaseResult = presentableRepo.execute({
  type: 'rebase',
  params: { branch: 'main' }
});
assert(rebaseResult.ok, 'presentable-pr must allow rebasing onto the target branch');
assert(
  evaluateScenario(presentable, presentableRepo.inspect()).complete,
  'presentable-pr objective must pass after rebasing'
);

const teammate = generateRegisteredScenario('teammate-got-there-first', { seed: 'remote' });
const teammateRepo = createGitEngine(teammate.repository);
const pullResult = teammateRepo.execute({
  type: 'pull',
  params: { remote: 'origin' }
});
assert(pullResult.ok, 'teammate-got-there-first must allow remote reconciliation');
assert(
  evaluateScenario(teammate, teammateRepo.inspect()).complete,
  'teammate-got-there-first objective must pass after reconciliation'
);

assert(
  getScenarioTemplate('missing-feature')?.id === 'missing-feature',
  'registered scenario lookup must return the requested template'
);
assert(
  getScenarioTemplate('unknown') === null,
  'unknown scenario lookup must return null'
);
assertThrows(
  () => generateRegisteredScenario('unknown'),
  RangeError,
  'unknown scenario generation must fail clearly'
);

console.log('Git scenario template tests passed.');
