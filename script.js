import { initTypingGame } from './games/typing/game.js';
import { initLogicGame } from './games/logic/game.js';
import { initTurtleGame } from './games/turtle/game.js';
import { initCellularGame } from './games/cellular/game.js';

const games = [
  { id: 'typing', title: 'Key / pace / repeat', type: 'Arcade', category: 'arcade', description: 'Type cleanly. Find your rhythm.', symbol: '⌁', initialize: initTypingGame, sectionSelector: '#typing-game', viewSelector: '#typing-view', closeSelector: '#close-game', tabsSelector: '.mode-tab', modeAttribute: 'mode', initialMode: 'type' },
  { id: 'logic', title: 'Signal / switch / solve', type: 'Puzzle', category: 'puzzle', description: 'Build a circuit. Chase the light.', symbol: '⊙', initialize: initLogicGame, sectionSelector: '#logic-game', viewSelector: '#logic-view', closeSelector: '#close-logic-game', tabsSelector: '.logic-tab', modeAttribute: 'logicMode', initialMode: 'lab' },
  { id: 'turtle', title: 'Turtle run', type: 'Creative', category: 'arcade', description: 'Program a little drawing robot.', symbol: '🐢', initialize: initTurtleGame, sectionSelector: '#turtle-game', viewSelector: '#turtle-view', closeSelector: '#close-turtle-game', tabsSelector: '.turtle-tab', modeAttribute: 'turtleMode', initialMode: 'draw' },
  { id: 'cellular', title: 'Cell / bloom / rerun', type: 'Creative', category: 'arcade', description: 'Shape a tiny world and watch it evolve.', symbol: '◈', initialize: initCellularGame, sectionSelector: '#cellular-game', viewSelector: '#cellular-view', closeSelector: '#close-cellular-game', initialMode: 'play' },
  { title: 'Tiny Towers', type: 'Strategy', category: 'strategy', description: 'Build carefully. Balance everything.', symbol: '△' },
  { title: 'Word Bloom', type: 'Puzzle', category: 'puzzle', description: 'A daily garden of letters.', symbol: '✳' },
  { title: 'Orbit', type: 'Arcade', category: 'arcade', description: 'Time your turn around the sun.', symbol: '◌' },
  { title: 'Memory Lane', type: 'Puzzle', category: 'puzzle', description: 'A few cards. A lot of recall.', symbol: '▦' },
  { title: 'Signal Lost', type: 'Strategy', category: 'strategy', description: 'Connect the dots before dark.', symbol: '⌁' },
  { title: 'Pocket Racer', type: 'Arcade', category: 'arcade', description: 'Small track. Serious speed.', symbol: '››' },
  { title: 'Unfold', type: 'Puzzle', category: 'puzzle', description: 'Make the impossible shape fit.', symbol: '◇' }
];

const grid = document.querySelector('#game-grid');
const filterButtons = document.querySelectorAll('.filter-button');
const intro = document.querySelector('.intro');
const gameLibrary = document.querySelector('.game-library');
let activeGame;

games.filter((game) => game.initialize).forEach((game) => {
  game.section = document.querySelector(game.sectionSelector);
  game.tabs = document.querySelectorAll(game.tabsSelector);
  game.controller = game.initialize(document.querySelector(game.viewSelector));
});

function renderGames(filter = 'all') {
  const visibleGames = filter === 'all' ? games : games.filter((game) => game.category === filter);
  grid.innerHTML = visibleGames.map((game) => `
    <article class="game-card${game.id ? ' playable' : ''}">
      <div class="game-art" aria-hidden="true"><span class="art-symbol">${game.symbol}</span></div>
      <div class="game-info"><p class="game-type">${game.type}</p><h3 class="game-name">${game.title}</h3><p class="game-description">${game.description}</p>
        ${game.id ? `<button class="game-link" type="button" data-open-game="${game.id}">Play now <span aria-hidden="true">→</span></button>` : '<span class="game-link">Coming soon <span aria-hidden="true">→</span></span>'}
      </div>
    </article>`).join('');
}

function openGame(id) {
  const game = games.find((entry) => entry.id === id);
  if (!game) return;
  if (activeGame) activeGame.controller.destroy();
  games.filter((entry) => entry.section).forEach((entry) => { entry.section.hidden = entry !== game; });
  activeGame = game;
  intro.hidden = true;
  gameLibrary.hidden = true;
  game.section.scrollIntoView({ behavior: 'smooth' });
  game.controller.render(game.initialMode);
}

function closeGame(game) {
  game.controller.destroy();
  game.section.hidden = true;
  activeGame = null;
  intro.hidden = false;
  gameLibrary.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectTab(game, button) {
  game.tabs.forEach((tab) => { tab.classList.remove('active'); tab.setAttribute('aria-selected', 'false'); });
  button.classList.add('active');
  button.setAttribute('aria-selected', 'true');
  game.controller.render(button.dataset[game.modeAttribute]);
}

document.addEventListener('click', (event) => {
  const openButton = event.target.closest('[data-open-game]');
  if (openButton) return openGame(openButton.dataset.openGame);
  const game = games.find((entry) => entry.closeSelector && event.target.closest(entry.closeSelector));
  if (game) return closeGame(game);
  const tabGame = games.find((entry) => entry.tabsSelector && event.target.closest(entry.tabsSelector));
  if (tabGame) selectTab(tabGame, event.target.closest(tabGame.tabsSelector));
});

filterButtons.forEach((button) => button.addEventListener('click', () => {
  filterButtons.forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  renderGames(button.dataset.filter);
}));

renderGames();
