const games = [
  { title: 'Dot Dash', type: 'Arcade', category: 'arcade', description: 'Find the rhythm. Keep the streak.', symbol: '••' },
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

function renderGames(filter = 'all') {
  const visibleGames = filter === 'all' ? games : games.filter((game) => game.category === filter);

  grid.innerHTML = visibleGames.map((game) => `
    <article class="game-card">
      <div class="game-art" aria-hidden="true"><span class="art-symbol">${game.symbol}</span></div>
      <div class="game-info">
        <p class="game-type">${game.type}</p>
        <h3 class="game-name">${game.title}</h3>
        <p class="game-description">${game.description}</p>
        <a class="game-link" href="#" aria-label="${game.title} coming soon">Coming soon</a>
      </div>
    </article>
  `).join('');
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    renderGames(button.dataset.filter);
  });
});

renderGames();
