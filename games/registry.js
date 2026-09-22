import { initTypingGame } from './typing/game.js';
import { initLogicGame } from './logic/game.js';
import { initTurtleGame } from './turtle/game.js';
import { initCellularGame } from './cellular/game.js';

export const games = [
  { id: 'typing', title: 'Key / pace / repeat', type: 'Arcade', category: 'arcade', description: 'Type cleanly. Find your rhythm.', symbol: '⌁', initialize: initTypingGame, initialMode: 'type' },
  { id: 'logic', title: 'Signal / switch / solve', type: 'Puzzle', category: 'puzzle', description: 'Build a circuit. Chase the light.', symbol: '⊙', initialize: initLogicGame, initialMode: 'lab' },
  { id: 'turtle', title: 'Turtle run', type: 'Creative', category: 'arcade', description: 'Program a little drawing robot.', symbol: '🐢', initialize: initTurtleGame, initialMode: 'draw' },
  { id: 'cellular', title: 'Cell / bloom / rerun', type: 'Creative', category: 'arcade', description: 'Shape a tiny world and watch it evolve.', symbol: '◈', initialize: initCellularGame, initialMode: 'play' },
  { title: 'Tiny Towers', type: 'Strategy', category: 'strategy', description: 'Build carefully. Balance everything.', symbol: '△' },
  { title: 'Word Bloom', type: 'Puzzle', category: 'puzzle', description: 'A daily garden of letters.', symbol: '✳' },
  { title: 'Orbit', type: 'Arcade', category: 'arcade', description: 'Time your turn around the sun.', symbol: '◌' },
  { title: 'Memory Lane', type: 'Puzzle', category: 'puzzle', description: 'A few cards. A lot of recall.', symbol: '▦' },
  { title: 'Signal Lost', type: 'Strategy', category: 'strategy', description: 'Connect the dots before dark.', symbol: '⌁' },
  { title: 'Pocket Racer', type: 'Arcade', category: 'arcade', description: 'Small track. Serious speed.', symbol: '››' },
  { title: 'Unfold', type: 'Puzzle', category: 'puzzle', description: 'Make the impossible shape fit.', symbol: '◇' }
];


export function isPlayableGame(game) {
  return Boolean(game?.id && game?.initialize);
}

export function countGames(category = 'all') {
  return category === 'all' ? games.length : games.filter((game) => game.category === category).length;
}
