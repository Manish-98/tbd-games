import { COMMANDS } from '../constants.js';
import { makeCommitId } from '../utils.js';
import { createObjective } from './objectives.js';
import { defineScenarioTemplate } from './template.js';

const BASELINE = Object.freeze({
  'README.md': '# Release workspace',
  'config/release.txt': 'channel=stable\nretry=3\n',
  'src/release-check.js': 'validate release package',
  'docs/release-plan.md': 'approved scope: stable channel',
  'docs/editor-notes.md': 'Draft the operator checklist.'
});

const FIXED_RELEASE_CONFIG = 'channel=stable\nretry=3\n';
const FEATURE_FILES = Object.freeze([
  'src/feature-panel.js',
  'src/search-boost.js'
]);
const STAGED_LOCAL_FILE = 'docs/release-plan.md';
const STAGED_LOCAL_CONTENT = 'approved scope: stable channel\nQA owner: Aisha';
const UNSTAGED_LOCAL_FILE = 'docs/editor-notes.md';
const UNSTAGED_LOCAL_CONTENT = 'Draft the operator checklist.\nRemember to verify the rollback path.';

export function createPatchWrongRouteTemplate() {
  return defineScenarioTemplate({
    id: 'patch-wrong-route',
    story:
      'A release candidate picked up changes from the wrong line of development. ' +
      'The release must be corrected by cherry-picking a fix that conflicts with release-side edits, without losing local work or abandoning ongoing feature work.',
    availableCommands: COMMANDS,
    concept: 'history recovery and selective integration',
    completionExplanation:
      'The release contains the required correction without feature-only files, the designated fix has been cherry-picked into its history, ' +
      'the feature branch still retains its work, and both local edits keep their original index/worktree status.',
    generate({ random }) {
      const seed = 'patch-wrong-route-' + random.int(1, 2147483647);
      const graph = createScenarioGraph(seed);
      const { commits, ids } = graph;
      const [base, releasePrep, badRelease, releaseFollowup, featureWork, fix, featureTip] = ids;
      const releaseTree = commits[3].tree;
      const workingTree = {
        ...releaseTree,
        [STAGED_LOCAL_FILE]: STAGED_LOCAL_CONTENT,
        [UNSTAGED_LOCAL_FILE]: UNSTAGED_LOCAL_CONTENT
      };

      return {
        story:
          'A release candidate picked up changes from the wrong line of development. ' +
          'Protect the local edits, cherry-pick the release fix, resolve its file conflict, and keep ongoing feature work available to its team.',
        parameters: {
          base,
          releasePrep,
          badRelease,
          releaseFollowup,
          featureWork,
          fix,
          featureTip,
          featureFiles: FEATURE_FILES,
          stagedLocalFile: STAGED_LOCAL_FILE,
          stagedLocalContent: STAGED_LOCAL_CONTENT,
          unstagedLocalFile: UNSTAGED_LOCAL_FILE,
          unstagedLocalContent: UNSTAGED_LOCAL_CONTENT,
          correctedConfig: FIXED_RELEASE_CONFIG
        },
        repository: {
          seed,
          commits,
          files: BASELINE,
          branches: {
            main: releaseFollowup,
            'feature/catalog-refresh': featureTip
          },
          headBranch: 'main',
          workingTree,
          staging: {
            [STAGED_LOCAL_FILE]: STAGED_LOCAL_CONTENT
          }
        },
        objectives: createObjectives({
          releaseFollowup,
          featureTip,
          fix,
          featureFiles: FEATURE_FILES,
          stagedLocalFile: STAGED_LOCAL_FILE,
          stagedLocalContent: STAGED_LOCAL_CONTENT,
          unstagedLocalFile: UNSTAGED_LOCAL_FILE,
          unstagedLocalContent: UNSTAGED_LOCAL_CONTENT,
          correctedConfig: FIXED_RELEASE_CONFIG
        })
      };
    }
  });
}

function createScenarioGraph(seed) {
  const definitions = [];
  const ids = [];
  const rootTree = { ...BASELINE };

  const append = (message, changes, parentIndexes) => {
    const parents = parentIndexes.map(index => ids[index]);
    const parentTree = parentIndexes.length
      ? definitions[parentIndexes[0]].tree
      : rootTree;
    const tree = { ...parentTree, ...changes };
    const id = makeCommitId(seed, ids.length + 1, message, parents, tree);
    definitions.push({ id, message, parents, tree });
    ids.push(id);
  };

  definitions.push({
    id: makeCommitId(seed, 1, 'Establish release workspace', [], rootTree),
    message: 'Establish release workspace',
    parents: [],
    tree: { ...rootTree }
  });
  ids.push(definitions[0].id);

  append('Prepare the weekly package', {
    'release-notes.md': 'Weekly package review completed.'
  }, [0]);
  append('Align compatibility defaults', {
    'config/release.txt': 'channel=legacy\nretry=0\n',
    'src/legacy-adapter.js': 'enable legacy adapter',
    'src/release-check.js': 'validate release package; retry through legacy adapter'
  }, [1]);
  append('Refresh the release checklist', {
    'CHANGELOG.md': 'Documented the compatibility review.'
  }, [2]);
  append('Refresh catalog presentation', {
    [FEATURE_FILES[0]]: 'render catalog cards'
  }, [0]);
  append('Correct retry handling', {
    'config/release.txt': FIXED_RELEASE_CONFIG,
    'src/release-check.js': 'validate release package; retry safely'
  }, [4]);
  append('Improve search ranking', {
    [FEATURE_FILES[1]]: 'boost recently updated entries'
  }, [5]);

  return { commits: definitions, ids };
}

function createObjectives(options) {
  const {
    featureTip,
    fix,
    featureFiles,
    stagedLocalFile,
    stagedLocalContent,
    unstagedLocalFile,
    unstagedLocalContent,
    correctedConfig
  } = options;

  return [
    createObjective({
      id: 'local-edits-preserved',
      description: 'Both local edits retain their original staged-versus-unstaged status.',
      evaluate(state) {
        const stagedContent = state.staging?.[stagedLocalFile];
        const unstagedContent = state.workingTree?.[unstagedLocalFile];
        const stagedMatches =
          stagedContent === stagedLocalContent &&
          state.workingTree?.[stagedLocalFile] === stagedLocalContent;
        const unstagedMatches =
          unstagedContent === unstagedLocalContent &&
          !Object.prototype.hasOwnProperty.call(state.staging || {}, unstagedLocalFile);

        return objectiveResult(
          'local-edits-preserved',
          stagedMatches && unstagedMatches,
          'The staged edit must remain staged, and the separate worktree edit must remain unstaged.',
          {
            staged: {
              expected: stagedLocalContent,
              actual: stagedContent ?? null
            },
            unstaged: {
              expected: unstagedLocalContent,
              actual: unstagedContent ?? null,
              isStaged: Object.prototype.hasOwnProperty.call(
                state.staging || {},
                unstagedLocalFile
              )
            }
          }
        );
      }
    }),
    createObjective({
      id: 'release-corrected',
      description: 'The release branch contains the corrected release configuration and valid release work.',
      evaluate(state) {
        const tree = state.commits[state.branches.main]?.tree || {};
        const satisfied =
          tree['config/release.txt'] === correctedConfig &&
          tree['src/release-check.js'] === 'validate release package; retry safely' &&
          !Object.prototype.hasOwnProperty.call(tree, 'src/legacy-adapter.js') &&
          tree['release-notes.md'] === 'Weekly package review completed.' &&
          tree['CHANGELOG.md'] === 'Documented the compatibility review.';

        return objectiveResult(
          'release-corrected',
          satisfied,
          'The release tree must have the corrected configuration and retain its valid follow-up changes.',
          {
            config: tree['config/release.txt'] ?? null,
            releaseCheck: tree['src/release-check.js'] ?? null,
            changelog: tree['CHANGELOG.md'] ?? null
          }
        );
      }
    }),
    createObjective({
      id: 'designated-fix-reachable',
      description: 'The designated correction has been cherry-picked into the release branch.',
      evaluate(state) {
        const satisfied = hasCherryPickedFix(state.commits, state.branches.main, fix);

        return objectiveResult(
          'designated-fix-reachable',
          satisfied,
          'The release history must contain a single-parent cherry-pick of the designated correction.',
          { expectedSource: fix, releaseTip: state.branches.main || null }
        );
      }
    }),
    createObjective({
      id: 'feature-work-isolated',
      description: 'Feature-only files are absent from the release tree while remaining on the development branch.',
      evaluate(state) {
        const releaseTree = state.commits[state.branches.main]?.tree || {};
        const featureCommit = state.commits[state.branches['feature/catalog-refresh']];
        const absentFromRelease = featureFiles.every(
          file => !Object.prototype.hasOwnProperty.call(releaseTree, file)
        );
        const retainedOnFeature = Boolean(featureCommit) &&
          featureFiles.every(file => typeof featureCommit.tree?.[file] === 'string');

        return objectiveResult(
          'feature-work-isolated',
          absentFromRelease && retainedOnFeature,
          'Feature-only content must not ship in main, and the feature branch must still retain both feature files.',
          {
            releaseFeatureFiles: featureFiles.map(file => ({
              file,
              content: releaseTree[file] ?? null
            })),
            featureBranch: state.branches['feature/catalog-refresh'] || null,
            featureTreeFiles: featureFiles.map(file => ({
              file,
              content: featureCommit?.tree?.[file] ?? null
            }))
          }
        );
      }
    }),
    createObjective({
      id: 'feature-branch-usable',
      description: 'The feature branch still reaches the intended feature history.',
      evaluate(state) {
        const featureTipCommit = state.commits[featureTip];
        const branchTip = state.branches['feature/catalog-refresh'];
        const satisfied =
          Boolean(branchTip) &&
          hasAncestor(state.commits, featureTip, branchTip) &&
          featureFiles.every(file =>
            typeof state.commits[branchTip]?.tree?.[file] === 'string'
          );

        return objectiveResult(
          'feature-branch-usable',
          satisfied,
          'The development branch must retain the intended feature history and both feature changes.',
          {
            expectedReachableCommit: featureTip,
            actualBranchTip: branchTip || null,
            expectedFiles: featureFiles
          }
        );
      }
    }),
    createObjective({
      id: 'repository-end-state',
      description: 'The release, feature history, local edits, and conflict state all meet the required end conditions.',
      evaluate(state) {
        const releaseTree = state.commits[state.branches.main]?.tree || {};
        const featureCommit = state.commits[state.branches['feature/catalog-refresh']];
        const localEditsPreserved =
          state.staging?.[stagedLocalFile] === stagedLocalContent &&
          state.workingTree?.[stagedLocalFile] === stagedLocalContent &&
          state.workingTree?.[unstagedLocalFile] === unstagedLocalContent &&
          !Object.prototype.hasOwnProperty.call(state.staging || {}, unstagedLocalFile);
        const featureFilesAbsent = featureFiles.every(
          file => !Object.prototype.hasOwnProperty.call(releaseTree, file)
        );
        const satisfied =
          releaseTree['config/release.txt'] === correctedConfig &&
          releaseTree['src/release-check.js'] === 'validate release package; retry safely' &&
          !Object.prototype.hasOwnProperty.call(releaseTree, 'src/legacy-adapter.js') &&
          releaseTree['release-notes.md'] === 'Weekly package review completed.' &&
          releaseTree['CHANGELOG.md'] === 'Documented the compatibility review.' &&
          hasCherryPickedFix(state.commits, state.branches.main, fix) &&
          Boolean(featureCommit) &&
          hasAncestor(state.commits, featureTip, state.branches['feature/catalog-refresh']) &&
          featureFiles.every(file => typeof featureCommit.tree?.[file] === 'string') &&
          featureFilesAbsent &&
          localEditsPreserved &&
          state.conflicts.length === 0 &&
          !state.mergeInProgress;

        return objectiveResult(
          'repository-end-state',
          satisfied,
          'All required tree, reachability, local index/worktree, and conflict predicates must hold simultaneously.',
          {
            releaseConfig: releaseTree['config/release.txt'] ?? null,
            fixCherryPicked: hasCherryPickedFix(state.commits, state.branches.main, fix),
            featureFilesAbsent,
            localEditsPreserved,
            unresolvedConflicts: state.conflicts.length,
            mergeInProgress: Boolean(state.mergeInProgress)
          }
        );
      }
    })
  ];
}

function hasCherryPickedFix(commits, releaseTip, sourceFix) {
  const source = commits[sourceFix];
  if (!source || !releaseTip) return false;

  const pending = [releaseTip];
  const visited = new Set();
  while (pending.length) {
    const currentId = pending.pop();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    const current = commits[currentId];
    if (!current) continue;

    if (
      currentId !== sourceFix &&
      current.parents.length === 1 &&
      current.message === source.message &&
      current.tree['src/release-check.js'] === source.tree['src/release-check.js']
    ) return true;

    pending.push(...current.parents);
  }

  return false;
}

function objectiveResult(id, satisfied, description, actual) {
  return {
    satisfied,
    unmet: satisfied ? [] : [{
      id,
      description,
      actual
    }]
  };
}

function hasAncestor(commits, ancestor, descendant) {
  if (!ancestor || !descendant) return false;

  const pending = [descendant];
  const visited = new Set();

  while (pending.length) {
    const current = pending.pop();
    if (current === ancestor) return true;
    if (!current || visited.has(current) || !commits[current]) continue;

    visited.add(current);
    pending.push(...commits[current].parents);
  }

  return false;
}
