
const DEFAULT_AUTHOR = { name: 'Player', email: 'player@playroom.local' };

export const COMMANDS = Object.freeze([
  'status', 'log', 'show', 'diff', 'add', 'commit', 'branch', 'switch',
  'merge', 'rebase', 'reset', 'restore', 'revert', 'cherry-pick',
  'fetch', 'pull', 'push', 'stash', 'reflog'
]);

export class GitRepository {
  constructor(input = {}) {
    this.seed = input.seed || 'playroom-git';
    this.commitSequence = 1;
    this.reflogSequence = 1;
    this.state = { commits: {} };
    this.initialState = createInitialState(input, this);
    this.state = clone(this.initialState);
  }

  reset() {
    this.state = clone(this.initialState);
    return this.snapshot();
  }

  snapshot() {
    return clone(this.state);
  }

  execute(command) {
    return executeCommand(this, command);
  }

  createCommit({ message, parents, tree, author = DEFAULT_AUTHOR }) {
    const id = makeCommitId(this.seed, this.commitSequence++, message, parents, tree);
    const commit = {
      id,
      message: String(message),
      parents: parents.filter(Boolean),
      tree: clone(tree),
      author: clone(author),
      date: new Date(Date.now() + this.commitSequence).toISOString()
    };
    commit.changes = diffTrees(
      commit.parents[0] ? this.state.commits[commit.parents[0]]?.tree || {} : {},
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

export function validateCommand(state, command) {
  const normalized = normalizeCommand(command);
  if (!COMMANDS.includes(normalized.type)) {
    return invalid('UNKNOWN_COMMAND', 'Unsupported Git command: ' + (normalized.type || '(empty)'));
  }
  const validator = VALIDATORS[normalized.type];
  return validator
    ? validator(state, normalized.params)
    : { valid: true, command: normalized };
}

export function executeCommand(repository, command) {
  if (!(repository instanceof GitRepository)) {
    return executionError('INVALID_REPOSITORY', 'Commands must execute through a GitRepository instance.');
  }

  const validation = validateCommand(repository.state, command);
  if (!validation.valid) return { ...validation, phase: 'validation' };

  const normalized = validation.command;
  try {
    const result = HANDLERS[normalized.type](repository, normalized.params);
    if (result.ok && !['status', 'log', 'show', 'diff', 'reflog'].includes(normalized.type)) {
      repository.state.commandHistory.push({
        type: normalized.type,
        params: clone(normalized.params)
      });
    }
    return { ...result, phase: 'git' };
  } catch (error) {
    return executionError('EXECUTION_ERROR', error instanceof Error ? error.message : String(error));
  }
}

function createInitialState(input, repo) {
  let tree = clone(input.files || { 'README.md': '# Repository' });
  let parent = null;

  if (Array.isArray(input.commits) && input.commits.length) {
    for (const definition of input.commits) {
      tree = definition.tree ? clone(definition.tree) : applyChanges(tree, definition.changes);
      const commit = repo.createCommit({
        message: definition.message || 'Commit ' + repo.commitSequence,
        parents: definition.parents || (parent ? [parent] : []),
        tree,
        author: definition.author || DEFAULT_AUTHOR
      });
      parent = commit.id;
    }
  } else {
    const root = repo.createCommit({
      message: input.initialMessage || 'Initial commit',
      parents: [],
      tree,
      author: input.author || DEFAULT_AUTHOR
    });
    parent = root.id;

    for (const changes of input.history || []) {
      tree = applyChanges(tree, changes);
      parent = repo.createCommit({
        message: 'Commit ' + repo.commitSequence,
        parents: [parent],
        tree,
        author: input.author || DEFAULT_AUTHOR
      }).id;
    }
  }

  const main = input.defaultBranch || 'main';
  const branches = { [main]: parent, ...clone(input.branches || {}) };
  const headBranch = input.headBranch || main;
  const headCommit = branches[headBranch] || parent;

  return {
    commits: repo.state.commits,
    branches,
    head: {
      type: input.detachedHead ? 'detached' : 'branch',
      branch: input.detachedHead ? null : headBranch,
      commit: headCommit
    },
    workingTree: clone(input.workingTree || repo.state.commits[headCommit].tree),
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

const VALIDATORS = {
  status: (s, p) => ({ valid: true, command: { type: 'status', params: p } }),
  log: (s, p) => optionalCommit(s, p.commit, 'log'),
  show: (s, p) => existingCommit(s, p.commit, 'show'),
  diff: (s, p) => ({ valid: true, command: { type: 'diff', params: p } }),
  add: (s, p) => existingFile(s, p.file),
  commit: (s, p) => {
    if (!String(p.message || '').trim()) return invalid('EMPTY_MESSAGE', 'Commit message cannot be empty.');
    if (!Object.keys(s.staging).length) return invalid('NOTHING_STAGED', 'There is nothing staged to commit.');
    if (s.conflicts.length) return invalid('UNRESOLVED_CONFLICTS', 'Resolve merge conflicts before committing.');
    return { valid: true, command: { type: 'commit', params: p } };
  },
  branch: (s, p) => {
    if (!isRefName(p.name)) return invalid('INVALID_REF', 'Invalid branch name: ' + (p.name || ''));
    if (p.delete ? !s.branches[p.name] : s.branches[p.name]) {
      return invalid(p.delete ? 'UNKNOWN_BRANCH' : 'BRANCH_EXISTS',
        p.delete ? 'Unknown branch: ' + p.name : 'Branch already exists: ' + p.name);
    }
    if (p.startPoint && !s.commits[p.startPoint]) return invalid('UNKNOWN_COMMIT', 'Unknown commit: ' + p.startPoint);
    return { valid: true, command: { type: 'branch', params: p } };
  },
  switch: (s, p) => {
    if (!s.branches[p.branch]) return invalid('UNKNOWN_BRANCH', 'Unknown branch: ' + p.branch);
    if (hasChanges(s)) return invalid('DIRTY_WORKTREE', 'Local changes would be overwritten by switching branches.');
    return { valid: true, command: { type: 'switch', params: p } };
  },
  merge: (s, p) => branchOperation(s, p, 'merge'),
  rebase: (s, p) => branchOperation(s, p, 'rebase'),
  reset: (s, p) => {
    if (!s.commits[p.commit]) return invalid('UNKNOWN_COMMIT', 'Unknown commit: ' + p.commit);
    if (!['soft', 'mixed', 'hard'].includes(p.mode || 'mixed')) {
      return invalid('INVALID_MODE', 'Reset mode must be soft, mixed, or hard.');
    }
    return { valid: true, command: { type: 'reset', params: p } };
  },
  restore: (s, p) => {
    if (!p.file) return invalid('EMPTY_FILE', 'A file is required.');
    if (p.source && !s.commits[p.source]) return invalid('UNKNOWN_COMMIT', 'Unknown commit: ' + p.source);
    return { valid: true, command: { type: 'restore', params: p } };
  },
  revert: (s, p) => existingCommit(s, p.commit, 'revert'),
  'cherry-pick': (s, p) => existingCommit(s, p.commit, 'cherry-pick'),
  fetch: (s, p) => remote(s, p.remote, 'fetch'),
  pull: (s, p) => remote(s, p.remote, 'pull'),
  push: (s, p) => remote(s, p.remote, 'push'),
  stash: (s, p) => {
    if (p.action === 'apply' || p.action === 'pop') {
      return s.stash.length
        ? { valid: true, command: { type: 'stash', params: p } }
        : invalid('EMPTY_STASH', 'There are no stashed changes.');
    }
    return hasChanges(s)
      ? { valid: true, command: { type: 'stash', params: p } }
      : invalid('CLEAN_WORKTREE', 'There are no local changes to stash.');
  },
  reflog: (s, p) => ({ valid: true, command: { type: 'reflog', params: p } })
};

const HANDLERS = {
  status: repo => ok(status(repo.state)),
  log: (repo, p) => ok(log(repo.state, p.commit, p.limit)),
  show: (repo, p) => ok(show(repo.state, p.commit)),
  diff: (repo, p) => ok(diff(repo.state, p.file)),
  reflog: repo => ok(clone(repo.state.reflog)),

  add: (repo, p) => {
    repo.state.staging[p.file] = Object.prototype.hasOwnProperty.call(repo.state.workingTree, p.file)
      ? repo.state.workingTree[p.file]
      : null;
    return ok({ changes: [{ type: 'stage', file: p.file }] });
  },

  commit: (repo, p) => {
    const old = repo.state.head.commit;
    const tree = applyChanges(repo.state.commits[old].tree, repo.state.staging);
    const commit = repo.createCommit({
      message: p.message,
      parents: [old],
      tree,
      author: p.author || DEFAULT_AUTHOR
    });
    repo.state.branches[repo.state.head.branch] = commit.id;
    repo.state.head.commit = commit.id;
    repo.state.workingTree = clone(tree);
    repo.state.staging = {};
    repo.state.conflicts = [];
    repo.refChange('refs/heads/' + repo.state.head.branch, old, commit.id, 'commit: ' + commit.message);
    return ok({ commit: clone(commit), changes: [{ type: 'commit', commit: commit.id }] });
  },

  branch: (repo, p) => {
    if (p.delete) {
      const old = repo.state.branches[p.name];
      delete repo.state.branches[p.name];
      repo.refChange('refs/heads/' + p.name, old, null, 'branch deleted');
      return ok({ deleted: p.name });
    }
    const commit = p.startPoint || repo.state.head.commit;
    repo.state.branches[p.name] = commit;
    repo.refChange('refs/heads/' + p.name, null, commit, 'branch created');
    return ok({ created: p.name, commit });
  },

  switch: (repo, p) => {
    const old = repo.state.head.commit;
    repo.state.head = {
      type: 'branch',
      branch: p.branch,
      commit: repo.state.branches[p.branch]
    };
    repo.state.workingTree = clone(repo.state.commits[p.branch ? repo.state.branches[p.branch] : old].tree);
    repo.state.staging = {};
    repo.refChange('HEAD', old, repo.state.head.commit, 'switch: ' + p.branch);
    return ok({ head: clone(repo.state.head), changes: [{ type: 'head', from: old, to: repo.state.head.commit }] });
  },

  merge: (repo, p) => merge(repo, p.branch),
  rebase: (repo, p) => rebase(repo, p.branch),
  reset: (repo, p) => reset(repo, p),
  restore: (repo, p) => restore(repo, p),
  revert: (repo, p) => applyInverseCommit(repo, p.commit),
  'cherry-pick': (repo, p) => applyCommit(repo, p.commit),
  fetch: (repo, p) => fetchRemote(repo, p.remote),
  pull: (repo, p) => pull(repo, p),
  push: (repo, p) => pushRemote(repo, p.remote, p.branch),
  stash: (repo, p) => stash(repo, p)
};

function merge(repo, branch) {
  const ours = repo.state.head.commit;
  const theirs = repo.state.branches[branch];

  if (isAncestor(repo.state.commits, ours, theirs)) {
    repo.state.branches[repo.state.head.branch] = theirs;
    repo.state.head.commit = theirs;
    repo.state.workingTree = clone(repo.state.commits[theirs].tree);
    repo.refChange('refs/heads/' + repo.state.head.branch, ours, theirs, 'merge: ' + branch);
    return ok({ fastForward: true, changes: [{ type: 'head', from: ours, to: theirs }] });
  }

  const base = findMergeBase(repo.state.commits, ours, theirs);
  const merged = mergeTrees(
    repo.state.commits[base]?.tree || {},
    repo.state.commits[ours].tree,
    repo.state.commits[theirs].tree
  );

  repo.state.workingTree = clone(merged.tree);

  if (merged.conflicts.length) {
    repo.state.conflicts = merged.conflicts;
    return gitError('MERGE_CONFLICT', 'Automatic merge failed; resolve conflicts and commit the result.', {
      conflicts: clone(merged.conflicts)
    });
  }

  const commit = repo.createCommit({
    message: 'Merge branch ' + branch,
    parents: [ours, theirs],
    tree: merged.tree
  });
  repo.state.branches[repo.state.head.branch] = commit.id;
  repo.state.head.commit = commit.id;
  repo.state.staging = {};
  repo.refChange('refs/heads/' + repo.state.head.branch, ours, commit.id, 'merge: ' + branch);
  return ok({ commit: clone(commit), changes: [{ type: 'merge', commit: commit.id }] });
}

function rebase(repo, branch) {
  const current = repo.state.head.commit;
  const target = repo.state.branches[branch];

  if (isAncestor(repo.state.commits, current, target)) {
    repo.state.branches[repo.state.head.branch] = target;
    repo.state.head.commit = target;
    repo.state.workingTree = clone(repo.state.commits[target].tree);
    return ok({ fastForward: true, changes: [{ type: 'head', from: current, to: target }] });
  }

  const base = findMergeBase(repo.state.commits, current, target);
  const originals = firstParentPath(repo.state.commits, base, current);
  let parent = target;
  const rewritten = [];

  for (const id of originals) {
    const old = repo.state.commits[id];
    const oldParent = repo.state.commits[old.parents[0]];
    const patch = diffTrees(oldParent?.tree || {}, old.tree);
    const tree = applyPatch(repo.state.commits[parent].tree, patch);
    const next = repo.createCommit({
      message: old.message,
      parents: [parent],
      tree,
      author: old.author
    });
    parent = next.id;
    rewritten.push({ from: id, to: next.id });
  }

  const oldHead = current;
  repo.state.branches[repo.state.head.branch] = parent;
  repo.state.head.commit = parent;
  repo.state.workingTree = clone(repo.state.commits[parent].tree);
  repo.refChange('refs/heads/' + repo.state.head.branch, oldHead, parent, 'rebase: ' + branch);
  return ok({ rewritten, changes: [{ type: 'rebase', rewritten }] });
}

function reset(repo, params) {
  const old = repo.state.head.commit;
  const target = repo.state.commits[params.commit];

  repo.state.branches[repo.state.head.branch] = target.id;
  repo.state.head.commit = target.id;

  if (params.mode === 'hard') {
    repo.state.workingTree = clone(target.tree);
    repo.state.staging = {};
  } else if ((params.mode || 'mixed') === 'mixed') {
    repo.state.staging = {};
  }

  repo.refChange('refs/heads/' + repo.state.head.branch, old, target.id, 'reset: ' + (params.mode || 'mixed'));
  return ok({
    from: old,
    to: target.id,
    mode: params.mode || 'mixed',
    changes: [{ type: 'ref', from: old, to: target.id }]
  });
}

function restore(repo, params) {
  const tree = repo.state.commits[params.source || repo.state.head.commit].tree;
  if (Object.prototype.hasOwnProperty.call(tree, params.file)) {
    repo.state.workingTree[params.file] = tree[params.file];
  } else {
    delete repo.state.workingTree[params.file];
  }
  if (params.staged) repo.state.staging[params.file] = tree[params.file] ?? null;
  return ok({ restored: params.file, source: params.source || repo.state.head.commit });
}

function applyInverseCommit(repo, commitId) {
  const commit = repo.state.commits[commitId];
  const parent = repo.state.commits[commit.parents[0]];
  const tree = applyPatch(repo.state.workingTree, diffTrees(commit.tree, parent?.tree || {}));
  return makeCommit(repo, tree, 'Revert "' + commit.message + '"', 'revert', commitId);
}

function applyCommit(repo, commitId) {
  const commit = repo.state.commits[commitId];
  const parent = repo.state.commits[commit.parents[0]];
  const tree = applyPatch(repo.state.workingTree, diffTrees(parent?.tree || {}, commit.tree));
  return makeCommit(repo, tree, commit.message, 'cherry-pick', commitId, commit.author);
}

function makeCommit(repo, tree, message, kind, source, author = DEFAULT_AUTHOR) {
  const old = repo.state.head.commit;
  const commit = repo.createCommit({ message, parents: [old], tree, author });
  repo.state.branches[repo.state.head.branch] = commit.id;
  repo.state.head.commit = commit.id;
  repo.state.workingTree = clone(tree);
  repo.state.staging = {};
  repo.state.conflicts = [];
  repo.refChange('refs/heads/' + repo.state.head.branch, old, commit.id, kind + ': ' + source);
  return ok({ commit: clone(commit), changes: [{ type: kind, from: source, to: commit.id }] });
}

function fetchRemote(repo, name) {
  const remote = repo.state.remotes[name];
  const changes = [];

  for (const [branch, commit] of Object.entries(remote.branches || {})) {
    const ref = name + '/' + branch;
    const old = repo.state.remoteTracking[ref] || null;
    repo.state.remoteTracking[ref] = commit;
    if (old !== commit) changes.push({ type: 'remote-ref', ref, from: old, to: commit });

    for (const id of reachable(repo.state.commits, commit)) {
      if (!repo.state.commits[id] && remote.commits?.[id]) {
        repo.state.commits[id] = clone(remote.commits[id]);
      }
    }
  }

  return ok({ remote: name, changes });
}

function pull(repo, params) {
  const fetched = fetchRemote(repo, params.remote);
  const branch = params.branch || repo.state.head.branch;
  const remoteId = repo.state.remoteTracking[params.remote + '/' + branch];

  if (!remoteId) {
    return gitError('NO_REMOTE_BRANCH', 'Remote branch does not exist: ' + branch, fetched.data);
  }
  if (remoteId === repo.state.head.commit) return ok({ ...fetched.data, upToDate: true });

  if (isAncestor(repo.state.commits, repo.state.head.commit, remoteId)) {
    const old = repo.state.head.commit;
    repo.state.branches[branch] = remoteId;
    repo.state.head.commit = remoteId;
    repo.state.workingTree = clone(repo.state.commits[remoteId].tree);
    repo.refChange('refs/heads/' + branch, old, remoteId, 'pull: ' + params.remote + '/' + branch);
    return ok({ ...fetched.data, fastForward: true });
  }

  const original = repo.state.branches[branch];
  const temp = params.remote + '/' + branch;
  repo.state.branches[temp] = remoteId;
  const result = merge(repo, temp);
  delete repo.state.branches[temp];
  repo.state.branches[branch] = repo.state.head.commit || original;
  return result.ok ? ok({ ...fetched.data, ...result.data }) : result;
}

function pushRemote(repo, remoteName, branchName) {
  const branch = branchName || repo.state.head.branch;
  const remote = repo.state.remotes[remoteName];
  const local = repo.state.branches[branch];
  const remoteId = remote.branches?.[branch];

  if (remoteId && !isAncestor(repo.state.commits, remoteId, local)) {
    return gitError('NON_FAST_FORWARD', 'Remote ' + remoteName + '/' + branch + ' contains work not in the local branch.');
  }

  remote.branches ||= {};
  remote.commits ||= {};
  remote.branches[branch] = local;

  for (const id of reachable(repo.state.commits, local)) {
    remote.commits[id] = clone(repo.state.commits[id]);
  }

  repo.state.remoteTracking[remoteName + '/' + branch] = local;
  return ok({
    remote: remoteName,
    branch,
    commit: local,
    changes: [{ type: 'push', ref: remoteName + '/' + branch, to: local }]
  });
}

function stash(repo, params) {
  if (params.action === 'apply' || params.action === 'pop') {
    const entry = repo.state.stash[0];
    const base = repo.state.commits[entry.head]?.tree || {};
    repo.state.workingTree = applyPatch(repo.state.workingTree, diffTrees(base, entry.workingTree));
    repo.state.staging = clone(entry.staging);
    if (params.action === 'pop') repo.state.stash.shift();
    return ok({ action: params.action, changes: [{ type: 'stash-apply' }] });
  }

  repo.state.stash.unshift({
    message: params.message || 'WIP',
    head: repo.state.head.commit,
    workingTree: clone(repo.state.workingTree),
    staging: clone(repo.state.staging),
    timestamp: new Date().toISOString()
  });
  repo.state.workingTree = clone(repo.state.commits[repo.state.head.commit].tree);
  repo.state.staging = {};
  return ok({ action: 'push', changes: [{ type: 'stash' }] });
}

function status(state) {
  const head = state.commits[state.head.commit]?.tree || {};
  const stagedTree = applyChanges(head, state.staging);
  return {
    head: clone(state.head),
    staged: diffTrees(head, stagedTree),
    unstaged: diffTrees(stagedTree, state.workingTree),
    conflicts: clone(state.conflicts),
    clean: !hasChanges(state) && !state.conflicts.length
  };
}

function log(state, start = state.head.commit, limit = 20) {
  const result = [];
  const queue = [start];
  const seen = new Set();

  while (queue.length && result.length < Math.max(1, Number(limit) || 20)) {
    const id = queue.shift();
    if (!id || seen.has(id) || !state.commits[id]) continue;
    seen.add(id);
    const commit = state.commits[id];
    result.push({
      id: commit.id,
      message: commit.message,
      parents: clone(commit.parents),
      author: clone(commit.author),
      date: commit.date
    });
    queue.push(...commit.parents);
  }
  return result;
}

function show(state, id = state.head.commit) {
  const commit = state.commits[id];
  return {
    commit: clone(commit),
    branches: Object.entries(state.branches).filter(([, value]) => value === id).map(([name]) => name),
    tags: Object.entries(state.tags).filter(([, value]) => value === id).map(([name]) => name)
  };
}

function diff(state, file) {
  const changes = diffTrees(state.commits[state.head.commit]?.tree || {}, state.workingTree);
  return file ? changes.filter(change => change.file === file) : changes;
}

function mergeTrees(base, ours, theirs) {
  const tree = {};
  const conflicts = [];
  const files = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);

  for (const file of files) {
    const baseValue = base[file];
    const oursValue = ours[file];
    const theirsValue = theirs[file];
    const oursChanged = oursValue !== baseValue;
    const theirsChanged = theirsValue !== baseValue;

    if (oursChanged && theirsChanged && oursValue !== theirsValue) {
      conflicts.push({
        file,
        base: baseValue ?? null,
        ours: oursValue ?? null,
        theirs: theirsValue ?? null
      });
      tree[file] = '<<<<<<< HEAD\n' + (oursValue ?? '') + '\n=======\n' +
        (theirsValue ?? '') + '\n>>>>>>> incoming\n';
    } else if (theirsChanged) {
      if (theirsValue !== undefined) tree[file] = theirsValue;
    } else if (oursValue !== undefined) {
      tree[file] = oursValue;
    }
  }

  return { tree, conflicts };
}

function diffTrees(from = {}, to = {}) {
  const files = new Set([...Object.keys(from), ...Object.keys(to)]);
  return [...files].sort().flatMap(file => {
    if (from[file] === to[file]) return [];
    return [{
      file,
      oldValue: from[file] ?? null,
      newValue: to[file] ?? null,
      status: from[file] === undefined ? 'added' : to[file] === undefined ? 'deleted' : 'modified'
    }];
  });
}

function applyChanges(tree, changes = {}) {
  const next = clone(tree);
  for (const [file, value] of Object.entries(changes || {})) {
    if (value === null || value === undefined) delete next[file];
    else next[file] = value;
  }
  return next;
}

function applyPatch(tree, patch) {
  const next = clone(tree);
  for (const change of patch) {
    if (change.newValue === null) delete next[change.file];
    else next[change.file] = change.newValue;
  }
  return next;
}

function hasChanges(state) {
  const head = state.commits[state.head.commit]?.tree || {};
  return diffTrees(head, state.workingTree).length > 0 || Object.keys(state.staging).length > 0;
}

function branchOperation(state, params, type) {
  if (!state.branches[params.branch]) return invalid('UNKNOWN_BRANCH', 'Unknown branch: ' + params.branch);
  if (state.head.type !== 'branch') return invalid('DETACHED_HEAD', type + ' requires HEAD to be attached to a branch.');
  if (hasChanges(state)) return invalid('DIRTY_WORKTREE', 'Commit or stash local changes before ' + type + '.');
  return { valid: true, command: { type, params } };
}

function existingCommit(state, commit, type) {
  return state.commits[commit]
    ? { valid: true, command: { type, params: { commit } } }
    : invalid('UNKNOWN_COMMIT', 'Unknown commit: ' + commit);
}

function optionalCommit(state, commit, type) {
  return !commit || state.commits[commit]
    ? { valid: true, command: { type, params: { commit } } }
    : invalid('UNKNOWN_COMMIT', 'Unknown commit: ' + commit);
}

function existingFile(state, file) {
  return Object.prototype.hasOwnProperty.call(state.workingTree, file)
    ? { valid: true, command: { type: 'add', params: { file } } }
    : invalid('UNKNOWN_FILE', 'File does not exist: ' + file);
}

function remote(state, name, type) {
  return state.remotes[name]
    ? { valid: true, command: { type, params: { remote: name } } }
    : invalid('UNKNOWN_REMOTE', 'Unknown remote: ' + name);
}

function normalizeCommand(command) {
  if (typeof command === 'string') return { type: command.trim(), params: {} };
  return {
    type: String(command?.type || '').trim(),
    params: clone(command?.params || {})
  };
}

function normalizeRemotes(remotes) {
  return Object.fromEntries(Object.entries(remotes).map(([name, value]) => [
    name,
    typeof value === 'string'
      ? { url: value, branches: {}, commits: {} }
      : {
        url: value?.url || '',
        branches: clone(value?.branches || {}),
        commits: clone(value?.commits || {})
      }
  ]));
}

function isRefName(name) {
  const value = String(name || '');
  return /^[A-Za-z0-9._/-]+$/.test(value) &&
    !value.includes('..') &&
    !value.includes('//') &&
    !value.endsWith('/') &&
    !value.endsWith('.');
}

function findMergeBase(commits, a, b) {
  const ancestors = new Set();
  const queue = [a];

  while (queue.length) {
    const id = queue.shift();
    if (!id || ancestors.has(id) || !commits[id]) continue;
    ancestors.add(id);
    queue.push(...commits[id].parents);
  }

  queue.push(b);
  while (queue.length) {
    const id = queue.shift();
    if (!id || !commits[id]) continue;
    if (ancestors.has(id)) return id;
    queue.push(...commits[id].parents);
  }
  return null;
}

function isAncestor(commits, ancestor, descendant) {
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

function firstParentPath(commits, base, head) {
  const result = [];
  let id = head;
  while (id && id !== base) {
    result.unshift(id);
    id = commits[id]?.parents[0];
  }
  return result;
}

function reachable(commits, start) {
  const result = [];
  const queue = [start];
  const seen = new Set();

  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id) || !commits[id]) continue;
    seen.add(id);
    result.push(id);
    queue.push(...commits[id].parents);
  }
  return result;
}

function makeCommitId(seed, number, message, parents, tree) {
  const value = JSON.stringify({ seed, number, message, parents, tree });
  return (hash(value) + hash(value + 1) + hash(value + 2) + hash(value + 3)).slice(0, 40);
}

function hash(value) {
  let hashValue = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hashValue ^= value.charCodeAt(index);
    hashValue = Math.imul(hashValue, 0x01000193);
  }
  return (hashValue >>> 0).toString(16).padStart(8, '0');
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function ok(data = {}) {
  return { ok: true, data, error: null };
}

function invalid(code, message) {
  return { valid: false, error: { code, message } };
}

function gitError(code, message, data = {}) {
  return { ok: false, data, error: { code, message } };
}

function executionError(code, message) {
  return { ok: false, error: { code, message } };
}
