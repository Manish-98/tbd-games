import { DEFAULTS } from './constants.js';
import {
  applyChanges,
  applyPatch,
  clone,
  diffTrees,
  findMergeBase,
  firstParentPath,
  hasChanges,
  isAncestor,
  reachable
} from './utils.js';

export const READ_OPERATIONS = {
  status: repo => success(getStatus(repo.state)),
  log: (repo, params) => success(getLog(repo.state, params.commit, params.limit)),
  show: (repo, params) => success(getShow(repo.state, params.commit)),
  diff: (repo, params) => success(getDiff(repo.state, params.file)),
  reflog: repo => success(clone(repo.state.reflog))
};

export const WRITE_OPERATIONS = {
  add: stageFile,
  commit: commit,
  branch: updateBranch,
  switch: switchBranch,
  merge: (repo, params) => merge(repo, params.branch),
  rebase: (repo, params) => rebase(repo, params.branch),
  reset: reset,
  restore: restore,
  revert: (repo, params) => applyCommitInverse(repo, params.commit),
  'cherry-pick': (repo, params) => applyCommit(repo, params.commit),
  fetch: (repo, params) => fetchRemote(repo, params.remote),
  pull: pull,
  push: (repo, params) => pushRemote(repo, params.remote, params.branch),
  stash: stash
};

function stageFile(repo, params) {
  repo.state.staging[params.file] = Object.prototype.hasOwnProperty.call(
    repo.state.workingTree,
    params.file
  )
    ? repo.state.workingTree[params.file]
    : null;

  return success({
    changes: [{ type: 'stage', file: params.file }]
  });
}

function commit(repo, params) {
  const parent = repo.state.head.commit;
  const tree = applyChanges(
    repo.state.commits[parent].tree,
    repo.state.staging
  );
  const commit = repo.createCommit({
    message: params.message,
    parents: [parent],
    tree,
    author: params.author || DEFAULTS.author
  });

  moveHead(repo, commit.id);
  repo.state.workingTree = clone(tree);
  repo.state.staging = {};
  repo.state.conflicts = [];
  repo.refChange(
    headRef(repo),
    parent,
    commit.id,
    `commit: ${commit.message}`
  );

  return success({
    commit: clone(commit),
    changes: [{ type: 'commit', commit: commit.id }]
  });
}

function updateBranch(repo, params) {
  if (params.delete) {
    const old = repo.state.branches[params.name];
    delete repo.state.branches[params.name];
    repo.refChange(
      branchRef(params.name),
      old,
      null,
      'branch deleted'
    );

    return success({ deleted: params.name });
  }

  const commit = params.startPoint || repo.state.head.commit;
  repo.state.branches[params.name] = commit;
  repo.refChange(
    branchRef(params.name),
    null,
    commit,
    'branch created'
  );

  return success({ created: params.name, commit });
}

function switchBranch(repo, params) {
  const previousCommit = repo.state.head.commit;
  const nextCommit = repo.state.branches[params.branch];

  repo.state.head = {
    type: 'branch',
    branch: params.branch,
    commit: nextCommit
  };
  repo.state.workingTree = clone(repo.state.commits[nextCommit].tree);
  repo.state.staging = {};
  repo.refChange('HEAD', previousCommit, nextCommit, `switch: ${params.branch}`);

  return success({
    head: clone(repo.state.head),
    changes: [{ type: 'head', from: previousCommit, to: nextCommit }]
  });
}

function merge(repo, branch) {
  const ours = repo.state.head.commit;
  const theirs = repo.state.branches[branch];

  if (isAncestor(repo.state.commits, ours, theirs)) {
    moveHead(repo, theirs);
    repo.state.workingTree = clone(repo.state.commits[theirs].tree);
    repo.refChange(headRef(repo), ours, theirs, `merge: ${branch}`);

    return success({
      fastForward: true,
      changes: [{ type: 'head', from: ours, to: theirs }]
    });
  }

  const base = findMergeBase(repo.state.commits, ours, theirs);
  const result = mergeTrees(
    repo.state.commits[base]?.tree || {},
    repo.state.commits[ours].tree,
    repo.state.commits[theirs].tree
  );

  repo.state.workingTree = clone(result.tree);

  if (result.conflicts.length) {
    repo.state.conflicts = result.conflicts;

    return gitFailure(
      'MERGE_CONFLICT',
      'Automatic merge failed; resolve conflicts and commit the result.',
      { conflicts: clone(result.conflicts) }
    );
  }

  const commit = repo.createCommit({
    message: `Merge branch ${branch}`,
    parents: [ours, theirs],
    tree: result.tree
  });

  moveHead(repo, commit.id);
  repo.state.staging = {};
  repo.refChange(headRef(repo), ours, commit.id, `merge: ${branch}`);

  return success({
    commit: clone(commit),
    changes: [{ type: 'merge', commit: commit.id }]
  });
}

function rebase(repo, branch) {
  const current = repo.state.head.commit;
  const target = repo.state.branches[branch];

  if (isAncestor(repo.state.commits, current, target)) {
    moveHead(repo, target);
    repo.state.workingTree = clone(repo.state.commits[target].tree);

    return success({
      fastForward: true,
      changes: [{ type: 'head', from: current, to: target }]
    });
  }

  const base = findMergeBase(repo.state.commits, current, target);
  const originalCommits = firstParentPath(
    repo.state.commits,
    base,
    current
  );

  let parent = target;
  const rewritten = [];

  for (const originalId of originalCommits) {
    const original = repo.state.commits[originalId];
    const originalParent = repo.state.commits[original.parents[0]];
    const patch = diffTrees(
      originalParent?.tree || {},
      original.tree
    );
    const tree = applyPatch(repo.state.commits[parent].tree, patch);
    const replacement = repo.createCommit({
      message: original.message,
      parents: [parent],
      tree,
      author: original.author
    });

    parent = replacement.id;
    rewritten.push({ from: originalId, to: replacement.id });
  }

  moveHead(repo, parent);
  repo.state.workingTree = clone(repo.state.commits[parent].tree);
  repo.refChange(headRef(repo), current, parent, `rebase: ${branch}`);

  return success({
    rewritten,
    changes: [{ type: 'rebase', rewritten }]
  });
}

function reset(repo, params) {
  const previous = repo.state.head.commit;
  const target = repo.state.commits[params.commit];

  moveHead(repo, target.id);

  if (params.mode === 'hard') {
    repo.state.workingTree = clone(target.tree);
    repo.state.staging = {};
  } else if (params.mode === 'mixed') {
    repo.state.staging = {};
  }

  repo.refChange(
    headRef(repo),
    previous,
    target.id,
    `reset: ${params.mode}`
  );

  return success({
    from: previous,
    to: target.id,
    mode: params.mode,
    changes: [{ type: 'ref', from: previous, to: target.id }]
  });
}

function restore(repo, params) {
  const sourceCommit = params.source || repo.state.head.commit;
  const sourceTree = repo.state.commits[sourceCommit].tree;

  if (Object.prototype.hasOwnProperty.call(sourceTree, params.file)) {
    repo.state.workingTree[params.file] = sourceTree[params.file];
  } else {
    delete repo.state.workingTree[params.file];
  }

  if (params.staged) {
    repo.state.staging[params.file] = sourceTree[params.file] ?? null;
  }

  return success({
    restored: params.file,
    source: sourceCommit
  });
}

function applyCommitInverse(repo, commitId) {
  const commit = repo.state.commits[commitId];
  const parent = repo.state.commits[commit.parents[0]];
  const patch = diffTrees(commit.tree, parent?.tree || {});
  const tree = applyPatch(repo.state.workingTree, patch);

  return createDerivedCommit(
    repo,
    tree,
    `Revert "${commit.message}"`,
    'revert',
    commitId
  );
}

function applyCommit(repo, commitId) {
  const commit = repo.state.commits[commitId];
  const parent = repo.state.commits[commit.parents[0]];
  const patch = diffTrees(parent?.tree || {}, commit.tree);
  const tree = applyPatch(repo.state.workingTree, patch);

  return createDerivedCommit(
    repo,
    tree,
    commit.message,
    'cherry-pick',
    commitId,
    commit.author
  );
}

function createDerivedCommit(
  repo,
  tree,
  message,
  operation,
  source,
  author = DEFAULTS.author
) {
  const parent = repo.state.head.commit;
  const commit = repo.createCommit({
    message,
    parents: [parent],
    tree,
    author
  });

  moveHead(repo, commit.id);
  repo.state.workingTree = clone(tree);
  repo.state.staging = {};
  repo.state.conflicts = [];
  repo.refChange(
    headRef(repo),
    parent,
    commit.id,
    `${operation}: ${source}`
  );

  return success({
    commit: clone(commit),
    changes: [{ type: operation, from: source, to: commit.id }]
  });
}

function fetchRemote(repo, name) {
  const remote = repo.state.remotes[name];
  const changes = [];

  for (const [branch, commit] of Object.entries(remote.branches || {})) {
    const ref = remoteRef(name, branch);
    const previous = repo.state.remoteTracking[ref] || null;

    repo.state.remoteTracking[ref] = commit;

    if (previous !== commit) {
      changes.push({
        type: 'remote-ref',
        ref,
        from: previous,
        to: commit
      });
    }

    for (const id of reachable(remote.commits, commit)) {
      if (!repo.state.commits[id] && remote.commits?.[id]) {
        repo.state.commits[id] = clone(remote.commits[id]);
      }
    }
  }

  return success({ remote: name, changes });
}

function pull(repo, params) {
  const fetched = fetchRemote(repo, params.remote);
  const branch = params.branch || repo.state.head.branch;
  const remoteId = repo.state.remoteTracking[remoteRef(params.remote, branch)];

  if (!remoteId) {
    return gitFailure(
      'NO_REMOTE_BRANCH',
      `Remote branch does not exist: ${branch}`,
      fetched.data
    );
  }

  if (remoteId === repo.state.head.commit) {
    return success({ ...fetched.data, upToDate: true });
  }

  if (isAncestor(repo.state.commits, repo.state.head.commit, remoteId)) {
    const previous = repo.state.head.commit;

    repo.state.branches[branch] = remoteId;
    repo.state.head.commit = remoteId;
    repo.state.workingTree = clone(repo.state.commits[remoteId].tree);
    repo.refChange(
      branchRef(branch),
      previous,
      remoteId,
      `pull: ${remoteRef(params.remote, branch)}`
    );

    return success({ ...fetched.data, fastForward: true });
  }

  const original = repo.state.branches[branch];
  const temporaryBranch = remoteRef(params.remote, branch);

  repo.state.branches[temporaryBranch] = remoteId;
  const result = merge(repo, temporaryBranch);
  delete repo.state.branches[temporaryBranch];
  repo.state.branches[branch] = repo.state.head.commit || original;

  return result.ok
    ? success({ ...fetched.data, ...result.data })
    : result;
}

function pushRemote(repo, remoteName, branch) {
  const remote = repo.state.remotes[remoteName];
  const local = repo.state.branches[branch];
  const remoteId = remote.branches?.[branch];

  if (remoteId && !isAncestor(repo.state.commits, remoteId, local)) {
    return gitFailure(
      'NON_FAST_FORWARD',
      `Remote ${remoteRef(remoteName, branch)} contains work not in the local branch.`
    );
  }

  remote.branches ||= {};
  remote.commits ||= {};
  remote.branches[branch] = local;

  for (const id of reachable(repo.state.commits, local)) {
    remote.commits[id] = clone(repo.state.commits[id]);
  }

  repo.state.remoteTracking[remoteRef(remoteName, branch)] = local;

  return success({
    remote: remoteName,
    branch,
    commit: local,
    changes: [{
      type: 'push',
      ref: remoteRef(remoteName, branch),
      to: local
    }]
  });
}

function stash(repo, params) {
  if (params.action === 'apply' || params.action === 'pop') {
    const entry = repo.state.stash[0];
    const base = repo.state.commits[entry.head]?.tree || {};

    repo.state.workingTree = applyPatch(
      repo.state.workingTree,
      diffTrees(base, entry.workingTree)
    );
    repo.state.staging = clone(entry.staging);

    if (params.action === 'pop') {
      repo.state.stash.shift();
    }

    return success({
      action: params.action,
      changes: [{ type: 'stash-apply' }]
    });
  }

  repo.state.stash.unshift({
    message: params.message || DEFAULTS.stashMessage,
    head: repo.state.head.commit,
    workingTree: clone(repo.state.workingTree),
    staging: clone(repo.state.staging),
    timestamp: new Date().toISOString()
  });
  repo.state.workingTree = clone(
    repo.state.commits[repo.state.head.commit].tree
  );
  repo.state.staging = {};

  return success({
    action: 'push',
    changes: [{ type: 'stash' }]
  });
}

function getStatus(state) {
  const headTree = state.commits[state.head.commit]?.tree || {};
  const stagedTree = applyChanges(headTree, state.staging);

  return {
    head: clone(state.head),
    staged: diffTrees(headTree, stagedTree),
    unstaged: diffTrees(stagedTree, state.workingTree),
    conflicts: clone(state.conflicts),
    clean: !hasChanges(state) && state.conflicts.length === 0
  };
}

function getLog(state, start = state.head.commit, limit = DEFAULTS.logLimit) {
  const result = [];
  const queue = [start];
  const seen = new Set();
  const maxEntries = Math.max(1, Number(limit) || DEFAULTS.logLimit);

  while (queue.length && result.length < maxEntries) {
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

function getShow(state, id = state.head.commit) {
  const commit = state.commits[id];

  return {
    commit: clone(commit),
    branches: refsAtCommit(state.branches, id),
    tags: refsAtCommit(state.tags, id)
  };
}

function getDiff(state, file) {
  const changes = diffTrees(
    state.commits[state.head.commit]?.tree || {},
    state.workingTree
  );

  return file
    ? changes.filter(change => change.file === file)
    : changes;
}

function mergeTrees(base, ours, theirs) {
  const tree = {};
  const conflicts = [];
  const files = new Set([
    ...Object.keys(base),
    ...Object.keys(ours),
    ...Object.keys(theirs)
  ]);

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
      tree[file] = conflictText(oursValue, theirsValue);
    } else if (theirsChanged) {
      if (theirsValue !== undefined) tree[file] = theirsValue;
    } else if (oursValue !== undefined) {
      tree[file] = oursValue;
    }
  }

  return { tree, conflicts };
}

function conflictText(ours, theirs) {
  return [
    '<<<<<<< HEAD',
    ours ?? '',
    '=======',
    theirs ?? '',
    '>>>>>>> incoming',
    ''
  ].join('\n');
}

function refsAtCommit(refs, commit) {
  return Object.entries(refs)
    .filter(([, value]) => value === commit)
    .map(([name]) => name);
}

function moveHead(repo, commit) {
  repo.state.branches[repo.state.head.branch] = commit;
  repo.state.head.commit = commit;
}

function headRef(repo) {
  return branchRef(repo.state.head.branch);
}

function branchRef(branch) {
  return `refs/heads/${branch}`;
}

function remoteRef(remote, branch) {
  return `${remote}/${branch}`;
}

function success(data = {}) {
  return { ok: true, data, error: null };
}

function gitFailure(code, message, data = {}) {
  return { ok: false, data, error: { code, message } };
}
