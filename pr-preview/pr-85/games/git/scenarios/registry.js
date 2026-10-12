import { generateScenario } from './template.js';
import { SCENARIO_TEMPLATES } from './templates.js';

const TEMPLATE_BY_ID = Object.freeze(
  Object.fromEntries(
    SCENARIO_TEMPLATES.map(template => [template.id, template])
  )
);

export function getScenarioTemplates() {
  return SCENARIO_TEMPLATES;
}

export function getScenarioTemplate(id) {
  return TEMPLATE_BY_ID[id] || null;
}

export function generateRegisteredScenario(id, options = {}) {
  const template = getScenarioTemplate(id);

  if (!template) {
    throw new RangeError('Unknown Git scenario template: ' + id);
  }

  return generateScenario(template, options);
}
