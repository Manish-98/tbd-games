import { escapeHtml } from '../../dom.js';

const WORKING_TREE = 'WORKING';
const INDEX = 'INDEX';
const HEAD = 'HEAD';
const MAX_DIFF_LINES = 180;

export function renderFileInspector(state, selection = {}) {
  const revisions = getRevisions(state);
  const files = getFiles(state);
  const file = files.includes(selection.file) ? selection.file : files[0] || '';
  const from = revisions.some(revision => revision.id === selection.from) ? selection.from : HEAD;
  const to = revisions.some(revision => revision.id === selection.to) ? selection.to : WORKING_TREE;
  const fromTree = getRevisionTree(state, from);
  const toTree = getRevisionTree(state, to);
  const fromContent = file && Object.prototype.hasOwnProperty.call(fromTree, file) ? fromTree[file] : null;
  const toContent = file && Object.prototype.hasOwnProperty.call(toTree, file) ? toTree[file] : null;
  const diff = buildLineDiff(fromContent, toContent);
  const hasDiff = diff.some(line => line.type !== 'context');

  return `<section class="git-file-inspector" aria-label="Repository file and diff viewer">
    <div class="git-panel-heading">
      <div><span class="section-label">Repository inspection</span><h3>Files / diff</h3></div>
      <span class="git-inspector-readonly">Read only</span>
    </div>
    <div class="git-inspector-controls">
      <label><span>File</span><select data-inspector-selection="file" aria-label="File to inspect">${optionList(files.map(value => ({ id: value, label: value })), file, 'No repository files')}</select></label>
      <label><span>Compare from</span><select data-inspector-selection="from" aria-label="First revision">${optionList(revisions, from)}</select></label>
      <label><span>Compare to</span><select data-inspector-selection="to" aria-label="Second revision">${optionList(revisions, to)}</select></label>
    </div>
    <div class="git-inspector-content">
      <section class="git-inspector-file" aria-labelledby="git-inspector-file-heading">
        <div class="git-inspector-subheading"><h4 id="git-inspector-file-heading">${escapeHtml(file || 'No file selected')}</h4><span>${escapeHtml(getRevisionLabel(revisions, to))}</span></div>
        ${renderFileContent(toContent)}
      </section>
      <section class="git-inspector-diff" aria-label="File differences">
        <div class="git-inspector-subheading"><h4>Diff</h4><span>${escapeHtml(getRevisionLabel(revisions, from))} → ${escapeHtml(getRevisionLabel(revisions, to))}</span></div>
        ${!file ? '<p class="git-inspector-empty">No files are available in this repository state.</p>' :
          !hasDiff ? '<p class="git-inspector-empty">No differences between these revisions for this file.</p>' :
          renderDiff(diff)}
      </section>
    </div>
  </section>`;
}

export function getInspectorDefaults(state) {
  return { file: getFiles(state)[0] || '', from: HEAD, to: WORKING_TREE };
}

function getRevisions(state) {
  const commits = Object.values(state.commits).slice().sort((left, right) =>
    String(right.date || '').localeCompare(String(left.date || '')) || left.id.localeCompare(right.id)
  );
  return [
    { id: WORKING_TREE, label: 'Working tree' },
    { id: INDEX, label: 'Index (staging)' },
    { id: HEAD, label: 'HEAD' },
    ...commits.map(commit => ({ id: 'commit:' + commit.id, label: 'Commit ' + commit.id.slice(0, 7) + ' · ' + commit.message }))
  ];
}

function getFiles(state) {
  const files = new Set();
  [state.workingTree, getRevisionTree(state, INDEX), getRevisionTree(state, HEAD),
    ...Object.values(state.commits).map(commit => commit.tree)].forEach(tree =>
    Object.keys(tree || {}).forEach(file => files.add(file))
  );
  return [...files].sort((left, right) => left.localeCompare(right));
}

function getRevisionTree(state, revision) {
  if (revision === WORKING_TREE) return state.workingTree || {};
  const headTree = state.commits[state.head?.commit]?.tree || {};
  if (revision === HEAD) return headTree;
  if (revision === INDEX) {
    const indexTree = { ...headTree };
    Object.entries(state.staging || {}).forEach(([file, content]) => {
      if (content === null) delete indexTree[file];
      else indexTree[file] = content;
    });
    return indexTree;
  }
  if (revision.startsWith('commit:')) return state.commits[revision.slice('commit:'.length)]?.tree || {};
  return {};
}

function optionList(options, selected, emptyLabel = 'Choose a file') {
  if (!options.length) return '<option value="">'+ escapeHtml(emptyLabel) +'</option>';
  return options.map(option =>
    '<option value="' + escapeHtml(option.id) + '"' + (option.id === selected ? ' selected' : '') + '>' +
    escapeHtml(option.label) + '</option>'
  ).join('');
}

function getRevisionLabel(revisions, id) {
  return revisions.find(revision => revision.id === id)?.label || 'Unknown revision';
}

function renderFileContent(content) {
  if (content === null) return '<p class="git-inspector-empty">This file is not present at the selected revision.</p>';
  return '<ol class="git-inspector-lines">' + String(content).split('\n').map((line, index) =>
    '<li><span aria-hidden="true">' + (index + 1) + '</span><code>' + escapeHtml(line || ' ') + '</code></li>'
  ).join('') + '</ol>';
}

function renderDiff(lines) {
  return '<ol class="git-inspector-lines git-inspector-diff-lines">' + lines.map(line => {
    const marker = line.type === 'added' ? '+' : line.type === 'deleted' ? '−' : ' ';
    return '<li class="is-' + line.type + '"><span aria-label="' + markerLabel(line.type) + '">' + marker +
      '</span><code>' + escapeHtml(line.text || ' ') + '</code></li>';
  }).join('') + '</ol>';
}

function markerLabel(type) {
  if (type === 'added') return 'Added line';
  if (type === 'deleted') return 'Deleted line';
  return 'Unchanged line';
}

function buildLineDiff(fromContent, toContent) {
  const before = fromContent === null ? [] : String(fromContent).split('\n');
  const after = toContent === null ? [] : String(toContent).split('\n');
  if (before.length * after.length > MAX_DIFF_LINES * MAX_DIFF_LINES) {
    return [...before.map(text => ({ type: 'deleted', text })), ...after.map(text => ({ type: 'added', text }))];
  }
  const lengths = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = before[i] === after[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push({ type: 'context', text: before[i] });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      lines.push({ type: 'deleted', text: before[i++] });
    } else {
      lines.push({ type: 'added', text: after[j++] });
    }
  }
  while (i < before.length) lines.push({ type: 'deleted', text: before[i++] });
  while (j < after.length) lines.push({ type: 'added', text: after[j++] });
  return lines;
}
