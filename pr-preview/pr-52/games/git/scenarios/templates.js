import { DEFAULTS } from '../constants.js';
import { makeCommitId } from '../utils.js';
import { createObjective } from './objectives.js';
import { defineScenarioTemplate } from './template.js';

const AUTHORS = Object.freeze([
  Object.freeze({ name: 'Aisha', email: 'aisha@example.test' }),
  Object.freeze({ name: 'Ben', email: 'ben@example.test' }),
  Object.freeze({ name: 'Chen', email: 'chen@example.test' }),
  Object.freeze({ name: 'Diego', email: 'diego@example.test' })
]);

const BRANCH_NAMES = Object.freeze([
  'feature/payments',
  'feature/search',
  'feature/checkout',
  'feature/notifications'
]);

const FILES = Object.freeze([
  'src/api.js',
  'src/search.js',
  'src/checkout.js',
  'src/notifications.js'
]);

export const SCENARIO_TEMPLATES = Object.freeze([
  createMissingFeatureTemplate(),
  createFridayMergeTemplate(),
  createPresentablePrTemplate(),
  createTeammateTemplate()
]);

function createMissingFeatureTemplate() {
  return defineScenarioTemplate({
    id: 'missing-feature',
    story: 'A feature branch disappeared before release. Recover the feature without losing unrelated work.',
    availableCommands: ['status', 'log', 'show', 'reflog', 'branch', 'switch'],
    concept: 'branch recovery',
    completionExplanation:
      'This scenario demonstrates recovering a branch reference from repository history and reflog information without rewriting unrelated commits.',
    generate({ random }) {
      const branch = random.pick(BRANCH_NAMES);
      const file = random.pick(FILES);
      const author = random.pick(AUTHORS);
      const repository = createGraph(random, [
        {
          message: 'Initial repository setup',
          changes: { 'README.md': '# Release' },
          author
        },
        {
          message: 'Build ' + branch.split('/')[1],
          changes: { [file]: 'feature work' },
          author
        },
        {
          message: 'Prepare unrelated release work',
          changes: { 'release-notes.md': 'Release preparation' },
          author: random.pick(AUTHORS)
        }
      ]);

      const target = repository.commitIds[1];
      const main = repository.commitIds[2];

      return {
        story:
          'A feature branch named "' + branch +
          '" disappeared before release. Recover the feature without losing unrelated work.',
        parameters: { branch, file },
        repository: {
          ...repository.input,
          branches: { main, },
          headBranch: 'main',
          reflog: [{
            id: 1,
            ref: 'refs/heads/' + branch,
            oldValue: target,
            newValue: null,
            reason: 'branch deleted',
            timestamp: '2000-01-01T00:00:00.000Z'
          }]
        },
        objectives: [createObjective({
          id: 'feature-recovered',
          description: 'The missing feature branch points to its recovered commit.',
          evaluate(state) {
            const satisfied = state.branches[branch] === target;

            return {
              satisfied,
              unmet: satisfied ? [] : [{
                id: 'feature-recovered',
                description: 'The missing feature branch must point to the recovered feature commit.',
                expected: target,
                actual: state.branches[branch] || null
              }]
            };
          }
        })]
      };
    }
  });
}

function createFridayMergeTemplate() {
  return defineScenarioTemplate({
    id: 'friday-afternoon-merge',
    story: 'Two developers changed related parts of the release. Integrate both sides while preserving their work.',
    availableCommands: ['status', 'log', 'show', 'diff', 'switch', 'merge'],
    concept: 'merge',
    completionExplanation:
      'This scenario demonstrates combining two lines of development while preserving both parent histories in a merge commit.',
    generate({ random }) {
      const fileA = random.pick(FILES);
      const remainingFiles = FILES.filter(file => file !== fileA);
      const fileB = random.pick(remainingFiles);
      const firstAuthor = random.pick(AUTHORS);
      const secondAuthor = random.pick(AUTHORS);
      const repository = createGraph(random, [
        {
          message: 'Initial release branch',
          changes: { 'README.md': '# Release' },
          author: firstAuthor
        },
        {
          message: 'Prepare release integration',
          changes: { [fileA]: 'release-side work' },
          author: firstAuthor,
          parents: 'root'
        },
        {
          message: 'Finish feature branch work',
          changes: { [fileB]: 'feature-side work' },
          author: secondAuthor,
          parents: 'root'
        }
      ]);

      const main = repository.commitIds[1];
      const feature = repository.commitIds[2];

      console.debug('[Git Debug] generated friday-afternoon-merge scenario', {
        seed: repository.input.seed,
        commitIds: repository.commitIds,
        commits: repository.input.commits,
        branches: { main, feature },
        headBranch: 'feature'
      });

      return {
        story:
          'It is Friday afternoon. Two developers changed related parts of the release. ' +
          'Integrate both sides while preserving their work.',
        parameters: { fileA, fileB },
        repository: {
          ...repository.input,
          branches: {
            main,
            feature: feature
          },
          headBranch: 'feature'
        },
        objectives: [createObjective({
          id: 'both-sides-integrated',
          description: 'The current history preserves both branch tips in one merge result.',
          evaluate(state) {
            const head = state.commits[state.head.commit];
            const satisfied =
              state.head.branch === 'main' &&
              state.conflicts.length === 0 &&
              head?.parents?.includes(main) &&
              head?.parents?.includes(feature) &&
              head?.tree?.[fileA] === 'release-side work' &&
              head?.tree?.[fileB] === 'feature-side work';

            return {
              satisfied,
              unmet: satisfied ? [] : [{
                id: 'both-sides-integrated',
                description: 'The current branch must preserve both lines of development.',
                expected: {
                  parents: [main, feature],
                  conflicts: 0,
                  files: [fileA, fileB]
                },
                actual: {
                  parents: head?.parents || [],
                  conflicts: state.conflicts.length,
                  files: [
                    state.workingTree?.[fileA],
                    state.workingTree?.[fileB]
                  ]
                }
              }]
            };
          }
        })]
      };
    }
  });
}

function createPresentablePrTemplate() {
  return defineScenarioTemplate({
    id: 'presentable-pr',
    story: 'A feature branch has a messy sequence of commits. Produce the required clean history before opening the PR.',
    availableCommands: ['status', 'log', 'show', 'switch', 'rebase'],
    concept: 'history cleanup',
    completionExplanation:
      'This scenario demonstrates replaying feature commits on top of the current target branch so the feature history is based on the latest target work.',
    generate({ random }) {
      const branch = random.pick(['feature/payments', 'feature/search', 'feature/checkout']);
      const file = random.pick(FILES);
      const author = random.pick(AUTHORS);
      const repository = createGraph(random, [
        {
          message: 'Initial repository setup',
          changes: { 'README.md': '# Application' },
          author
        },
        {
          message: 'Update target branch',
          changes: { 'release-notes.md': 'Target branch update' },
          author: random.pick(AUTHORS),
          parents: 'root'
        },
        {
          message: 'Temporary implementation step',
          changes: { [file]: 'step one' },
          author,
          parents: 'root'
        },
        {
          message: 'Refine implementation',
          changes: { [file]: 'step two' },
          author,
          parents: 2
        }
      ]);

      const main = repository.commitIds[1];
      const featureTwo = repository.commitIds[3];

      return {
        story:
          'The "' + branch +
          '" branch has a messy sequence of commits and the target branch has moved. ' +
          'Produce the required clean history before opening the PR.',
        parameters: { branch, file },
        repository: {
          ...repository.input,
          branches: {
            main,
            [branch]: featureTwo
          },
          headBranch: branch
        },
        objectives: [createObjective({
          id: 'feature-based-on-target',
          description: 'The feature history is based on the current target branch.',
          evaluate(state) {
            const target = state.branches.main;
            const head = state.commits[state.head.commit];
            const parents = head?.parents || [];
            const satisfied =
              state.head.branch === branch &&
              parents.length > 0 &&
              parents[0] !== featureTwo &&
              hasAncestor(state.commits, target, state.head.commit);

            return {
              satisfied,
              unmet: satisfied ? [] : [{
                id: 'feature-based-on-target',
                description: 'The feature branch must contain the target branch history before its feature commits.',
                expected: target,
                actual: parents[0] || null
              }]
            };
          }
        })]
      };
    }
  });
}

function createTeammateTemplate() {
  return defineScenarioTemplate({
    id: 'teammate-got-there-first',
    story: 'The remote branch has advanced while local work is still in progress. Reconcile the histories without losing either side.',
    availableCommands: ['status', 'log', 'show', 'diff', 'fetch', 'pull', 'switch', 'merge'],
    concept: 'remote reconciliation',
    completionExplanation:
      'This scenario demonstrates synchronizing remote-tracking state and integrating remote work with local work while retaining both histories.',
    generate({ random }) {
      const file = random.pick(FILES);
      const localAuthor = random.pick(AUTHORS);
      const remoteAuthor = random.pick(AUTHORS);
      const repository = createGraph(random, [
        {
          message: 'Initial repository setup',
          changes: { 'README.md': '# Application' },
          author: localAuthor
        },
        {
          message: 'Teammate update',
          changes: { 'release-notes.md': 'Remote update' },
          author: remoteAuthor,
          parents: 'root'
        },
        {
          message: 'Local work in progress',
          changes: { [file]: 'Local update' },
          author: localAuthor,
          parents: 'root'
        }
      ]);

      const remoteTip = repository.commitIds[1];
      const localTip = repository.commitIds[2];
      const remoteCommits = getReachableCommits(repository.input.commits, remoteTip);

      return {
        story:
          'Your teammate got there first: the remote branch has advanced while local work is still in progress. ' +
          'Reconcile the histories without losing either side.',
        parameters: { file },
        repository: {
          ...repository.input,
          branches: { main: localTip },
          headBranch: 'main',
          remotes: {
            origin: {
              url: 'https://example.test/team/repository.git',
              branches: { main: remoteTip },
              commits: remoteCommits
            }
          },
          remoteTracking: {
            'refs/remotes/origin/main': remoteTip
          }
        },
        objectives: [createObjective({
          id: 'remote-and-local-integrated',
          description: 'The current history contains both the local and remote lines of development.',
          evaluate(state) {
            const head = state.commits[state.head.commit];
            const satisfied =
              state.head.branch === 'main' &&
              state.conflicts.length === 0 &&
              hasAncestor(state.commits, localTip, state.head.commit) &&
              hasAncestor(state.commits, remoteTip, state.head.commit);

            return {
              satisfied,
              unmet: satisfied ? [] : [{
                id: 'remote-and-local-integrated',
                description: 'The current branch must contain both the local and remote histories.',
                expected: { localTip, remoteTip },
                actual: { head: state.head.commit }
              }]
            };
          }
        })]
      };
    }
  });
}

function createGraph(random, definitions) {
  const seed = 'git-scenario-' + random.int(1, 2147483647);
  const commits = [];
  const commitIds = [];
  const trees = [];
  let previous = null;
  let rootId = null;

  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const parents = resolveParents(definition.parents, {
      previous,
      rootId,
      commitIds
    });
    const previousTree = trees[parents.length ? commitIds.indexOf(parents[0]) : -1] || {};
    const tree = definition.tree
      ? { ...definition.tree }
      : {
        ...previousTree,
        ...(definition.changes || {})
      };
    const message = definition.message;
    const author = definition.author || DEFAULTS.author;
    const id = makeCommitId(seed, index + 1, message, parents, tree);

    commits.push({ id, message, parents, tree, author });
    commitIds.push(id);
    trees.push(tree);
    previous = id;
    rootId ||= id;
  }

  return {
    input: {
      seed,
      commits,
      files: trees[0] || {}
    },
    commitIds
  };
}

function resolveParents(value, context) {
  if (!value) return context.previous ? [context.previous] : [];
  if (value === 'root') return [context.rootId];
  if (Number.isInteger(value)) return [context.commitIds[value]];
  if (Array.isArray(value)) return value;
  return [value];
}

function getReachableCommits(commits, tip) {
  const byId = Object.fromEntries(commits.map(commit => [commit.id, commit]));
  const reachable = {};
  const queue = [tip];
  const seen = new Set();

  while (queue.length) {
    const id = queue.shift();

    if (!id || seen.has(id) || !byId[id]) continue;

    seen.add(id);
    reachable[id] = byId[id];
    queue.push(...byId[id].parents);
  }

  return reachable;
}

function hasAncestor(commits, ancestor, descendant) {
  if (ancestor === descendant) return true;

  const queue = [descendant];
  const seen = new Set();

  while (queue.length) {
    const id = queue.shift();

    if (!id || seen.has(id) || !commits[id]) continue;
    if (id === ancestor) return true;

    seen.add(id);
    queue.push(...commits[id].parents);
  }

  return false;
}
