import { escapeHtml } from '../dom.js';

const ABOUT_SECTIONS = [
  ['objective', 'Objective'],
  ['concept', 'Concept'],
  ['howToPlay', 'How to play'],
  ['rules', 'Rules'],
  ['components', 'Components'],
  ['controls', 'Controls'],
  ['scoring', 'Scoring']
];

function renderVisualSteps(visual) {
  if (!visual?.steps?.length) return '';
  return `
    <section class="about-visual" aria-label="${escapeHtml(visual.title || 'How it works')}">
      <p class="section-label">${escapeHtml(visual.title || 'How it works')}</p>
      <div class="about-flow">
        ${visual.steps.map((step, index) => `
          <div class="about-flow-step">
            <span class="about-flow-number">${index + 1}</span>
            <strong>${escapeHtml(step)}</strong>
          </div>
          ${index < visual.steps.length - 1 ? '<span class="about-flow-arrow" aria-hidden="true">→</span>' : ''}
        `).join('')}
      </div>
    </section>`;
}

export function renderAbout(about, gameId = 'game') {
  if (!about) return '';
  const headingId = `game-about-heading-${escapeHtml(gameId)}`;
  return `<section class="game-about" aria-labelledby="${headingId}">
    <div class="about-heading">
      <p class="section-label">About this game</p>
      <h3 id="${headingId}">Learn the rules.<br />Then play with intent.</h3>
    </div>
    <div class="about-body">
      ${renderVisualSteps(about.visual)}
      <div class="about-content">
        ${ABOUT_SECTIONS.map(([key, title]) => {
          const value = about[key];
          const content = Array.isArray(value)
            ? `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
            : `<p>${escapeHtml(value)}</p>`;
          return `<article class="about-section"><h4>${title}</h4>${content}</article>`;
        }).join('')}
      </div>
    </div>
  </section>`;
}
