import { escapeHtml } from './dom.js';
import { games, isPlayableGame, countGames, validateGame } from './games/registry.js';
import { renderAbout } from './games/about.js';

const grid = document.querySelector('#game-grid');
const filterButtons = document.querySelectorAll('.filter-button');
const intro = document.querySelector('.intro');
const gameLibrary = document.querySelector('.game-library');
let activeGame = null;

function prepareGame(game) {
  if (game.section) return;
  game.section = document.querySelector(`#${game.id}-game`);
  game.tabs = game.section ? game.section.querySelectorAll('[role="tab"]') : [];
  game.aboutContainer = game.section ? game.section.querySelector('[data-game-about]') : null;
}

function initializeGame(game) {
  prepareGame(game);
  if (!validateGame(game)) throw new Error(`Game "${game.id}" does not satisfy the game contract.`);
  if (!game.controller) game.controller = game.initialize(game.section);
  return game.controller;
}

function destroyGame(game) {
  if (!game?.controller) return;
  game.controller.destroy();
  game.controller = null;
}

function renderFilterCounts() {
  filterButtons.forEach((button) => {
    const filter = button.dataset.filter;
    const count = countGames(filter);
    const countElement = button.querySelector('[data-filter-count]');
    if (countElement) countElement.textContent = count;
  });
}

function renderGameCard(game) {
  const title = escapeHtml(game.title);
  const type = escapeHtml(game.type);
  const description = escapeHtml(game.description);
  const symbol = escapeHtml(game.symbol);
  const id = escapeHtml(game.id || '');
  const playable = isPlayableGame(game);
  return `
    <article class="game-card${playable ? ' playable' : ''}">
      <div class="game-art" aria-hidden="true"><span class="art-symbol">${symbol}</span></div>
      <div class="game-info">
        <p class="game-type">${type}</p>
        <h3 class="game-name">${title}</h3>
        <p class="game-description">${description}</p>
${playable ? `<button class="game-link" type="button" data-open-game="${id}">Play now <span aria-hidden="true">→</span></button>` : '<span class="game-link">Coming soon <span aria-hidden="true">→</span></span>'}
      </div>
    </article>`;
}

function renderGames(filter = 'all') {
  const visibleGames = filter === 'all' ? games : games.filter((game) => game.category === filter);
  grid.innerHTML = visibleGames.map(renderGameCard).join('');
}

function renderGameAbout(game) {
  if (game.aboutContainer) game.aboutContainer.innerHTML = renderAbout(game.about);
}

function openGame(id) {
  const game = games.find((entry) => entry.id === id);
  if (!game || !validateGame(game)) return;
  if (activeGame && activeGame !== game) destroyGame(activeGame);
  games.filter(isPlayableGame).forEach((entry) => {
    prepareGame(entry);
    entry.section.hidden = entry !== game;
  });
  const controller = initializeGame(game);
  activeGame = game;
  intro.hidden = true;
  gameLibrary.hidden = true;
  renderGameAbout(game);
  game.section.scrollIntoView({ behavior: 'smooth' });
  controller.render(game.initialMode);
}

function closeGame(game) {
  destroyGame(game);
  prepareGame(game);
  game.section.hidden = true;
  game.aboutContainer.innerHTML = '';
  activeGame = null;
  intro.hidden = false;
  gameLibrary.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectTab(game, button) {
  const controller = initializeGame(game);
  game.tabs.forEach((tab) => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
  });
  button.classList.add('active');
  button.setAttribute('aria-selected', 'true');
  controller.render(button.dataset.gameMode);
}

document.addEventListener('click', (event) => {
  const openButton = event.target.closest('[data-open-game]');
  if (openButton) return openGame(openButton.dataset.openGame);
  const game = games.find((entry) => entry.section?.contains(event.target) && event.target.closest('[data-close-game]'));
  if (game) return closeGame(game);
  const tabGame = games.find((entry) => entry.section?.contains(event.target) && event.target.closest('[role="tab"]'));
  if (tabGame) return selectTab(tabGame, event.target.closest('[role="tab"]'));
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    renderGames(button.dataset.filter);
  });
});

games.filter(isPlayableGame).forEach(prepareGame);
renderFilterCounts();
renderGames();
