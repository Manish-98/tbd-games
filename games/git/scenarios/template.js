import { createRandom } from './random.js';
import { createObjective, evaluateObjectives } from './objectives.js';

const REQUIRED_TEMPLATE_FIELDS = Object.freeze([
  'id',
  'story',
  'generate'
]);

const REQUIRED_SCENARIO_FIELDS = Object.freeze([
  'id',
  'templateId',
  'seed',
  'story',
  'parameters',
  'repository',
  'availableCommands',
  'objectives',
  'completionExplanation'
]);

export function defineScenarioTemplate(definition) {
  validateTemplate(definition);

  const template = {
    ...definition,
    objectives: [...(definition.objectives || [])],
    modifiers: [...(definition.modifiers || [])],
    availableCommands: [...(definition.availableCommands || [])]
  };

  return Object.freeze(template);
}

export function generateScenario(template, options = {}) {
  const normalizedTemplate = defineScenarioTemplate(template);
  const seed = String(options.seed ?? normalizedTemplate.seed ?? 'default');
  const random = createRandom(seed);
  const enabledModifiers = resolveModifiers(
    normalizedTemplate.modifiers,
    options.modifiers
  );

  const generated = normalizedTemplate.generate({
    random,
    modifiers: enabledModifiers.map(modifier => modifier.id)
  });

  const scenario = applyModifiers(
    normalizeGeneratedScenario(normalizedTemplate, generated, seed),
    enabledModifiers
  );

  validateScenario(scenario);

  return freezeScenario(scenario);
}

export function evaluateScenario(scenario, repositoryState) {
  validateScenario(scenario);

  return evaluateObjectives(scenario, repositoryState);
}

function normalizeGeneratedScenario(template, generated, seed) {
  if (!generated || typeof generated !== 'object') {
    throw new TypeError('Scenario templates must return an object.');
  }

  return {
    id: template.id + ':' + seed,
    templateId: template.id,
    seed,
    story: generated.story ?? template.story,
    parameters: generated.parameters || {},
    repository: generated.repository || {},
    availableCommands: generated.availableCommands || template.availableCommands,
    objectives: (generated.objectives || template.objectives).map(createObjective),
    completionExplanation:
      generated.completionExplanation ?? template.completionExplanation ?? '',
    concept: generated.concept ?? template.concept ?? null,
    modifiers: generated.modifiers || [],
    metadata: generated.metadata || {}
  };
}

function applyModifiers(scenario, modifiers) {
  return modifiers.reduce(
    (current, modifier) => modifier.apply(current),
    scenario
  );
}

function resolveModifiers(modifiers, requested) {
  const available = new Map(modifiers.map(modifier => [modifier.id, modifier]));
  const ids = requested ?? modifiers.map(modifier => modifier.id);

  if (!Array.isArray(ids)) {
    throw new TypeError('Scenario modifiers must be an array.');
  }

  return ids.map(id => {
    const modifier = available.get(id);

    if (!modifier) {
      throw new RangeError('Unknown scenario modifier: ' + id);
    }

    return modifier;
  });
}

function validateTemplate(template) {
  if (!template || typeof template !== 'object') {
    throw new TypeError('A scenario template is required.');
  }

  for (const field of REQUIRED_TEMPLATE_FIELDS) {
    if (!template[field]) {
      throw new TypeError('Scenario templates require "' + field + '".');
    }
  }

  if (typeof template.generate !== 'function') {
    throw new TypeError('Scenario templates require a generate function.');
  }

  for (const modifier of template.modifiers || []) {
    validateModifier(modifier);
  }
}

function validateScenario(scenario) {
  for (const field of REQUIRED_SCENARIO_FIELDS) {
    if (scenario[field] === undefined) {
      throw new TypeError('Generated scenarios require "' + field + '".');
    }
  }

  if (!Array.isArray(scenario.availableCommands)) {
    throw new TypeError('Scenario availableCommands must be an array.');
  }

  if (!Array.isArray(scenario.objectives) || !scenario.objectives.length) {
    throw new TypeError('Scenarios require at least one objective.');
  }
}

function validateModifier(modifier) {
  if (!modifier || typeof modifier !== 'object') {
    throw new TypeError('Scenario modifiers must be objects.');
  }

  if (!modifier.id || typeof modifier.apply !== 'function') {
    throw new TypeError('Scenario modifiers require an id and apply function.');
  }
}

function freezeScenario(scenario) {
  return Object.freeze({
    ...scenario,
    parameters: Object.freeze(scenario.parameters),
    repository: Object.freeze(scenario.repository),
    availableCommands: Object.freeze([...scenario.availableCommands]),
    objectives: Object.freeze([...scenario.objectives]),
    modifiers: Object.freeze([...scenario.modifiers]),
    metadata: Object.freeze(scenario.metadata)
  });
}
