import { games } from './games/registry.js';

const grid = document.querySelector('#game-grid');
const filterButtons = document.querySelectorAll('.filter-button');
const intro = document.querySelector('.intro');
const gameLibrary = document.querySelector('.game-library');
let activeGame = null;

function prepareGame(game) {
  if (game.section) return;
  game.section = document.querySelector(game.sectionSelector);
  game.tabs = game.tabsSelector ? document.querySelectorAll(game.tabsSelector) : [];
}

function initializeGame(game) {
  prepareGame(game);
  if (!game.controller) {
    const view = document.querySelector(game.viewSelector);
    game.controller = game.initialize(view);
  }
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
    const count = filter === 'all' ? games.length : games.filter((game) => game.category === filter).length;
    const countElement = button.querySelector('[data-filter-count]');
    if (countElement) countElement.textContent = count;
  });
}

function renderGames(filter = 'all') {
  const visibleGames = filter === 'all' ? games : games.filter((game) => game.category === filter);
  grid.innerHTML = visibleGames.map((game) => `
    <article class="game-card${game.id ? ' playable' : ''}">
      <div class="game-art" aria-hidden="true"><span class="art-symbol">${game.symbol}</span></div>
      <div class="game-info">
        <p class="game-type">${game.type}</p>
        <h3 class="game-name">${game.title}</h3>
        <p class="game-description">${game.description}</p>
        ${game.id ? `<button class="game-link" type="button" data-open-game="${game.id}">Play now <span aria-hidden="true">→</span></button>` : '<span class="game-link">Coming soon <span aria-hidden="true">→</span></span>'}
      </div>
    </article>
  `).join('');
}

function openGame(id) {
  const game = games.find((entry) => entry.id === id);
  if (!game) return;
  if (activeGame && activeGame !== game) destroyGame(activeGame);
  games.filter((entry) => entry.initialize).forEach((entry) => {
    prepareGame(entry);
    entry.section.hidden = entry !== game;
  });
  const controller = initializeGame(game);
  activeGame = game;
  intro.hidden = true;
  gameLibrary.hidden = true;
  game.section.scrollIntoView({ behavior: 'smooth' });
  controller.render(game.initialMode);
}

function closeGame(game) {
  destroyGame(game);
  prepareGame(game);
  game.section.hidden = true;
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
  controller.render(button.dataset[game.modeAttribute]);
}

document.addEventListener('click', (event) => {
  const openButton = event.target.closest('[data-open-game]');
  if (openButton) return openGame(openButton.dataset.openGame);
  const game = games.find((entry) => entry.closeSelector && event.target.closest(entry.closeSelector));
  if (game) return closeGame(game);
  const tabGame = games.find((entry) => entry.tabsSelector && event.target.closest(entry.tabsSelector));
  if (tabGame) return selectTab(tabGame, event.target.closest(tabGame.tabsSelector));
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    renderGames(button.dataset.filter);
  });
});

renderFilterCounts();
renderGames();
