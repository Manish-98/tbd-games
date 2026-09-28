import { createGitEngine } from '../engine.js';
import {
  createObjective,
  defineScenarioTemplate,
  evaluateScenario,
  generateScenario
} from './index.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const template = defineScenarioTemplate({
  id: 'branch-recovery',
  story: 'Recover the feature branch.',
  availableCommands: ['status', 'branch', 'switch', 'reset'],
  completionExplanation: 'The target branch now points at the required commit.',
  generate({ random }) {
    const branch = 'feature/' +
      random.pick(['payments', 'search', 'checkout']);
    const depth = random.int(2, 4);

    return {
      parameters: { branch, depth },
      repository: {
        seed: 'scenario-test',
        history: Array.from({ length: depth }, (_, index) => ({
          ['file-' + index + '.txt']: 'change-' + index
        }))
      },
      objectives: [createObjective({
        id: 'history-exists',
        description: 'The generated repository contains the requested history.',
        evaluate(state) {
          const satisfied = Object.keys(state.commits).length === depth + 1;

          return {
            satisfied,
            unmet: satisfied ? [] : [{
              id: 'history-exists',
              description: 'Repository history must contain the generated commits.',
              expected: depth + 1,
              actual: Object.keys(state.commits).length
            }]
          };
        }
      })]
    };
  }
});

const first = generateScenario(template, { seed: 'alpha' });
const second = generateScenario(template, { seed: 'alpha' });
const different = generateScenario(template, { seed: 'beta' });

assert(
  JSON.stringify(first) === JSON.stringify(second),
  'the same seed must produce the same scenario'
);
assert(
  JSON.stringify(first) !== JSON.stringify(different),
  'different seeds should produce different scenarios'
);
assert(
  first.parameters.branch !== undefined &&
  first.parameters.depth >= 2 &&
  first.enabledModifiers.length === 0,
  'generated parameters must satisfy the template constraints'
);

const repository = createGitEngine(first.repository);
const evaluation = evaluateScenario(first, repository.inspect());

assert(evaluation.complete, 'generated repository should satisfy its objectives');

const failed = evaluateScenario(first, {
  ...repository.inspect(),
  branches: {}
});

assert(!failed.complete, 'failed objectives must report an incomplete scenario');
assert(
  failed.results[0].unmet[0].expected === first.parameters.depth + 1,
  'failed objectives must expose structured unmet conditions'
);

console.log('Git scenario framework tests passed.');


const modifiedTemplate = defineScenarioTemplate({
  id: 'modifier-check',
  story: 'Test modifier support.',
  availableCommands: ['status'],
  modifiers: [{
    id: 'extra-file',
    apply(scenario) {
      return {
        ...scenario,
        repository: {
          ...scenario.repository,
          files: {
            ...scenario.repository.files,
            'noise.txt': 'noise'
          }
        }
      };
    }
  }],
  generate() {
    return {
      repository: {
        files: { 'README.md': '# Scenario' }
      },
      objectives: [createObjective({
        id: 'repository-ready',
        description: 'The repository contains the generated file.',
        evaluate(state) {
          return Boolean(state.workingTree['README.md']);
        }
      })]
    };
  }
});

const modified = generateScenario(modifiedTemplate, { seed: 'modifier' });

assert(
  modified.enabledModifiers[0] === 'extra-file',
  'enabled modifiers must be recorded'
);
assert(
  Object.isFrozen(modified.repository) &&
  Object.isFrozen(modified.repository.files),
  'generated repository data must be immutable'
);

console.log('Git scenario modifier tests passed.');
