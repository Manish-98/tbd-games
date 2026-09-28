import { escapeHtml } from '../../dom.js';

export function renderInspectionOutput(command, data) {
  const title = command?.type ? command.type : 'inspection';
  const formatted = formatInspectionData(command?.type, data);

  return `<section class="git-inspection-output" aria-live="polite" aria-label="Git command output">
    <div class="git-panel-heading">
      <span class="section-label">Command output</span>
      <strong>${escapeHtml(title)}</strong>
    </div>
    <pre><code>${escapeHtml(formatted)}</code></pre>
  </section>`;
}

function formatInspectionData(type, data) {
  if (type === 'reflog' && Array.isArray(data)) {
    return data.map(entry => {
      const oldValue = entry.oldValue || 'null';
      const newValue = entry.newValue || 'null';
      return [
        `${entry.id ?? ''} ${entry.ref || ''}`.trim(),
        `  ${oldValue} -> ${newValue}`,
        `  ${entry.reason || 'reference moved'}`
      ].join('\n');
    }).join('\n');
  }

  return JSON.stringify(data, null, 2);
}
