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

export function renderAbout(about) {
  if (!about) return '';
  return `<section class="game-about" aria-labelledby="game-about-heading">
    <div class="about-heading">
      <p class="section-label">About this game</p>
      <h3 id="game-about-heading">Learn the rules.<br />Then play with intent.</h3>
    </div>
    <div class="about-content">
      ${ABOUT_SECTIONS.map(([key, title]) => {
        const value = about[key];
        const content = Array.isArray(value)
          ? `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : `<p>${escapeHtml(value)}</p>`;
        return `<article class="about-section"><h4>${title}</h4>${content}</article>`;
      }).join('')}
    </div>
  </section>`;
}
