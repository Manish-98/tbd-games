import {
  COMMANDS,
  DEFAULTS,
  ERROR_CODES,
  HEAD_TYPES,
  READ_ONLY_COMMANDS
} from './constants.js';
import { validateCommand } from './validation.js';
import { getOperation } from './operations.js';
import {
  applyChanges,
  clone,
  createInitialFiles,
  diffTrees,
  makeCommitId,
  normalizeRemotes
} from './utils.js';
import { createClock } from './clock.js';
import {
  getRepositoryState,
  setRepositoryState
} from './repository-state.js';

export { COMMANDS, validateCommand };

export class GitRepository {
  #clock;
  #seed;
  #commitSequence;
  #reflogSequence;
  #initialState;
  #initialCommitSequence;
  #initialReflogSequence;
  #initialClockSequence;

  constructor(input = {}) {
    console.debug('[Git Debug] repository input', {
      seed: input.seed,
      headBranch: input.headBranch,
      branches: input.branches,
      commitDefinitions: input.commits?.map(commit => ({
        message: commit.message,
        parents: commit.parents,
        id: commit.id
      }))
    });
    this.#seed = input.seed || DEFAULTS.seed;
    this.#commitSequence = 1;
    this.#reflogSequence = 1;
    this.#clock = createClock(input.startTime || DEFAULTS.startTime);

    setRepositoryState(this, { commits: {} });

    this.#initialState = createInitialState(input, this);
    this.#reflogSequence = nextReflogSequence(this.#initialState.reflog);
    this.#initialCommitSequence = this.#commitSequence;
    this.#initialReflogSequence = this.#reflogSequence;
    this.#initialClockSequence = this.#clock.snapshot();
    setRepositoryState(this, clone(this.#initialState));
  }

  reset() {
    this.#commitSequence = this.#initialCommitSequence;
    this.#reflogSequence = this.#initialReflogSequence;
    this.#clock.restore(this.#initialClockSequence);
    setRepositoryState(this, clone(this.#initialState));
    return this.snapshot();
  }

  snapshot() {
    return clone(getRepositoryState(this));
  }

  inspect() {
    return this.snapshot();
  }

  execute(command) {
    return executeCommand(this, command);
  }

  createCommit({ message, parents, tree, author = DEFAULTS.author }) {
    const state = getRepositoryState(this);
    const sequence = this.#commitSequence++;
    const id = makeCommitId(
      this.#seed,
      sequence,
      message,
      parents,
      tree
    );
    const commit = {
      id,
      message: String(message),
      parents: parents.filter(Boolean),
      tree: clone(tree),
      author: clone(author),
      date: this.now()
    };

    commit.changes = diffTrees(
      commit.parents[0]
        ? state.commits[commit.parents[0]]?.tree || {}
        : {},
      tree
    );

    state.commits[id] = commit;
    return commit;
  }

  refChange(ref, oldValue, newValue, reason) {
    if (oldValue === newValue) return;

    getRepositoryState(this).reflog.push({
      id: this.#reflogSequence++,
      ref,
      oldValue: oldValue || null,
      newValue: newValue || null,
      reason,
      timestamp: this.now()
    });
  }

  now() {
    return this.#clock.now();
  }

  nextCommitSequence() {
    return this.#commitSequence;
  }
}

export function createGitEngine(input = {}) {
  return new GitRepository(input);
}

export function createRepository(input = {}) {
  return createGitEngine(input).snapshot();
}

export function executeCommand(repository, command) {
  if (!(repository instanceof GitRepository)) {
    return executionError(
      ERROR_CODES.INVALID_REPOSITORY,
      'Commands must execute through a GitRepository instance.'
    );
  }

  const beforeValidation = repository.snapshot();
  console.debug('[Git Debug] execute command', {
    command,
    head: beforeValidation.head,
    branches: beforeValidation.branches,
    commitIds: Object.keys(beforeValidation.commits),
    headCommitExists: Boolean(beforeValidation.commits[beforeValidation.head?.commit])
  });

  const validation = validateCommand(beforeValidation, command);
  console.debug('[Git Debug] validation result', validation);

  if (!validation.valid) {
    return {
      ...validation,
      phase: 'validation'
    };
  }

  const { type, params } = validation.command;
  const operation = getOperation(type);

  if (!operation) {
    return executionError(
      ERROR_CODES.UNIMPLEMENTED_COMMAND,
      `No execution handler exists for Git command: ${type}`
    );
  }

  try {
    const result = operation(repository, params);
    const state = getRepositoryState(repository);

    if (result.ok && !READ_ONLY_COMMANDS.includes(type)) {
      state.commandHistory.push({
        type,
        params: clone(params)
      });
    }

    return {
      ...result,
      phase: 'git'
    };
  } catch (error) {
    console.error('[Git Debug] execution exception', {
      command,
      error,
      state: repository.snapshot()
    });
    return executionError(
      ERROR_CODES.EXECUTION_ERROR,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function createInitialState(input, repo) {
  const commits = createInitialCommits(input, repo);
  const branches = createBranches(input, commits.headCommit);
  const headBranch = input.headBranch || DEFAULTS.branch;
  const headCommit = branches[headBranch] || commits.headCommit;
  const commitState = getRepositoryState(repo).commits;

  console.debug('[Git Debug] initial refs', {
    defaultCommit: commits.headCommit,
    branches,
    headBranch,
    headCommit,
    commitIds: Object.keys(commitState),
    headCommitState: commitState[headCommit],
    headCommitExists: Boolean(commitState[headCommit])
  });

  return {
    commits: getRepositoryState(repo).commits,
    branches,
    head: {
      type: input.detachedHead ? HEAD_TYPES.DETACHED : HEAD_TYPES.BRANCH,
      branch: input.detachedHead ? null : headBranch,
      commit: headCommit
    },
    workingTree: clone(
      input.workingTree || commitState[headCommit].tree
    ),
    staging: clone(input.staging || {}),
    remotes: normalizeRemotes(input.remotes || {}),
    remoteTracking: clone(input.remoteTracking || {}),
    tags: clone(input.tags || {}),
    conflicts: clone(input.conflicts || []),
    reflog: clone(input.reflog || []),
    stash: clone(input.stash || []),
    commandHistory: []
  };
}

function createInitialCommits(input, repo) {
  let tree = createInitialFiles(input);
  let parent = null;

  if (input.commits?.length) {
    for (const definition of input.commits) {
      tree = definition.tree
        ? clone(definition.tree)
        : applyChanges(tree, definition.changes);

      console.debug('[Git Debug] create initial commit', {
        sequence: repo.nextCommitSequence(),
        definitionId: definition.id,
        message: definition.message,
        parents: definition.parents,
        tree
      });

      const commit = repo.createCommit({
        message: definition.message || `${DEFAULTS.commitPrefix}${repo.nextCommitSequence()}`,
        parents: definition.parents || (parent ? [parent] : []),
        tree,
        author: definition.author || DEFAULTS.author
      });

      parent = commit.id;
    }
  } else {
    const root = repo.createCommit({
      message: input.initialMessage || DEFAULTS.initialMessage,
      parents: [],
      tree,
      author: input.author || DEFAULTS.author
    });

    parent = root.id;

    for (const changes of input.history || []) {
      tree = applyChanges(tree, changes);
      parent = repo.createCommit({
        message: `${DEFAULTS.commitPrefix}${repo.nextCommitSequence()}`,
        parents: [parent],
        tree,
        author: input.author || DEFAULTS.author
      }).id;
    }
  }

  return { headCommit: parent };
}

function createBranches(input, defaultCommit) {
  const defaultBranch = input.defaultBranch || DEFAULTS.branch;

  return {
    [defaultBranch]: defaultCommit,
    ...clone(input.branches || {})
  };
}

function nextReflogSequence(reflog) {
  return reflog.reduce(
    (next, entry) => Math.max(next, Number(entry.id) + 1),
    1
  );
}

function executionError(code, message) {
  return {
    ok: false,
    error: { code, message },
    phase: 'git'
  };
}
