export function createObjective(definition) {
  validateObjective(definition);

  const { id, description, evaluate } = definition;

  return Object.freeze({
    id,
    description,
    evaluate
  });
}

export function evaluateObjectives(scenario, repositoryState) {
  const results = scenario.objectives.map(objective => (
    evaluateObjective(objective, repositoryState, scenario)
  ));

  return {
    complete: results.every(result => result.satisfied),
    results
  };
}

function evaluateObjective(objective, repositoryState, scenario) {
  const result = objective.evaluate(repositoryState, scenario);

  if (typeof result === 'boolean') {
    return {
      id: objective.id,
      description: objective.description,
      satisfied: result,
      unmet: result ? [] : [{
        id: objective.id,
        description: objective.description
      }]
    };
  }

  if (!result || typeof result.satisfied !== 'boolean') {
    throw new TypeError(
      'Objective "' + objective.id +
      '" must return a boolean or an evaluation result.'
    );
  }

  return {
    id: objective.id,
    description: objective.description,
    satisfied: result.satisfied,
    unmet: result.satisfied ? [] : normalizeUnmet(result.unmet, objective)
  };
}

function normalizeUnmet(unmet, objective) {
  if (Array.isArray(unmet) && unmet.length) return unmet;

  return [{
    id: objective.id,
    description: objective.description
  }];
}

function validateObjective(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('An objective definition is required.');
  }

  if (!definition.id || !definition.description) {
    throw new TypeError('Objectives require an id and description.');
  }

  if (typeof definition.evaluate !== 'function') {
    throw new TypeError('Objectives require a state evaluation function.');
  }
}
