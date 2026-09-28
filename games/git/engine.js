import {
  COMMANDS,
  DEFAULTS,
  HEAD_TYPES,
  READ_ONLY_COMMANDS
} from './constants.js';
import { validateCommand } from './validation.js';
import {
  READ_OPERATIONS,
  WRITE_OPERATIONS
} from './operations.js';
import {
  applyChanges,
  clone,
  createInitialFiles,
  diffTrees,
  makeCommitId,
  normalizeRemotes
} from './utils.js';

export { COMMANDS, validateCommand };

export class GitRepository {
  constructor(input = {}) {
    this.seed = input.seed || DEFAULTS.seed;
    this.commitSequence = 1;
    this.reflogSequence = 1;
    this.state = { commits: {} };

    this.initialState = createInitialState(input, this);
    this.initialCommitSequence = this.commitSequence;
    this.initialReflogSequence = this.reflogSequence;
    this.state = clone(this.initialState);
  }

  reset() {
    this.commitSequence = this.initialCommitSequence;
    this.reflogSequence = this.initialReflogSequence;
    this.state = clone(this.initialState);
    return this.snapshot();
  }

  snapshot() {
    return clone(this.state);
  }

  inspect() {
    return this.snapshot();
  }

  execute(command) {
    return executeCommand(this, command);
  }

  createCommit({ message, parents, tree, author = DEFAULTS.author }) {
    const sequence = this.commitSequence++;
    const id = makeCommitId(
      this.seed,
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
      date: new Date(Date.now() + sequence).toISOString()
    };

    commit.changes = diffTrees(
      commit.parents[0]
        ? this.state.commits[commit.parents[0]]?.tree || {}
        : {},
      tree
    );

    this.state.commits[id] = commit;
    return commit;
  }

  refChange(ref, oldValue, newValue, reason) {
    if (oldValue === newValue) return;

    this.state.reflog.push({
      id: this.reflogSequence++,
      ref,
      oldValue: oldValue || null,
      newValue: newValue || null,
      reason,
      timestamp: new Date().toISOString()
    });
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
      'INVALID_REPOSITORY',
      'Commands must execute through a GitRepository instance.'
    );
  }

  const validation = validateCommand(repository.state, command);

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
      'UNIMPLEMENTED_COMMAND',
      `No execution handler exists for Git command: ${type}`
    );
  }

  try {
    const result = operation(repository, params);

    if (result.ok && !READ_ONLY_COMMANDS.has(type)) {
      repository.state.commandHistory.push({
        type,
        params: clone(params)
      });
    }

    return {
      ...result,
      phase: 'git'
    };
  } catch (error) {
    return executionError(
      'EXECUTION_ERROR',
      error instanceof Error ? error.message : String(error)
    );
  }
}

function getOperation(type) {
  return READ_OPERATIONS[type] || WRITE_OPERATIONS[type];
}

function createInitialState(input, repo) {
  const commits = createInitialCommits(input, repo);
  const branches = createBranches(input, commits.headCommit);
  const headBranch = input.headBranch || DEFAULTS.branch;
  const headCommit = branches[headBranch] || commits.headCommit;

  return {
    commits: repo.state.commits,
    branches,
    head: {
      type: input.detachedHead ? HEAD_TYPES.DETACHED : HEAD_TYPES.BRANCH,
      branch: input.detachedHead ? null : headBranch,
      commit: headCommit
    },
    workingTree: clone(
      input.workingTree || repo.state.commits[headCommit].tree
    ),
    staging: clone(input.staging || {}),
    remotes: normalizeRemotes(input.remotes || {}),
    remoteTracking: clone(input.remoteTracking || {}),
    tags: clone(input.tags || {}),
    conflicts: [],
    reflog: [],
    stash: [],
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

      const commit = repo.createCommit({
        message: definition.message || `${DEFAULTS.commitPrefix}${repo.commitSequence}`,
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
        message: `${DEFAULTS.commitPrefix}${repo.commitSequence}`,
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

function executionError(code, message) {
  return {
    ok: false,
    error: { code, message },
    phase: 'git'
  };
}
