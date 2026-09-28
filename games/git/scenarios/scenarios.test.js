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
        id: 'branch-exists',
        description: 'The generated feature branch exists.',
        evaluate(state) {
          const satisfied = Boolean(state.branches[branch]);

          return {
            satisfied,
            unmet: satisfied ? [] : [{
              id: 'branch-exists',
              description: 'Branch ' + branch + ' must exist.',
              expected: true,
              actual: false
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
  first.parameters.depth >= 2,
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
  failed.results[0].unmet[0].expected === true,
  'failed objectives must expose structured unmet conditions'
);

console.log('Git scenario framework tests passed.');
