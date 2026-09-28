import { createGitEngine } from '../engine.js';
import { createRandom } from './random.js';
import {
  createObjective,
  defineScenarioTemplate,
  evaluateScenario,
  generateRegisteredScenario,
  generateScenario
} from './index.js';

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
  commits: {}
});

assert(!failed.complete, 'failed objectives must report an incomplete scenario');
assert(
  failed.results[0].unmet[0].expected === first.parameters.depth + 1,
  'failed objectives must expose structured unmet conditions'
);

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

const unmodified = generateScenario(modifiedTemplate, { seed: 'modifier' });
assert(
  unmodified.enabledModifiers.length === 0 &&
  !unmodified.repository.files['noise.txt'],
  'modifiers must be opt-in'
);

const modified = generateScenario(modifiedTemplate, {
  seed: 'modifier',
  modifiers: ['extra-file']
});

assert(
  modified.enabledModifiers[0] === 'extra-file' &&
  modified.repository.files['noise.txt'] === 'noise',
  'explicitly enabled modifiers must be applied'
);
assert(
  Object.isFrozen(modified.repository) &&
  Object.isFrozen(modified.repository.files),
  'generated repository data must be immutable'
);

assertThrows(
  () => generateScenario(modifiedTemplate, { modifiers: 'extra-file' }),
  TypeError,
  'modifier selections must be arrays'
);
assertThrows(
  () => generateScenario(modifiedTemplate, { modifiers: ['unknown'] }),
  RangeError,
  'unknown modifiers must be rejected'
);

assertThrows(
  () => defineScenarioTemplate({
    id: 'invalid-commands',
    story: 'Invalid command collection.',
    availableCommands: {},
    generate() {
      return {};
    }
  }),
  TypeError,
  'template command collections must be arrays'
);

assertThrows(
  () => defineScenarioTemplate({
    id: 'invalid-objectives',
    story: 'Invalid objective collection.',
    objectives: {},
    generate() {
      return {};
    }
  }),
  TypeError,
  'template objective collections must be arrays'
);

assertThrows(
  () => defineScenarioTemplate({
    id: 'invalid-modifiers',
    story: 'Invalid modifier collection.',
    modifiers: {},
    generate() {
      return {};
    }
  }),
  TypeError,
  'template modifier collections must be arrays'
);

assertThrows(
  () => defineScenarioTemplate({
    id: 'invalid-command',
    story: 'Unsupported command.',
    availableCommands: ['not-a-command'],
    generate() {
      return {};
    }
  }),
  RangeError,
  'unsupported template commands must be rejected'
);

assertThrows(
  () => defineScenarioTemplate({
    id: 'invalid-objective',
    story: 'Invalid objective.',
    objectives: [{}],
    generate() {
      return {};
    }
  }),
  TypeError,
  'invalid template objectives must be rejected'
);

assertThrows(
  () => defineScenarioTemplate({
    id: 'invalid-modifier',
    story: 'Invalid modifier.',
    modifiers: [{}],
    generate() {
      return {};
    }
  }),
  TypeError,
  'invalid template modifiers must be rejected'
);

const random = createRandom('validation');
assert(!random.boolean(0), 'zero probability must always be false');
assert(random.boolean(1), 'one probability must always be true');
assertThrows(
  () => random.boolean(NaN),
  RangeError,
  'NaN probability must be rejected'
);
assertThrows(
  () => random.boolean('0.5'),
  RangeError,
  'non-numeric probability must be rejected'
);
assertThrows(
  () => random.boolean(-0.1),
  RangeError,
  'negative probability must be rejected'
);
assertThrows(
  () => random.boolean(1.1),
  RangeError,
  'probability above one must be rejected'
);


const friday = generateRegisteredScenario('friday-afternoon-merge', {
  seed: 'friday-merge-regression'
});
const fridayRepository = createGitEngine(friday.repository);

const switchResult = fridayRepository.execute({
  type: 'switch',
  params: { branch: 'main' }
});
assert(switchResult.ok, 'Friday merge scenario must allow switching to main.');

const mergeResult = fridayRepository.execute({
  type: 'merge',
  params: { branch: 'feature' }
});
assert(mergeResult.ok, 'Friday merge scenario must allow merging feature into main.');
assert(
  mergeResult.data?.commit?.parents?.length === 2,
  'Friday merge must create a two-parent merge commit.'
);

const fridayEvaluation = evaluateScenario(friday, fridayRepository.inspect());
assert(
  fridayEvaluation.complete,
  'Friday merge scenario must complete after switching to main and merging feature.'
);

console.log('Git scenario framework tests passed.');
