import { escapeHtml } from '../../dom.js';

export function renderInspectionOutput(command, data) {
  const title = command?.type ? command.type : 'inspection';
  const body = command?.type === 'reflog' && Array.isArray(data)
    ? renderReflog(data)
    : renderStructuredData(data);

  return `<section class="git-inspection-output" aria-live="polite" aria-label="Git command output">
    <div class="git-panel-heading">
      <span class="section-label">Command output</span>
      <strong>${escapeHtml(title)}</strong>
    </div>
    ${body}
  </section>`;
}

function renderReflog(entries) {
  if (!entries.length) return '<p class="git-output-empty">No reference movements.</p>';
  return '<ol class="git-output-list git-output-reflog">' + entries.map(entry =>
    '<li class="git-output-card"><strong>' + escapeHtml(entry.ref || 'Reference') +
    '</strong><span class="git-output-muted">' + escapeHtml(entry.reason || 'Reference moved') +
    '</span><div class="git-output-change"><code>' + escapeHtml(entry.oldValue || 'null') +
    '</code><span aria-hidden="true">→</span><code>' + escapeHtml(entry.newValue || 'null') +
    '</code></div></li>'
  ).join('') + '</ol>';
}

function renderStructuredData(data) {
  if (data === null || data === undefined) {
    return '<p class="git-output-empty">No data returned.</p>';
  }
  if (Array.isArray(data)) {
    if (!data.length) return '<p class="git-output-empty">Nothing to show.</p>';
    return '<div class="git-output-array">' + data.map((item, index) =>
      '<article class="git-output-card"><span class="git-output-index">' +
      String(index + 1).padStart(2, '0') + '</span>' + renderValue(item) + '</article>'
    ).join('') + '</div>';
  }
  if (typeof data !== 'object') {
    return '<div class="git-output-value">' + escapeHtml(String(data)) + '</div>';
  }

  const entries = Object.entries(data);
  return '<dl class="git-output-fields">' + entries.map(([key, value]) =>
    '<div class="git-output-field"><dt>' + escapeHtml(formatKey(key)) +
    '</dt><dd>' + renderValue(value, key) + '</dd></div>'
  ).join('') + '</dl>';
}

function renderValue(value, key = '') {
  if (value === null || value === undefined) {
    return '<span class="git-output-muted">—</span>';
  }
  if (typeof value === 'boolean') {
    return '<span class="git-output-pill ' + (value ? 'is-true' : 'is-false') + '">' +
      (value ? 'Yes' : 'No') + '</span>';
  }
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="git-output-muted">None</span>';
    return '<ul class="git-output-inline-list">' + value.map(item =>
      '<li>' + renderValue(item) + '</li>'
    ).join('') + '</ul>';
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return '<dl class="git-output-nested">' + entries.map(([nestedKey, nestedValue]) =>
      '<div><dt>' + escapeHtml(formatKey(nestedKey)) + '</dt><dd>' +
      renderValue(nestedValue, nestedKey) + '</dd></div>'
    ).join('') + '</dl>';
  }

  const text = String(value);
  const isIdentifier = /commit|hash|id|value|head/i.test(key) ||
    /^[a-f0-9]{7,40}$/i.test(text);
  return isIdentifier
    ? '<code class="git-output-code">' + escapeHtml(text) + '</code>'
    : '<span>' + escapeHtml(text) + '</span>';
}

function formatKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, character => character.toUpperCase());
}
