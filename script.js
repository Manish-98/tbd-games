import { initTypingGame } from './games/typing/game.js';

const games = [
  { title: 'Key / pace / repeat', type: 'Arcade', category: 'arcade', description: 'Type cleanly. Find your rhythm.', symbol: '⌁', playable: true },
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
const typingGame = document.querySelector('#typing-game');
const typingController = initTypingGame(document.querySelector('#typing-view'));

function renderGames(filter = 'all') {
  const visibleGames = filter === 'all' ? games : games.filter((game) => game.category === filter);
  grid.innerHTML = visibleGames.map((game) => `
    <article class="game-card${game.playable ? ' playable' : ''}">
      <div class="game-art" aria-hidden="true"><span class="art-symbol">${game.symbol}</span></div>
      <div class="game-info"><p class="game-type">${game.type}</p><h3 class="game-name">${game.title}</h3><p class="game-description">${game.description}</p>
        ${game.playable ? '<button class="game-link" type="button" data-open-game>Play now <span aria-hidden="true">→</span></button>' : '<span class="game-link">Coming soon <span aria-hidden="true">→</span></span>'}
      </div>
    </article>`).join('');
}

function openGame() {
  typingGame.hidden = false;
  document.querySelector('.intro').hidden = true;
  document.querySelector('.game-library').hidden = true;
  typingGame.scrollIntoView({ behavior: 'smooth' });
  typingController.renderTyping('type');
}

document.addEventListener('click', (event) => { if (event.target.closest('[data-open-game]')) openGame(); });
document.querySelector('#close-game').addEventListener('click', () => {
  typingController.destroy();
  typingGame.hidden = true;
  document.querySelector('.intro').hidden = false;
  document.querySelector('.game-library').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.querySelectorAll('.mode-tab').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.mode-tab').forEach((tab) => { tab.classList.remove('active'); tab.setAttribute('aria-selected', 'false'); });
  button.classList.add('active');
  button.setAttribute('aria-selected', 'true');
  if (button.dataset.mode === 'stats') typingController.renderStats(); else typingController.renderTyping(button.dataset.mode);
}));
filterButtons.forEach((button) => button.addEventListener('click', () => {
  filterButtons.forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  renderGames(button.dataset.filter);
}));

renderGames();
