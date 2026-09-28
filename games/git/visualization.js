import { escapeHtml } from '../../dom.js';
import { createLifecycle } from '../../shared/lifecycle.js';

const INITIAL_TRANSITION = Object.freeze({ type: 'initial', command: null });
const REQUIRED_STATE = Object.freeze([
  'commits',
  'branches',
  'head',
  'workingTree',
  'staging',
  'remoteTracking',
  'tags'
]);

export function createGitVisualization(container, options = {}) {
  if (!container || typeof container !== 'object') {
    throw new TypeError('A visualization container is required.');
  }

  const lifecycle = createLifecycle();
  const onInspect = typeof options.onInspect === 'function' ? options.onInspect : null;
  let previousState = null;
  let currentState = null;

  lifecycle.on(container, 'click', event => {
    const target = event.target.closest('[data-inspect-kind][data-inspect-id]');
    if (!target || !container.contains(target)) return;

    const kind = target.dataset.inspectKind;
    const id = target.dataset.inspectId;
    const item = getInspectableItem(currentState, kind, id);
    const panel = container.querySelector('[data-inspection-panel]');

    container.querySelectorAll('[data-inspect-kind]').forEach(element => {
      element.classList.toggle('git-visualization-selected', element === target);
    });

    if (panel) {
      panel.innerHTML = item ? renderInspection(kind, item) : '';
      panel.hidden = !item;
    }

    if (item && onInspect) onInspect({ kind, item });
  });

  function render(state, transition = INITIAL_TRANSITION) {
    validateState(state);
    currentState = state;
    container.innerHTML = renderGitVisualization(state, previousState, transition);
    previousState = state;
    return container;
  }

  function reset(state) {
    previousState = null;
    return render(state, { type: 'reset', command: null });
  }

  function destroy() {
    lifecycle.dispose();
    container.innerHTML = '';
    previousState = null;
    currentState = null;
  }

  return Object.freeze({ render, update: render, reset, destroy });
}

export function renderGitVisualization(state, previousState = null, transition = INITIAL_TRANSITION) {
  validateState(state);
  const graph = buildGraph(state);
  const changed = getChangedItems(state, previousState);

  return [
    '<section class="git-visualization" aria-label="Git repository visualization">',
    '<div class="git-visualization-header"><div><p class="section-label">Repository map</p><h3>History / refs / working tree</h3></div>',
    '<div class="git-visualization-transition" role="status">',
    escapeHtml(formatTransition(transition, changed)),
    '</div></div>',
    '<div class="git-visualization-summary">', renderSummary(state), '</div>',
    '<div class="git-graph-shell"><div class="git-graph-scroll" tabindex="0" aria-label="Scrollable Git commit graph">',
    renderGraph(state, graph, changed),
    '</div></div>',
    '<div class="git-visualization-lower"><aside class="git-ref-panel">',
    renderRefs(state, changed),
    '</aside><aside class="git-state-panel">',
    renderWorkingState(state),
    '<div class="git-inspection-panel" data-inspection-panel hidden></div>',
    '</aside></div></section>'
  ].join('');
}

function renderSummary(state) {
  return [
    ['Commits', Object.keys(state.commits).length],
    ['Branches', Object.keys(state.branches).length],
    ['Remote refs', Object.keys(state.remoteTracking).length],
    ['HEAD', state.head.type === 'detached' ? 'detached' : state.head.branch]
  ].map(([label, value]) =>
    '<div class="git-summary-item"><span>' + escapeHtml(String(label)) +
    '</span><strong>' + escapeHtml(String(value)) + '</strong></div>'
  ).join('');
}

function renderGraph(state, graph, changed) {
  const refsByCommit = collectRefs(state);
  const edges = Object.values(state.commits).flatMap(commit =>
    commit.parents.flatMap(parentId => {
      const source = graph.positions.get(parentId);
      const target = graph.positions.get(commit.id);
      return source && target ? [renderEdge(source, target)] : [];
    })
  );

  const commits = graph.commits.map(commit =>
    renderCommit(commit, graph.positions.get(commit.id), refsByCommit.get(commit.id) || [], changed)
  ).join('');

  const refs = [...refsByCommit.entries()].flatMap(([commitId, refsForCommit]) =>
    refsForCommit.map(ref => renderRefBadge(ref, graph.positions.get(commitId), changed))
  ).join('');

  return '<svg class="git-graph" viewBox="0 0 ' + graph.width + ' ' + graph.height +
    '" role="img" aria-label="Commit graph"><g class="git-graph-edges">' +
    edges.join('') + '</g><g class="git-graph-refs">' + refs +
    '</g><g class="git-graph-commits">' + commits + '</g></svg>';
}

function renderEdge(source, target) {
  const middle = source.y + (target.y - source.y) / 2;
  return '<path class="git-graph-edge" d="M ' + source.x + ' ' + source.y +
    ' C ' + source.x + ' ' + middle + ', ' + target.x + ' ' + middle +
    ', ' + target.x + ' ' + target.y + '" />';
}

function renderCommit(commit, position, refs, changed) {
  const className = changed.commits.has(commit.id) ? ' git-visualization-changed' : '';
  const files = Object.keys(commit.changes || {}).length;

  return '<g class="git-graph-commit' + className +
    '" data-inspect-kind="commit" data-inspect-id="' + escapeHtml(commit.id) +
    '" tabindex="0" role="button" aria-label="Inspect commit ' + escapeHtml(commit.id) + '">' +
    '<circle cx="' + position.x + '" cy="' + position.y + '" r="13" />' +
    '<text x="' + (position.x + 24) + '" y="' + (position.y - 4) + '" class="git-commit-id">' +
    escapeHtml(commit.id.slice(0, 7)) + '</text>' +
    '<text x="' + (position.x + 24) + '" y="' + (position.y + 15) + '" class="git-commit-message">' +
    escapeHtml(commit.message) + '</text>' +
    '<text x="' + (position.x + 24) + '" y="' + (position.y + 32) + '" class="git-commit-meta">' +
    files + ' changed files · ' + refs.length + ' refs</text></g>';
}

function renderRefBadge(ref, position, changed) {
  const className = changed.refs.has(ref.id) ? ' git-visualization-changed' : '';
  const width = Math.max(72, ref.label.length * 7 + 20);

  return '<g class="git-graph-ref' + className +
    '" data-inspect-kind="' + escapeHtml(ref.kind) + '" data-inspect-id="' +
    escapeHtml(ref.id) + '" tabindex="0" role="button" aria-label="Inspect ' +
    escapeHtml(ref.label) + '"><rect x="' + (position.x - 7) + '" y="' +
    (position.y - 39) + '" width="' + width + '" height="22" rx="11" />' +
    '<text x="' + (position.x + 2) + '" y="' + (position.y - 24) + '">' +
    escapeHtml(ref.label) + '</text></g>';
}

function renderRefs(state, changed) {
  const rows = Object.entries(state.branches).map(([name, commit]) =>
    renderRefRow('branch', name, commit, changed.refs.has('branch:' + name))
  ).join('') +
    Object.entries(state.remoteTracking).map(([name, commit]) =>
      renderRefRow('remote', name, commit, changed.refs.has('remote:' + name))
    ).join('') +
    Object.entries(state.tags).map(([name, commit]) =>
      renderRefRow('tag', name, commit, changed.refs.has('tag:' + name))
    ).join('');

  return '<div class="git-panel-heading"><span class="section-label">References</span><strong>' +
    (Object.keys(state.branches).length + Object.keys(state.remoteTracking).length + Object.keys(state.tags).length) +
    '</strong></div><div class="git-ref-list">' +
    (rows || '<p class="git-empty">No references.</p>') +
    '</div><button class="git-head-row' + (changed.head ? ' git-visualization-changed' : '') +
    '" type="button" data-inspect-kind="head" data-inspect-id="HEAD">' +
    '<span class="git-ref-kind head">HEAD</span><strong>' +
    (state.head.type === 'detached' ? 'detached' : escapeHtml(state.head.branch)) +
    '</strong><code>' + escapeHtml(shortId(state.head.commit)) + '</code></button>';
}

function renderRefRow(kind, name, commit, changed) {
  return '<button class="git-ref-row' + (changed ? ' git-visualization-changed' : '') +
    '" type="button" data-inspect-kind="' + kind + '" data-inspect-id="' +
    escapeHtml(name) + '"><span class="git-ref-kind ' + kind + '">' + kind +
    '</span><strong>' + escapeHtml(name) + '</strong><code>' +
    escapeHtml(shortId(commit)) + '</code></button>';
}

function renderWorkingState(state) {
  const working = Object.keys(state.workingTree || {});
  const staged = Object.keys(state.staging || {});
  const conflicts = state.conflicts || [];

  return '<div class="git-panel-heading"><span class="section-label">Working tree</span><strong>' +
    (working.length + staged.length) + '</strong></div><div class="git-change-groups">' +
    '<div><span>Working tree</span><strong>' + working.length + ' files</strong></div>' +
    '<div><span>Staged</span><strong>' + staged.length + ' files</strong></div>' +
    '<div><span>Conflicts</span><strong>' + conflicts.length + '</strong></div></div>' +
    '<div class="git-file-list">' + renderFileList('Working', working) +
    renderFileList('Staged', staged) +
    conflicts.map(file => '<span class="git-conflict-file">' + escapeHtml(String(file)) + '</span>').join('') +
    '</div>';
}

function renderFileList(label, files) {
  return files.length
    ? '<div class="git-file-group"><span>' + escapeHtml(label) + '</span>' +
      files.map(file => '<code>' + escapeHtml(file) + '</code>').join('') + '</div>'
    : '';
}

function renderInspection(kind, item) {
  if (kind === 'commit') {
    return '<div class="git-inspection-heading"><span class="section-label">Commit</span></div><dl>' +
      '<dt>ID</dt><dd><code>' + escapeHtml(item.id) + '</code></dd>' +
      '<dt>Message</dt><dd>' + escapeHtml(item.message) + '</dd>' +
      '<dt>Parents</dt><dd>' + escapeHtml(item.parents.join(', ') || 'None') + '</dd>' +
      '<dt>Author</dt><dd>' + escapeHtml(formatAuthor(item.author)) + '</dd>' +
      '<dt>Date</dt><dd>' + escapeHtml(item.date || 'Unknown') + '</dd>' +
      '<dt>Changed files</dt><dd>' + escapeHtml(Object.keys(item.changes || {}).join(', ') || 'None') +
      '</dd></dl>';
  }

  if (kind === 'branch') {
    return '<div class="git-inspection-heading"><span class="section-label">Branch</span></div><dl>' +
      '<dt>Name</dt><dd>' + escapeHtml(item.name) + '</dd><dt>Target</dt><dd><code>' +
      escapeHtml(item.commit) + '</code></dd><dt>Tracking</dt><dd>' +
      escapeHtml(item.tracking || 'No tracking branch') + '</dd></dl>';
  }

  if (kind === 'remote' || kind === 'tag') {
    return '<div class="git-inspection-heading"><span class="section-label">' +
      (kind === 'remote' ? 'Remote-tracking ref' : 'Tag') + '</span></div><dl>' +
      '<dt>Name</dt><dd>' + escapeHtml(item.name) + '</dd><dt>Target</dt><dd><code>' +
      escapeHtml(item.commit) + '</code></dd></dl>';
  }

  return '<div class="git-inspection-heading"><span class="section-label">HEAD</span></div><dl>' +
    '<dt>State</dt><dd>' + (item.type === 'detached' ? 'Detached HEAD' : 'On branch ' + escapeHtml(item.branch)) +
    '</dd><dt>Commit</dt><dd><code>' + escapeHtml(item.commit) + '</code></dd></dl>';
}

function buildGraph(state) {
  const commits = Object.values(state.commits);
  const positions = new Map();
  const lanes = new Map();
  const sorted = [...commits].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  sorted.forEach((commit, index) => {
    const lane = commit.parents.length && lanes.has(commit.parents[0])
      ? lanes.get(commit.parents[0])
      : index % 3;
    lanes.set(commit.id, lane);
    positions.set(commit.id, { x: 72 + lane * 118, y: 62 + index * 92 });
  });

  const maxX = Math.max(72, ...[...positions.values()].map(position => position.x));
  return {
    commits: sorted,
    positions,
    width: Math.max(720, maxX + 520),
    height: Math.max(250, sorted.length * 92 + 70)
  };
}

function collectRefs(state) {
  const refs = new Map();
  const add = (commit, ref) => {
    if (!commit || !state.commits[commit]) return;
    refs.set(commit, (refs.get(commit) || []).concat(ref));
  };

  Object.entries(state.branches).forEach(([name, commit]) =>
    add(commit, { id: 'branch:' + name, kind: 'branch', label: name })
  );
  Object.entries(state.remoteTracking).forEach(([name, commit]) =>
    add(commit, { id: 'remote:' + name, kind: 'remote', label: name })
  );
  Object.entries(state.tags).forEach(([name, commit]) =>
    add(commit, { id: 'tag:' + name, kind: 'tag', label: name })
  );
  add(state.head.commit, {
    id: 'head:HEAD',
    kind: 'head',
    label: state.head.type === 'detached' ? 'HEAD (detached)' : 'HEAD'
  });

  return refs;
}

function getChangedItems(state, previousState) {
  const changed = { commits: new Set(), refs: new Set(), head: false };
  if (!previousState) return changed;

  Object.keys(state.commits).forEach(id => {
    if (!previousState.commits[id]) changed.commits.add(id);
  });
  compareRefs(state.branches, previousState.branches, 'branch', changed.refs);
  compareRefs(state.remoteTracking, previousState.remoteTracking, 'remote', changed.refs);
  compareRefs(state.tags, previousState.tags, 'tag', changed.refs);

  changed.head = previousState.head.type !== state.head.type ||
    previousState.head.branch !== state.head.branch ||
    previousState.head.commit !== state.head.commit;

  return changed;
}

function compareRefs(current, previous, prefix, changed) {
  Object.entries(current).forEach(([name, commit]) => {
    if (previous[name] !== commit) changed.add(prefix + ':' + name);
  });
}

function getInspectableItem(state, kind, id) {
  if (!state) return null;
  if (kind === 'commit') return state.commits[id] || null;
  if (kind === 'branch') {
    const commit = state.branches[id];
    return commit ? { name: id, commit, tracking: null } : null;
  }
  if (kind === 'remote') {
    return state.remoteTracking[id] ? { name: id, commit: state.remoteTracking[id] } : null;
  }
  if (kind === 'tag') {
    return state.tags[id] ? { name: id, commit: state.tags[id] } : null;
  }
  if (kind === 'head') return state.head;
  return null;
}

function formatTransition(transition, changed) {
  if (transition && transition.type === 'reset') return 'Repository reset';
  if (transition && transition.command) {
    return transition.command.type + ' · ' + countChanged(changed) + ' visual changes';
  }
  return 'Initial repository state';
}

function countChanged(changed) {
  return changed.commits.size + changed.refs.size + Number(changed.head);
}

function formatAuthor(author) {
  if (!author) return 'Unknown';
  if (typeof author === 'string') return author;
  return [author.name, author.email].filter(Boolean).join(' · ') || 'Unknown';
}

function shortId(id) {
  return id ? String(id).slice(0, 7) : '—';
}

function validateState(state) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('A repository state is required.');
  }
  REQUIRED_STATE.forEach(field => {
    if (state[field] === undefined) {
      throw new TypeError('Repository state requires ' + field + '.');
    }
  });
}
