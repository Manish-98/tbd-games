import { escapeHtml } from './dom.js';
import { games, isPlayableGame, countGames, validateGame } from './games/registry.js';
import { renderAbout } from './games/about.js';

const grid = document.querySelector('#game-grid');
const filterButtons = document.querySelectorAll('.filter-button');
const intro = document.querySelector('.intro');
const gameLibrary = document.querySelector('.game-library');
const brand = document.querySelector('.brand');
const GAME_ROUTE_PREFIX = '#game/';
let activeGame = null;

function prepareGame(game) {
  if (game.section) return;
  game.section = document.querySelector(`#${game.id}-game`);
  game.tabList = game.section?.querySelector('[role="tablist"]');
  game.aboutView = game.section?.querySelector('[data-game-about]');
  game.gameView = game.section?.querySelector('[data-game-view]');
  if (game.tabList && !game.tabList.querySelector('[data-game-mode="about"]')) {
    const aboutTab = document.createElement('button');
    aboutTab.className = 'game-about-tab';
    aboutTab.type = 'button';
    aboutTab.role = 'tab';
    aboutTab.setAttribute('aria-selected', 'false');
    aboutTab.dataset.gameMode = 'about';
    aboutTab.textContent = 'About';
    game.tabList.prepend(aboutTab);
  }
  game.tabs = game.section ? game.section.querySelectorAll('[role="tab"]') : [];
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

function setTabState(game, activeButton) {
  game.tabs.forEach((tab) => {
    const isActive = tab === activeButton;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
}

function renderAboutMode(game) {
  if (!game.aboutView) return;
  if (game.controller) destroyGame(game);
  game.aboutView.innerHTML = renderAbout(game.about, game.id);
  game.aboutView.hidden = false;
  if (game.gameView) game.gameView.hidden = true;
}

function renderGameMode(game, button) {
  const controller = initializeGame(game);
  if (game.aboutView) {
    game.aboutView.hidden = true;
    game.aboutView.innerHTML = '';
  }
  if (game.gameView) game.gameView.hidden = false;
  controller.render(button.dataset.gameMode);
}

function openGame(id, { scroll = true } = {}) {
  const game = games.find((entry) => entry.id === id);
  if (!game) return false;

  if (activeGame && activeGame !== game) destroyGame(activeGame);
  games.filter(isPlayableGame).forEach((entry) => {
    prepareGame(entry);
    entry.section.hidden = entry !== game;
  });

  activeGame = game;
  intro.hidden = true;
  gameLibrary.hidden = true;
  const initialTab = Array.from(game.tabs).find((tab) => tab.dataset.gameMode === game.initialMode);
  selectTab(game, initialTab || game.tabs[0]);
  if (scroll) game.section.scrollIntoView({ behavior: 'smooth' });
  return true;
}

function closeGame(game) {
  destroyGame(game);
  prepareGame(game);
  game.section.hidden = true;
  game.aboutView.innerHTML = '';
  game.aboutView.hidden = true;
  game.gameView.hidden = false;
  activeGame = null;
  intro.hidden = false;
  gameLibrary.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectTab(game, button) {
  if (!button) return;
  prepareGame(game);
  setTabState(game, button);
  if (button.dataset.gameMode === 'about') {
    renderAboutMode(game);
    return;
  }
  renderGameMode(game, button);
}

function getGameRoute(id) {
  return `${GAME_ROUTE_PREFIX}${encodeURIComponent(id)}`;
}

function getGameIdFromRoute() {
  if (!window.location.hash.startsWith(GAME_ROUTE_PREFIX)) return null;
  const encodedId = window.location.hash.slice(GAME_ROUTE_PREFIX.length);
  if (!encodedId) return null;

  try {
    return decodeURIComponent(encodedId);
  } catch {
    return null;
  }
}

function syncRoute() {
  const gameId = getGameIdFromRoute();
  if (!gameId) {
    if (window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    if (activeGame) closeGame(activeGame);
    return;
  }

  if (!openGame(gameId)) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (activeGame) closeGame(activeGame);
  }
}

function navigateHome() {
  const homePath = new URL('.', window.location.href).pathname;
  window.history.pushState(null, '', homePath);
  syncRoute();
}

function navigateToGame(id) {
  const game = games.find((entry) => entry.id === id && isPlayableGame(entry));
  if (!game) return;

  const route = getGameRoute(game.id);
  if (window.location.hash === route) {
    openGame(game.id);
    return;
  }
  window.location.hash = route;
}

document.addEventListener('click', (event) => {
  if (brand?.contains(event.target)) {
    event.preventDefault();
    return navigateHome();
  }
  const openButton = event.target.closest('[data-open-game]');
  if (openButton) return navigateToGame(openButton.dataset.openGame);
  const game = games.find((entry) => entry.section?.contains(event.target) && event.target.closest('[data-close-game]'));
  if (game) {
    window.location.hash = '';
    return;
  }
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
window.addEventListener('hashchange', syncRoute);
syncRoute();
