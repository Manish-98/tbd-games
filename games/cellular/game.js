import { createGrid, cloneGrid, maskFromList as createRuleMask, listFromMask, countLivingCells as countLiving, randomGrid, setCell as engineSetCell, getCell as engineGetCell, nextGeneration, ruleExpression as formatRule } from './engine.js';
import { createLifecycle } from '../../shared/lifecycle.js';
import { loadJson, saveJson } from '../../shared/storage.js';

const STORAGE_KEY = 'playroom-cellular-custom-worlds';
const DEFAULT_BIRTH = [3];
const DEFAULT_SURVIVE = [2, 3];
const MIN_SPEED = 1;
const MAX_SPEED = 20;
const DEFAULT_COLS = 48;
const DEFAULT_ROWS = 48;
const DEFAULT_CELL_SIZE = 12;
const DEFAULT_WORLD_NAME = 'My world';

let view;
let mode = 'play';
let cols = DEFAULT_COLS;
let rows = DEFAULT_ROWS;
let cellSize = DEFAULT_CELL_SIZE;
let birthMask = maskFromList(DEFAULT_BIRTH);
let surviveMask = maskFromList(DEFAULT_SURVIVE);
let grid = createGridState();
let initialGrid = cloneGridState(grid);
let generation = 0;
let livingCells = 0;
let changedCells = 0;
let running = false;
let speed = 8;
let loopId = null;
let customWorlds = loadCustomWorlds();
let customWorldName = DEFAULT_WORLD_NAME;
let isPainting = false;
let paintValue = true;
let lastPaintCell = null;

function createGridState() { return createGrid(cols, rows); }
function cloneGridState(source) { return cloneGrid(source); }
function maskFromList(values) { return createRuleMask(values); }
function ruleExpression() { return formatRule(birthMask, surviveMask); }

function countLivingCells() { return countLiving(grid); }

function randomizeGrid() {
  grid = randomGrid(cols, rows);
  initialGrid = cloneGridState(grid);
  generation = 0;
  changedCells = 0;
  livingCells = countLiving(grid);
  render();
}

function clearGrid() {
  grid.fill(0);
  initialGrid = cloneGridState(grid);
  generation = 0;
  changedCells = 0;
  livingCells = 0;
  render();
}

function resetToInitial() {
  grid = cloneGridState(initialGrid);
  generation = 0;
  changedCells = 0;
  livingCells = countLivingCells();
  render();
}

function getCell(x, y) { return engineGetCell(grid, cols, rows, x, y); }
function setCell(x, y, nextValue) { engineSetCell(grid, cols, rows, x, y, nextValue); }

function updateSeedState() {
  initialGrid = cloneGridState(grid);
  livingCells = countLivingCells();
  renderCanvas();
}

function stepSimulation() {
  if (!grid.length) return;
  const result = nextGeneration(grid, cols, rows, birthMask, surviveMask);
  grid = result.grid;
  generation += 1;
  livingCells = result.livingCells;
  changedCells = result.changedCells;
  renderCanvas();
  renderMetrics();
}

function startLoop() {
  stopLoop();
  running = true;
  loopId = window.setInterval(() => {
    stepSimulation();
  }, Math.max(80, Math.round(1000 / speed)));
}

function stopLoop() {
  running = false;
  if (loopId) {
    window.clearInterval(loopId);
    loopId = null;
  }
}

function loadCustomWorlds() {
  return loadJson(STORAGE_KEY, []);
}

function persistCustomWorlds() {
  saveJson(STORAGE_KEY, customWorlds);
}

function applyWorldSnapshot(world) {
  if (!world) return;
  cols = Number(world.cols) || DEFAULT_COLS;
  rows = Number(world.rows) || DEFAULT_ROWS;
  birthMask = maskFromList(world.birth || DEFAULT_BIRTH);
  surviveMask = maskFromList(world.survive || DEFAULT_SURVIVE);
  grid = new Uint8Array(cols * rows);
  const snapshot = Array.isArray(world.cells) ? world.cells : [];
  snapshot.forEach((value, index) => {
    if (index < grid.length) {
      grid[index] = value ? 1 : 0;
    }
  });
  initialGrid = cloneGridState(grid);
  generation = 0;
  changedCells = 0;
  livingCells = countLivingCells();
  render();
}

function saveCurrentWorld() {
  const trimmedName = String(customWorldName || '').trim();
  if (!trimmedName) {
    window.alert('Give the world a name before saving it.');
    return;
  }

  const entry = {
    name: trimmedName,
    cols,
    rows,
    birth: listFromMask(birthMask),
    survive: listFromMask(surviveMask),
    cells: Array.from(grid)
  };

  customWorlds = customWorlds.filter((world) => world.name.toLowerCase() !== trimmedName.toLowerCase());
  customWorlds.unshift(entry);
  persistCustomWorlds();
  render();
}

function deleteWorld(name) {
  customWorlds = customWorlds.filter((world) => world.name.toLowerCase() !== String(name).toLowerCase());
  persistCustomWorlds();
  render();
}

function renderCanvas() {
  const canvas = view?.querySelector('[data-cell-canvas]');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#f5f3ed';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(23, 33, 31, 0.08)';
  context.lineWidth = 1;
  for (let y = 0; y <= rows; y += 1) {
    context.beginPath();
    context.moveTo(0, y * cellSize);
    context.lineTo(canvas.width, y * cellSize);
    context.stroke();
  }
  for (let x = 0; x <= cols; x += 1) {
    context.beginPath();
    context.moveTo(x * cellSize, 0);
    context.lineTo(x * cellSize, canvas.height);
    context.stroke();
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!grid[y * cols + x]) continue;
      context.fillStyle = '#ef694f';
      context.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
    }
  }
}

function renderMetrics() {
  const metrics = view?.querySelectorAll('[data-metric]');
  if (!metrics) return;
  metrics.forEach((metric) => {
    const key = metric.dataset.metric;
    if (key === 'generation') metric.textContent = generation;
    if (key === 'living') metric.textContent = livingCells;
    if (key === 'changed') metric.textContent = changedCells;
    if (key === 'rule') metric.textContent = ruleExpression();
  });
}

function renderRuleButtons(kind) {
  return Array.from({ length: 9 }, (_, value) => {
    const isActive = kind === 'birth' ? birthMask[value] === 1 : surviveMask[value] === 1;
    return `<button type="button" class="rule-button ${isActive ? 'active' : ''}" data-rule-kind="${kind}" data-rule-count="${value}" aria-pressed="${isActive}">${value}</button>`;
  }).join('');
}

function renderCustomWorlds() {
  if (!customWorlds.length) {
    return '<p class="cellular-empty">No saved worlds yet.</p>';
  }

  return customWorlds.map((world) => `
    <div class="saved-world-item">
      <button type="button" class="saved-world-name" data-load-custom-world="${world.name}">${world.name}</button>
      <button type="button" class="mini-button" data-delete-custom-world="${world.name}" aria-label="Delete ${world.name}">Delete</button>
    </div>
  `).join('');
}

function render() {
  if (!view) return;
  view.innerHTML = `
    <div class="cellular-shell">
      <div class="cellular-toolbar">
        <div class="cellular-actions">
          <button class="primary-button" type="button" data-cell-action="toggle-run">${running ? 'Pause' : 'Run'}</button>
          <button class="secondary-button" type="button" data-cell-action="step">Step</button>
          <button class="secondary-button" type="button" data-cell-action="reset">Reset</button>
          <button class="secondary-button" type="button" data-cell-action="randomize">Randomize</button>
          <button class="secondary-button" type="button" data-cell-action="clear">Clear</button>
        </div>
      </div>

      <div class="cellular-layout">
        <div class="cellular-stage">
          <div class="cellular-stage-header">
            <p class="section-label">Play mode</p>
            <p>Paint a seed, then let the small local rules do the rest.</p>
          </div>
          <canvas class="cellular-canvas" data-cell-canvas width="${cols * cellSize}" height="${rows * cellSize}" aria-label="Cellular automata grid"></canvas>
        </div>

        <aside class="cellular-sidebar">
          <div class="cellular-panel">
            <p class="section-label">World</p>
            <div class="stat-grid">
              <div class="stat-box"><span>Generation</span><strong data-metric="generation">${generation}</strong></div>
              <div class="stat-box"><span>Living</span><strong data-metric="living">${livingCells}</strong></div>
              <div class="stat-box"><span>Changed</span><strong data-metric="changed">${changedCells}</strong></div>
              <div class="stat-box"><span>Rule</span><strong data-metric="rule">${ruleExpression()}</strong></div>
            </div>
            <label class="field-group">
              <span>Simulation speed</span>
              <input type="range" min="${MIN_SPEED}" max="${MAX_SPEED}" step="1" value="${speed}" data-cell-speed />
            </label>
          </div>

          <div class="cellular-panel">
            <p class="section-label">Rule lab</p>
            <div class="rule-grid">
              <div class="rule-column">
                <span class="rule-tag">Birth</span>
                <div class="rule-buttons">${renderRuleButtons('birth')}</div>
              </div>
              <div class="rule-column">
                <span class="rule-tag">Survive</span>
                <div class="rule-buttons">${renderRuleButtons('survive')}</div>
              </div>
            </div>
            <p class="rule-readout">${ruleExpression()}</p>
          </div>

          <div class="cellular-panel">
            <p class="section-label">Custom worlds</p>
            <label class="field-group">
              <span>World name</span>
              <input type="text" value="${customWorldName}" data-custom-world-name />
            </label>
            <div class="custom-world-actions">
              <button type="button" class="secondary-button full" data-save-world>Save world</button>
            </div>
            <div class="saved-world-list">
              ${renderCustomWorlds()}
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;

  renderCanvas();
  renderMetrics();
}

function getPointerCell(event) {
  const canvas = view?.querySelector('[data-cell-canvas]');
  if (!canvas) return null;
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * cols);
  const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * rows);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
  return { x, y };
}

function handlePointerDown(event) {
  const canvasTarget = event.target.closest('[data-cell-canvas]');
  if (!canvasTarget) return;
  const cell = getPointerCell(event);
  if (!cell) return;
  const activeValue = getCell(cell.x, cell.y);
  paintValue = !activeValue;
  setCell(cell.x, cell.y, paintValue);
  lastPaintCell = cell;
  isPainting = true;
  updateSeedState();
}

function handlePointerMove(event) {
  if (!isPainting) return;
  const cell = getPointerCell(event);
  if (!cell || (lastPaintCell && lastPaintCell.x === cell.x && lastPaintCell.y === cell.y)) return;
  setCell(cell.x, cell.y, paintValue);
  lastPaintCell = cell;
  updateSeedState();
}

function handlePointerUp() {
  isPainting = false;
  lastPaintCell = null;
}

function handleAction(event) {
  const action = event.target.closest('[data-cell-action]');
  if (action) {
    const value = action.dataset.cellAction;
    if (value === 'toggle-run') {
      if (running) {
        stopLoop();
      } else {
        startLoop();
      }
      render();
      return;
    }
    if (value === 'step') {
      stopLoop();
      stepSimulation();
      render();
      return;
    }
    if (value === 'reset') {
      stopLoop();
      resetToInitial();
      return;
    }
    if (value === 'randomize') {
      stopLoop();
      randomizeGrid();
      return;
    }
    if (value === 'clear') {
      stopLoop();
      clearGrid();
      return;
    }
  }

  const ruleControl = event.target.closest('[data-rule-kind]');
  if (ruleControl) {
    const kind = ruleControl.dataset.ruleKind;
    const count = Number(ruleControl.dataset.ruleCount);
    const nextMask = (kind === 'birth' ? birthMask : surviveMask).slice();
    nextMask[count] = nextMask[count] ? 0 : 1;
    if (kind === 'birth') {
      birthMask = nextMask;
    } else {
      surviveMask = nextMask;
    }
    render();
    return;
  }

  const speedControl = event.target.closest('[data-cell-speed]');
  if (speedControl) {
    speed = Number(speedControl.value);
    if (running) {
      startLoop();
    }
    render();
    return;
  }

  const saveWorldTrigger = event.target.closest('[data-save-world]');
  if (saveWorldTrigger) {
    saveCurrentWorld();
    return;
  }

  const deleteWorldTrigger = event.target.closest('[data-delete-custom-world]');
  if (deleteWorldTrigger) {
    deleteWorld(deleteWorldTrigger.dataset.deleteCustomWorld);
    return;
  }

  const loadWorldTrigger = event.target.closest('[data-load-custom-world]');
  if (loadWorldTrigger) {
    const target = customWorlds.find((world) => world.name === loadWorldTrigger.dataset.loadCustomWorld);
    applyWorldSnapshot(target);
    customWorldName = target?.name || customWorldName;
    render();
    return;
  }

  const customNameInput = event.target.closest('[data-custom-world-name]');
  if (customNameInput) {
    customWorldName = customNameInput.value;
  }
}

export function initCellularGame(section) {
  view = section.querySelector('.cellular-view');
  const lifecycle = createLifecycle();
  lifecycle.on(view, 'click', handleAction);
  lifecycle.on(view, 'input', handleAction);
  lifecycle.on(view, 'pointerdown', handlePointerDown);
  lifecycle.on(view, 'pointermove', handlePointerMove);
  lifecycle.on(window, 'pointerup', handlePointerUp);

  randomizeGrid();

  return {
    render(nextMode = 'play') {
      mode = nextMode;
      render();
    },
    destroy() {
      stopLoop();
      lifecycle.dispose();
      view.innerHTML = '';
    }
  };
}
