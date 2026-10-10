import { DEFAULTS } from './constants.js';

export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function diffTrees(from = {}, to = {}) {
  const files = new Set([...Object.keys(from), ...Object.keys(to)]);

  return [...files].sort().flatMap(file => {
    if (from[file] === to[file]) return [];

    return [{
      file,
      oldValue: from[file] ?? null,
      newValue: to[file] ?? null,
      status: from[file] === undefined
        ? 'added'
        : to[file] === undefined
          ? 'deleted'
          : 'modified'
    }];
  });
}

export function applyChanges(tree, changes = {}) {
  const next = clone(tree);

  for (const [file, value] of Object.entries(changes)) {
    if (value === null || value === undefined) {
      delete next[file];
    } else {
      next[file] = value;
    }
  }

  return next;
}

export function applyPatch(tree, patch = []) {
  const next = clone(tree);

  for (const change of patch) {
    if (change.newValue === null) {
      delete next[change.file];
    } else {
      next[change.file] = change.newValue;
    }
  }

  return next;
}

export function hasChanges(state) {
  const headTree = state.commits[state.head.commit]?.tree || {};
  return diffTrees(headTree, state.workingTree).length > 0 ||
    Object.keys(state.staging).length > 0;
}

export function normalizeRemotes(remotes = {}) {
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

export function isRefName(name) {
  const value = String(name || '');

  return /^[A-Za-z0-9._/-]+$/.test(value) &&
    !value.includes('..') &&
    !value.includes('//') &&
    !value.endsWith('/') &&
    !value.endsWith('.');
}

export function findMergeBase(commits, first, second) {
  const ancestors = new Set();
  const queue = [first];

  while (queue.length) {
    const id = queue.shift();

    if (!id || ancestors.has(id) || !commits[id]) continue;

    ancestors.add(id);
    queue.push(...commits[id].parents);
  }

  queue.push(second);

  while (queue.length) {
    const id = queue.shift();

    if (!id || !commits[id]) continue;
    if (ancestors.has(id)) return id;

    queue.push(...commits[id].parents);
  }

  return null;
}

export function isAncestor(commits, ancestor, descendant) {
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

export function firstParentPath(commits, base, head) {
  const result = [];
  let id = head;

  while (id && id !== base) {
    result.unshift(id);
    id = commits[id]?.parents[0];
  }

  return result;
}

export function reachable(commits, start) {
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

export function makeCommitId(seed, sequence, message, parents, tree) {
  const value = JSON.stringify({ seed, sequence, message, parents, tree });

  return (
    hash(value) +
    hash(value + 1) +
    hash(value + 2) +
    hash(value + 3)
  ).slice(0, 40);
}

function hash(value) {
  let result = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }

  return (result >>> 0).toString(16).padStart(8, '0');
}

export function createInitialFiles(input) {
  return clone(input.files || {
    [DEFAULTS.initialFile]: DEFAULTS.initialContent
  });
}
