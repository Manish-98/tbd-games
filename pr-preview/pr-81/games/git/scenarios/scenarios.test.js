import { createGitEngine } from '../engine.js';
import { COMMANDS } from '../constants.js';
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


const patchScenario = generateRegisteredScenario('patch-wrong-route', {
  seed: 'patch-wrong-route-regression'
});
const repeatedPatchScenario = generateRegisteredScenario('patch-wrong-route', {
  seed: 'patch-wrong-route-regression'
});
const patchRepository = createGitEngine(patchScenario.repository);
const patchState = patchRepository.inspect();
const patchEvaluation = evaluateScenario(patchScenario, patchState);
const patchObjectives = Object.fromEntries(
  patchEvaluation.results.map(result => [result.id, result.satisfied])
);

assert(
  JSON.stringify(patchScenario.repository) === JSON.stringify(repeatedPatchScenario.repository),
  'patch wrong route scenario generation must be deterministic for a seed'
);

const patchCommits = Object.fromEntries(
  patchScenario.repository.commits.map(commit => [commit.id, commit])
);
const patchFeatureCommit = patchCommits[patchScenario.parameters.featureWork];
const patchFeatureTipCommit = patchCommits[patchScenario.parameters.featureTip];
const patchReleaseCommit = patchCommits[patchScenario.parameters.releaseFollowup];
assert(
  patchFeatureCommit.parents.length === 1 &&
  patchFeatureCommit.parents[0] === patchScenario.parameters.base,
  'feature work must branch directly from the scenario base'
);
assert(
  !Object.prototype.hasOwnProperty.call(patchFeatureCommit.tree, 'release-notes.md') &&
  !Object.prototype.hasOwnProperty.call(patchFeatureCommit.tree, 'src/legacy-adapter.js') &&
  !Object.prototype.hasOwnProperty.call(patchFeatureCommit.tree, 'CHANGELOG.md'),
  'feature branch snapshots must not include release-only files'
);
assert(
  Object.prototype.hasOwnProperty.call(patchReleaseCommit.tree, 'release-notes.md') &&
  Object.prototype.hasOwnProperty.call(patchReleaseCommit.tree, 'src/legacy-adapter.js') &&
  Object.prototype.hasOwnProperty.call(patchReleaseCommit.tree, 'CHANGELOG.md'),
  'release history must retain its release-only files'
);
assert(
  patchFeatureTipCommit.tree[patchScenario.parameters.featureFiles[0]] === 'render catalog cards' &&
  patchFeatureTipCommit.tree[patchScenario.parameters.featureFiles[1]] === 'boost recently updated entries',
  'feature tip must retain both feature changes'
);
assert(
  JSON.stringify(patchScenario.availableCommands) === JSON.stringify(COMMANDS),
  'patch wrong route scenario must expose the full supported command palette'
);
assert(
  patchState.head.branch === 'main' &&
  patchState.conflicts.length === 0 &&
  !patchState.mergeInProgress,
  'patch wrong route scenario must start on main without active conflicts'
);

const cherryPickScenario = generateRegisteredScenario('patch-wrong-route', {
  seed: 'patch-wrong-route-cherry-pick-conflict'
});
const cherryPickEngine = createGitEngine(cherryPickScenario.repository);
const cherryPickParameters = cherryPickScenario.parameters;
const stashResult = cherryPickEngine.execute({ type: 'stash', params: { action: 'push', message: 'protect release edits' } });
assert(stashResult.ok, 'scenario local edits must be stashable before cherry-pick');
const cherryPickConflict = cherryPickEngine.execute({
  type: 'cherry-pick',
  params: { commit: cherryPickParameters.fix }
});
assert(!cherryPickConflict.ok, 'cherry-pick must stop when the release-side file conflicts');
assert(
  cherryPickConflict.error?.code === 'CHERRY_PICK_CONFLICT' ||
  cherryPickConflict.code === 'CHERRY_PICK_CONFLICT',
  'scenario cherry-pick must expose the expected conflict'
);
assert(
  cherryPickEngine.inspect().conflicts.some(conflict => conflict.file === 'src/release-check.js'),
  'scenario cherry-pick must conflict on src/release-check.js'
);
assert(
  cherryPickEngine.inspect().head.commit === cherryPickParameters.releaseFollowup,
  'conflicted cherry-pick must not advance the release branch'
);
assert(
  cherryPickEngine.execute({
    type: 'resolve',
    params: { file: 'src/release-check.js', content: 'validate release package; retry safely' }
  }).ok,
  'the release-check conflict must be resolvable'
);
assert(
  cherryPickEngine.execute({ type: 'add', params: { file: 'src/release-check.js' } }).ok,
  'the resolved release-check file must be stageable'
);
const finishCherryPick = cherryPickEngine.execute({
  type: 'commit',
  params: { message: 'Correct retry handling' }
});
assert(finishCherryPick.ok, 'the resolved cherry-pick must complete');
assert(
  finishCherryPick.data?.commit?.parents?.length === 1,
  'the cherry-picked correction must be a single-parent commit'
);
assert(
  cherryPickEngine.inspect().head.commit === finishCherryPick.data.commit.id,
  'the cherry-pick commit must become the release branch tip'
);
assert(
  cherryPickEngine.execute({ type: 'stash', params: { action: 'pop' } }).ok,
  'the original local edits must be restored after cherry-pick'
);
const cherryPickFinalState = cherryPickEngine.inspect();
assert(
  cherryPickFinalState.staging[cherryPickParameters.stagedLocalFile] === cherryPickParameters.stagedLocalContent &&
  cherryPickFinalState.workingTree[cherryPickParameters.unstagedLocalFile] === cherryPickParameters.unstagedLocalContent &&
  !Object.prototype.hasOwnProperty.call(cherryPickFinalState.staging, cherryPickParameters.unstagedLocalFile),
  'stash restoration must preserve the original staged and unstaged edits'
);

assert(
  patchObjectives['local-edits-preserved'] &&
  patchObjectives['feature-work-isolated'] &&
  patchObjectives['feature-branch-usable'],
  'the starting state must expose preserved local edits and retain isolated feature work'
);
assert(
  !patchObjectives['release-corrected'] &&
  !patchObjectives['designated-fix-reachable'] &&
  !patchObjectives['repository-end-state'],
  'the release and final-state objectives must begin incomplete'
);

const patchFinalState = patchRepository.inspect();
const patchParameters = patchScenario.parameters;
const patchFeatureTree = patchFinalState.commits[patchParameters.featureTip].tree;
const patchReleaseTree = {
  ...patchFeatureTree,
  'config/release.txt': patchParameters.correctedConfig,
  'src/release-check.js': 'validate release package; retry safely',
  'release-notes.md': 'Weekly package review completed.',
  'CHANGELOG.md': 'Documented the compatibility review.'
};
for (const file of patchParameters.featureFiles) {
  delete patchReleaseTree[file];
}
patchFinalState.commits['test-patch-cherry-pick'] = {
  id: 'test-patch-cherry-pick',
  message: 'Correct retry handling',
  parents: [patchParameters.releaseFollowup],
  tree: patchReleaseTree
};
patchFinalState.commits['test-patch-final-release'] = {
  id: 'test-patch-final-release',
  message: 'Test-only completed release state',
  parents: ['test-patch-cherry-pick'],
  tree: patchReleaseTree
};
patchFinalState.branches.main = 'test-patch-final-release';
patchFinalState.workingTree = {
  ...patchReleaseTree,
  [patchParameters.stagedLocalFile]: patchParameters.stagedLocalContent,
  [patchParameters.unstagedLocalFile]: patchParameters.unstagedLocalContent
};
patchFinalState.staging = {
  [patchParameters.stagedLocalFile]: patchParameters.stagedLocalContent
};
patchFinalState.conflicts = [];
patchFinalState.mergeInProgress = null;

const patchFinalEvaluation = evaluateScenario(patchScenario, patchFinalState);
assert(
  patchFinalEvaluation.complete,
  'all patch wrong route objectives must pass for a valid final repository state'
);

const alternatePatchFinalState = {
  ...patchFinalState,
  commits: {
    ...patchFinalState.commits,
    'test-patch-final-release': {
      ...patchFinalState.commits['test-patch-final-release'],
      parents: ['test-patch-cherry-pick']
    }
  }
};
assert(
  evaluateScenario(patchScenario, alternatePatchFinalState).complete,
  'the same release tree must satisfy objectives when reached through a different valid history shape'
);

const lostStagingState = {
  ...patchFinalState,
  staging: {}
};
assert(
  !evaluateScenario(patchScenario, lostStagingState).complete,
  'final completion must be revoked when the staged local edit is lost'
);

const shippedFeatureState = {
  ...patchFinalState,
  commits: {
    ...patchFinalState.commits,
    'test-patch-final-release': {
      ...patchFinalState.commits['test-patch-final-release'],
      tree: {
        ...patchFinalState.commits['test-patch-final-release'].tree,
        [patchParameters.featureFiles[0]]: patchFeatureTree[patchParameters.featureFiles[0]]
      }
    }
  }
};
assert(
  !evaluateScenario(patchScenario, shippedFeatureState).complete,
  'final completion must be revoked if feature-only content enters the release tree'
);

console.log('Git scenario framework tests passed.');
