import { createGitEngine } from './engine.js';
import { evaluateScenario, generateRegisteredScenario, getScenarioTemplates } from './scenarios/index.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const templates = getScenarioTemplates();
assert(templates.length >= 1, 'Git game must expose at least one scenario template.');

for (const template of templates) {
  const scenario = generateRegisteredScenario(template.id, { seed: 'playroom-integration-test' });
  const repository = createGitEngine(scenario.repository);
  const evaluation = evaluateScenario(scenario, repository.snapshot());

  assert(scenario.story, 'Generated scenarios must provide a story.');
  assert(scenario.availableCommands.length > 0, 'Generated scenarios must expose commands.');
  assert(evaluation.complete, 'Generated scenario state must satisfy its initial objectives.');
  assert(Object.isFrozen(scenario), 'Generated scenarios must remain immutable.');
}

console.log('Git Playroom integration scenario tests passed.');
