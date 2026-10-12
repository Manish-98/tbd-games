import { escapeHtml } from '../../dom.js';
import { CONFLICT_MARKERS } from './constants.js';

export function renderConflictResolutionPanel(
  state,
  drafts = {},
  selectedFile = '',
  appliedDrafts = {},
  deleteChoices = {}
) {
  const conflicts = Array.isArray(state?.conflicts) ? state.conflicts : [];
  if (!conflicts.length) return '';

  const selected = conflicts.find(conflict => conflict.file === selectedFile) || conflicts[0];
  const file = selected.file;
  const draft = drafts[file] ?? selected.ours ?? '';
  const deleteFile = deleteChoices[file] === true;
  const applied = isDraftApplied(file, draft, deleteFile, appliedDrafts);
  const markerWarning = !deleteFile && containsConflictMarkers(draft);
  const status = markerWarning
    ? 'The final content still contains conflict markers.'
    : applied
      ? 'Resolution applied. Stage this file to clear its conflict.'
      : 'Edit the final content, then apply the resolution.';
  const fileOptions = conflicts.map(conflict => {
    const optionStatus = isDraftApplied(
      conflict.file,
      drafts[conflict.file] ?? conflict.ours ?? '',
      deleteChoices[conflict.file] === true,
      appliedDrafts
    ) ? ' — applied, not staged' : '';
    return '<option data-conflict-option="' + escapeHtml(conflict.file) + '" value="' + escapeHtml(conflict.file) + '"' +
      (conflict.file === file ? ' selected' : '') + '>' +
      escapeHtml(conflict.file + optionStatus) + '</option>';
  }).join('');

  return `<section class="git-conflict-panel" aria-labelledby="git-conflict-heading" data-conflict-panel>
    <div class="git-panel-heading">
      <div>
        <span class="section-label">Conflict resolution</span>
        <strong id="git-conflict-heading">${conflicts.length} file${conflicts.length === 1 ? '' : 's'} need attention</strong>
      </div>
      <span class="git-conflict-count" aria-label="${conflicts.length} unresolved files">${conflicts.length} unresolved</span>
    </div>
    <label class="git-conflict-file-picker">
      <span>Select conflicted file</span>
      <select data-conflict-file aria-label="Select conflicted file">${fileOptions}</select>
    </label>
    <div class="git-conflict-panes">
      <section class="git-conflict-pane" aria-labelledby="git-conflict-ours-label">
        <h4 id="git-conflict-ours-label">Left · Current (ours)</h4>
        <pre><code>${escapeHtml(formatConflictValue(selected.ours))}</code></pre>
      </section>
      <section class="git-conflict-pane" aria-labelledby="git-conflict-theirs-label">
        <h4 id="git-conflict-theirs-label">Right · Incoming (theirs)</h4>
        <pre><code>${escapeHtml(formatConflictValue(selected.theirs))}</code></pre>
      </section>
      <section class="git-conflict-pane git-conflict-final-pane" aria-labelledby="git-conflict-final-label">
        <h4 id="git-conflict-final-label">Final · Resolved content</h4>
        <label class="git-conflict-editor-label" for="git-conflict-final-content">Edit the file contents</label>
        <textarea id="git-conflict-final-content" data-conflict-draft spellcheck="false" aria-describedby="git-conflict-status" ${deleteFile ? 'disabled' : ''}>${escapeHtml(draft)}</textarea>
        <label class="git-conflict-delete">
          <input type="checkbox" data-conflict-delete ${deleteFile ? 'checked' : ''}>
          <span>Delete this file in the final result</span>
        </label>
      </section>
    </div>
    ${selected.base !== null && selected.base !== undefined
      ? '<details class="git-conflict-base"><summary>Show common base version</summary><pre><code>' +
        escapeHtml(formatConflictValue(selected.base)) + '</code></pre></details>'
      : ''}
    <div class="git-conflict-actions">
      <p class="git-conflict-status" id="git-conflict-status" role="status" aria-live="polite" data-conflict-status>${escapeHtml(status)}</p>
      <div>
        <button type="button" class="primary-button" data-conflict-action="apply">Apply resolution</button>
        <button type="button" class="primary-button" data-conflict-action="stage" ${applied && !markerWarning ? '' : 'disabled'}>Stage resolved file</button>
      </div>
    </div>
  </section>`;
}

export function containsConflictMarkers(content) {
  return typeof content === 'string' &&
    Object.values(CONFLICT_MARKERS).some(marker => content.includes(marker));
}

function isDraftApplied(file, draft, deleteFile, appliedDrafts) {
  const applied = appliedDrafts[file];
  return Boolean(applied) &&
    applied.content === draft &&
    applied.deleteFile === deleteFile &&
    (deleteFile || !containsConflictMarkers(draft));
}

function formatConflictValue(value) {
  return value === null || value === undefined
    ? '(file absent on this side)'
    : String(value);
}
