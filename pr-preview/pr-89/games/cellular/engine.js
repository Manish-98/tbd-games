export function createGrid(cols, rows, cells) {
  const grid = new Uint8Array(cols * rows);
  if (cells) cells.forEach((value, index) => { if (index < grid.length) grid[index] = value ? 1 : 0; });
  return grid;
}

export function cloneGrid(grid) {
  return new Uint8Array(grid);
}

export function maskFromList(values = []) {
  const mask = Array(9).fill(0);
  values.forEach((value) => {
    if (Number.isInteger(value) && value >= 0 && value <= 8) mask[value] = 1;
  });
  return mask;
}

export function listFromMask(mask = []) {
  return mask.map((enabled, value) => (enabled ? value : null)).filter((value) => value !== null);
}

export function countLivingCells(grid) {
  return grid.reduce((total, value) => total + value, 0);
}

export function setCell(grid, cols, rows, x, y, value) {
  const wrappedX = (x + cols) % cols;
  const wrappedY = (y + rows) % rows;
  grid[wrappedY * cols + wrappedX] = value ? 1 : 0;
}

export function getCell(grid, cols, rows, x, y) {
  const wrappedX = (x + cols) % cols;
  const wrappedY = (y + rows) % rows;
  return Boolean(grid[wrappedY * cols + wrappedX]);
}

export function randomGrid(cols, rows, probability, random = Math.random) {
  const grid = createGrid(cols, rows);
  for (let index = 0; index < grid.length; index += 1) grid[index] = random() < probability ? 1 : 0;
  return grid;
}

export function nextGeneration(grid, cols, rows, birthMask, surviveMask) {
  const next = createGrid(cols, rows);
  let livingCells = 0;
  let changedCells = 0;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx !== 0 || dy !== 0) neighbours += getCell(grid, cols, rows, x + dx, y + dy) ? 1 : 0;
        }
      }
      const alive = getCell(grid, cols, rows, x, y);
      const nextState = (alive ? surviveMask[neighbours] : birthMask[neighbours]) ? 1 : 0;
      next[y * cols + x] = nextState;
      livingCells += nextState;
      if (alive !== Boolean(nextState)) changedCells += 1;
    }
  }
  return { grid: next, livingCells, changedCells };
}

export function ruleExpression(birthMask, surviveMask) {
  return `B${listFromMask(birthMask).join('') || '0'}/S${listFromMask(surviveMask).join('') || '0'}`;
}
