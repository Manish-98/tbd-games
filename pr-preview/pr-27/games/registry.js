import { initTypingGame } from './typing/game.js';
import { initLogicGame } from './logic/game.js';
import { initTurtleGame } from './turtle/game.js';
import { initCellularGame } from './cellular/game.js';

export const games = [
  {
    id: 'typing',
    title: 'Key / pace / repeat',
    type: 'Arcade',
    category: 'arcade',
    description: 'Type cleanly. Find your rhythm.',
    symbol: '⌁',
    initialize: initTypingGame,
    initialMode: 'type',
    about: {
      objective: 'Improve typing speed and accuracy by transcribing passages exactly as they appear.',
      concept: 'Typing fluency: balancing speed with precision and maintaining a steady rhythm.',
      howToPlay: 'Read the passage, then type it exactly. Your run begins with the first keystroke and ends when the full passage is completed.',
      rules: ['Characters must be entered in the exact order shown.', 'Incorrect keystrokes count as mistakes and do not advance the passage.', 'A run is complete only after the entire passage has been typed.'],
      components: ['Typing passage with a highlighted current character', 'Live speed and accuracy readout', 'Type mode and Ghost race', 'Persistent run history and performance statistics'],
      controls: ['Keyboard: type the displayed passage', 'New passage: start another run', 'Ghost race: compare your pace against your stored reference run', 'Stats: review recent performance'],
      scoring: 'Performance is summarized with WPM, CPM, accuracy, elapsed time, mistakes, personal best, rolling average, and trend.',
      visual: { title: 'How a run works', steps: ["Read the passage","Type the highlighted character","Keep accuracy high","Finish the passage"] },
    }
  },
  {
    id: 'logic',
    title: 'Signal / switch / solve',
    type: 'Puzzle',
    category: 'puzzle',
    description: 'Build a circuit. Chase the light.',
    symbol: '⊙',
    initialize: initLogicGame,
    initialMode: 'lab',
    about: {
      objective: 'Build digital circuits that produce the desired output signals from a set of inputs.',
      concept: 'Boolean logic and the behavior of common logic gates such as AND, OR, NOT, XOR, NAND, and NOR.',
      howToPlay: 'Toggle inputs, add gates, and connect output ports to input ports. In Logic Detective, construct a circuit that matches every row of the target truth table.',
      rules: ['Connections run from output ports to input ports.', 'Each gate input accepts one connection.', 'A connection that would create a circuit loop is rejected.', 'Logic Detective is solved only when every truth-table row matches the target outputs.'],
      components: ['Input switches', 'Logic gates', 'Output bulbs', 'Wires', 'Input/output count controls', 'Truth-table challenge in Logic Detective'],
      controls: ['Click an input switch to toggle it.', 'Click a gate in the legend to add it.', 'Click an output port, then an input port to connect them.', 'Click a connected input port to disconnect it.', 'Use the input/output steppers to change circuit size.'],
      scoring: 'Circuit Detective tracks how many truth-table rows currently match. A challenge is solved when all rows match.',
      visual: { title: 'Build a signal path', steps: ["Set inputs","Place a gate","Connect the signal","Match the output"] },
    }
  },
  {
    id: 'turtle',
    title: 'Turtle run',
    type: 'Creative',
    category: 'arcade',
    description: 'Program a little drawing robot.',
    symbol: '🐢',
    initialize: initTurtleGame,
    initialMode: 'draw',
    about: {
      objective: 'Create drawings by programming a turtle with simple movement, turning, pen, repeat, and reusable commands.',
      concept: 'Introductory programming concepts including sequencing, loops, reusable commands, and parameter binding.',
      howToPlay: 'Build a command program from the available blocks, set the values for movement and turns, and run it to move the turtle across the canvas.',
      rules: ['Commands execute from top to bottom.', 'Movement and turn values are constrained to safe ranges by the editor.', 'Repeat runs its child commands the requested number of times.', 'Reusable custom commands can contain predefined commands or other custom commands.', 'Custom command parameters are resolved through their bindings when the command is executed.'],
      components: ['Turtle canvas', 'Command palette', 'Program command blocks', 'Repeat blocks', 'Reusable custom commands', 'Parameter inputs and bindings', 'Animation controls'],
      controls: ['Add commands from the command palette.', 'Edit numeric command inputs within their allowed ranges.', 'Nest commands inside Repeat blocks.', 'Create and edit reusable commands.', 'Run the program to animate the turtle.', 'Adjust animation speed while working.'],
      scoring: 'There is no competitive score. The outcome is the drawing produced by the executed program.',
      visual: { title: 'Program the turtle', steps: ["Add commands","Set parameters","Repeat or reuse","Run the turtle"] },
    }
  },
  {
    id: 'cellular',
    title: 'Cell / bloom / rerun',
    type: 'Creative',
    category: 'arcade',
    description: 'Shape a tiny world and watch it evolve.',
    symbol: '◈',
    initialize: initCellularGame,
    initialMode: 'play',
    about: {
      objective: 'Create an initial cellular world and explore how simple local rules transform it over successive generations.',
      concept: 'Cellular automata: each cell changes state according to the number of living neighbors and the configured birth/survival rules.',
      howToPlay: 'Paint cells on the grid, configure the birth and survival rules, then run or step the simulation. Experiment with seeds, rules, and saved worlds to discover patterns.',
      rules: ['Each cell is either living or empty.', 'The next generation is computed from each cell and its surrounding neighbors.', 'Birth and survival counts are controlled independently.', 'The grid wraps at its edges, so cells on one edge consider cells on the opposite edge as neighbors.'],
      components: ['Editable cellular grid', 'Generation, living-cell, and changed-cell metrics', 'Birth and survival rule controls', 'Simulation speed control', 'Run, step, reset, randomize, and clear actions', 'Saved custom worlds'],
      controls: ['Click or drag across the grid to paint cells.', 'Run or pause continuous simulation.', 'Step one generation at a time.', 'Reset to the initial seed.', 'Randomize or clear the current world.', 'Toggle rule counts and save/load custom worlds.'],
      scoring: 'There is no score. The main feedback is the evolving pattern plus generation, population, change, and rule readouts.',
      visual: { title: 'Evolve a world', steps: ["Paint a seed","Set birth / survive rules","Step or run","Observe the pattern"] },
    }
  },
  { title: 'Tiny Towers', type: 'Strategy', category: 'strategy', description: 'Build carefully. Balance everything.', symbol: '△' },
  { title: 'Word Bloom', type: 'Puzzle', category: 'puzzle', description: 'A daily garden of letters.', symbol: '✳' },
  { title: 'Orbit', type: 'Arcade', category: 'arcade', description: 'Time your turn around the sun.', symbol: '◌' },
  { title: 'Memory Lane', type: 'Puzzle', category: 'puzzle', description: 'A few cards. A lot of recall.', symbol: '▦' },
  { title: 'Signal Lost', type: 'Strategy', category: 'strategy', description: 'Connect the dots before dark.', symbol: '⌁' },
  { title: 'Pocket Racer', type: 'Arcade', category: 'arcade', description: 'Small track. Serious speed.', symbol: '››' },
  { title: 'Unfold', type: 'Puzzle', category: 'puzzle', description: 'Make the impossible shape fit.', symbol: '◇' }
];

const REQUIRED_ABOUT_FIELDS = ['objective', 'concept', 'howToPlay', 'rules', 'components', 'controls', 'scoring', 'visual'];

export function validateGame(game) {
  if (!game?.id || !game?.initialize) return false;
  const about = game.about;
  if (!about || REQUIRED_ABOUT_FIELDS.some((field) => about[field] === undefined || about[field] === null || about[field] === '')) return false;
  return ['rules', 'components', 'controls'].every((field) => Array.isArray(about[field]) && about[field].length > 0);
}

export function isPlayableGame(game) {
  return Boolean(game?.id && game?.initialize);
}

export function countGames(category = 'all') {
  return category === 'all' ? games.length : games.filter((game) => game.category === category).length;
}
