const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const DEFAULT_TURTLE = { x: 320, y: 220, angle: -90, penDown: true };
const STORAGE_KEY = 'playroom-turtle-custom-commands';
const SAMPLE_PROGRAMS = {
  draw: [
    { type: 'repeat', count: 4, children: [
      { type: 'forward', value: 90 },
      { type: 'right', value: 90 }
    ] }
  ]
};

let view;
let mode = 'draw';
let turtle = { ...DEFAULT_TURTLE };
let program = cloneProgram(SAMPLE_PROGRAMS.draw);
let strokes = [];
let isRunning = false;
let customCommands = loadCustomCommands();

function cloneProgram(commands) {
  return JSON.parse(JSON.stringify(commands));
}

function isParameterToken(value) {
  return typeof value === 'string' && /^[$A-Z_][0-9A-Z_$]*$/i.test(value.trim());
}

function resolveRuntimeValue(value, parameterMap = {}) {
  const text = typeof value === 'string' ? value.trim() : value;
  if (isParameterToken(String(text)) && Object.prototype.hasOwnProperty.call(parameterMap, String(text))) {
    return Number(parameterMap[String(text)]) || 0;
  }
  if (typeof text === 'string' && isParameterToken(text)) {
    return Number(text) || 0;
  }
  if (text === '') return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function prepareCommand(command, parameterMap = {}) {
  if (!command || typeof command !== 'object') return command;
  const next = { ...command };
  if (Object.prototype.hasOwnProperty.call(next, 'value')) {
    next.value = resolveRuntimeValue(next.value, parameterMap);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'count')) {
    next.count = resolveRuntimeValue(next.count, parameterMap);
  }
  if (Array.isArray(next.children)) {
    next.children = next.children.map((child) => prepareCommand(child, parameterMap));
  }
  return next;
}

function loadCustomCommands() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistCustomCommands() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customCommands));
  } catch {
    // quiet fail for browser storage limits
  }
}

function findCustomCommand(name) {
  return customCommands.find((command) => command.name.toLowerCase() === String(name).toLowerCase());
}

function parseBindingMap(raw = '') {
  const result = {};
  const entries = String(raw || '').split(';').map((entry) => entry.trim()).filter(Boolean);
  entries.forEach((entry) => {
    const separator = entry.indexOf(':');
    if (separator === -1) return;
    const name = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (!name) return;
    const paths = value.split(',').map((segment) => segment.trim()).filter(Boolean);
    result[name] = paths;
  });
  return result;
}

function applyBindingsToBody(body, bindings = {}, parameterMap = {}) {
  const nextBody = cloneProgram(body || []);
  Object.entries(bindings).forEach(([paramName, pathList]) => {
    const value = Number(parameterMap[paramName] ?? 0);
    (Array.isArray(pathList) ? pathList : []).forEach((path) => {
      const target = getNodeAtPath(nextBody, path);
      if (!target) return;
      if (Object.prototype.hasOwnProperty.call(target, 'value')) {
        target.value = value;
      }
      if (Object.prototype.hasOwnProperty.call(target, 'count')) {
        target.count = value;
      }
    });
  });
  return nextBody;
}

function getPathParts(path = '') {
  if (!path) return [];
  return path.split('.').filter(Boolean).map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

function getNodeAtPath(list, path) {
  const parts = getPathParts(path);
  let current = list;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
    if (current === undefined) return undefined;
  }
  return current;
}

function getParentAndIndex(list, path) {
  const parts = getPathParts(path);
  if (parts.length === 0) return { list, index: -1, parent: null };
  const parentPath = parts.slice(0, -1);
  const parent = getNodeAtPath(list, parentPath.join('.'));
  const lastIndex = parts.at(-1);
  if (!Array.isArray(parent)) return { list, index: -1, parent: null };
  return { list: parent, index: lastIndex, parent: Array.isArray(parent) ? null : parent };
}

function createCommand(type) {
  if (type === 'forward') return { type, value: 80 };
  if (type === 'back') return { type: 'back', value: 80 };
  if (type === 'left') return { type: 'left', value: 30 };
  if (type === 'right') return { type: 'right', value: 30 };
  if (type === 'penUp') return { type: 'penUp' };
  if (type === 'penDown') return { type: 'penDown' };
  if (type === 'repeat') return { type: 'repeat', count: 4, children: [
    { type: 'forward', value: 60 },
    { type: 'right', value: 90 }
  ] };
  if (type === 'call') {
    const fallback = customCommands[0]?.name || 'square';
    return { type: 'call', name: fallback, args: [] };
  }
  return { type: 'forward', value: 80 };
}

function resetTurtle() {
  turtle = { ...DEFAULT_TURTLE };
  strokes = [];
  renderBoard();
}

function setProgramFromMode(nextMode) {
  mode = nextMode || 'draw';
  const source = SAMPLE_PROGRAMS[mode] ?? SAMPLE_PROGRAMS.draw;
  program = cloneProgram(source);
  resetTurtle();
  render();
}

function updateProgramValue(path, value) {
  const node = getNodeAtPath(program, path);
  if (!node) return;
  const textValue = String(value).trim();
  if (!textValue) {
    node.value = 0;
    return;
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(textValue)) {
    node.value = textValue;
    return;
  }

  const numericValue = Number(textValue);
  if (node.type === 'repeat') {
    node.count = clamp(Number.isFinite(numericValue) ? numericValue : 1, 1, 24);
    return;
  }
  if (node.type === 'left' || node.type === 'right') {
    node.value = clamp(Number.isFinite(numericValue) ? numericValue : 30, 1, 360);
    return;
  }
  node.value = clamp(Number.isFinite(numericValue) ? numericValue : 10, 10, 220);
}

function updateProgramFromInput(event) {
  const input = event.target.closest('[data-program-path]');
  if (!input) return;
  updateProgramValue(input.dataset.programPath, input.value);
}

function updateCallParameter(path, paramName, value) {
  const node = getNodeAtPath(program, path);
  if (!node || node.type !== 'call') return;
  const paramValues = { ...(node.paramValues || {}) };
  paramValues[paramName] = Number(value) || 0;
  node.paramValues = paramValues;
}

function addCommand(type, path = '') {
  const command = createCommand(type);
  if (!path) {
    program.push(command);
    render();
    return;
  }

  const target = getNodeAtPath(program, path);
  if (target && Array.isArray(target.children)) {
    target.children.push(command);
    render();
    return;
  }

  const parent = getNodeAtPath(program, path);
  if (Array.isArray(parent)) {
    parent.push(command);
    render();
  }
}

function appendCustomCommand(name) {
  const customName = String(name || '').trim();
  if (!customName) return;
  const definition = findCustomCommand(customName);
  if (!definition) return;

  const values = {};
  definition.params.forEach((param) => {
    values[param] = '0';
  });

  program.push({ type: 'call', name: customName, args: definition.params, paramValues: values });
  render();
}

function saveCurrentProgramAsCommand() {
  if (!program.length) {
    window.alert('Add a few commands before saving a custom one.');
    return;
  }

  const form = view?.querySelector('#custom-name-input');
  const paramsInput = view?.querySelector('#custom-params-input');
  const bindingsInput = view?.querySelector('#custom-bindings-input');
  const name = String(form?.value || '').trim();
  if (!name) {
    window.alert('Give the custom command a name first.');
    return;
  }

  const normalized = name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!normalized) {
    window.alert('Use letters, numbers, or underscores only.');
    return;
  }

  const params = String(paramsInput?.value || '').split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => entry.replace(/[^a-zA-Z0-9_]/g, ''));
  const rawBindings = String(bindingsInput?.value || '').trim();
  const bindings = parseBindingMap(rawBindings);
  const nextEntry = {
    name: normalized,
    params: params.filter((value, index, all) => value && all.indexOf(value) === index),
    bindings,
    body: cloneProgram(program)
  };
  customCommands = customCommands.filter((entry) => entry.name.toLowerCase() !== normalized.toLowerCase());
  customCommands.push(nextEntry);
  persistCustomCommands();
  if (form) form.value = '';
  if (paramsInput) paramsInput.value = '';
  if (bindingsInput) bindingsInput.value = '';
  render();
}

function deleteCustomCommand(name) {
  customCommands = customCommands.filter((entry) => entry.name.toLowerCase() !== String(name).toLowerCase());
  persistCustomCommands();
  render();
}

function removeCommand(path) {
  const parts = getPathParts(path);
  if (parts.length === 0) {
    program = [];
    render();
    return;
  }

  const parentPath = parts.slice(0, -1).join('.');
  const parent = parentPath ? getNodeAtPath(program, parentPath) : program;
  const index = Number(parts.at(-1));

  if (Array.isArray(parent)) {
    parent.splice(index, 1);
  } else if (parent && Array.isArray(parent.children)) {
    parent.children.splice(index, 1);
  }
  render();
}

function moveTurtle(distance) {
  const radians = (turtle.angle * Math.PI) / 180;
  const nextX = turtle.x + Math.cos(radians) * distance;
  const nextY = turtle.y + Math.sin(radians) * distance;

  if (turtle.penDown) {
    strokes.push({ x1: turtle.x, y1: turtle.y, x2: nextX, y2: nextY });
  }

  turtle.x = clamp(nextX, 20, 620);
  turtle.y = clamp(nextY, 20, 420);
  renderBoard();
}

function turnTurtle(delta) {
  turtle.angle = (turtle.angle + delta + 360) % 360;
  renderBoard();
}

async function executeCommand(command, parameterMap = {}) {
  if (!isRunning) return;

  const resolved = prepareCommand(command, parameterMap);

  if (resolved.type === 'forward') {
    moveTurtle(Number(resolved.value) || 0);
    await wait(90);
    return;
  }
  if (resolved.type === 'back') {
    moveTurtle(-Number(resolved.value) || 0);
    await wait(90);
    return;
  }
  if (resolved.type === 'left') {
    turnTurtle(-Number(resolved.value) || 0);
    await wait(90);
    return;
  }
  if (resolved.type === 'right') {
    turnTurtle(Number(resolved.value) || 0);
    await wait(90);
    return;
  }
  if (resolved.type === 'penUp') {
    turtle.penDown = false;
    renderBoard();
    await wait(90);
    return;
  }
  if (resolved.type === 'penDown') {
    turtle.penDown = true;
    renderBoard();
    await wait(90);
    return;
  }
  if (resolved.type === 'repeat') {
    const count = clamp(Math.round(Number(resolved.count) || 1), 1, 24);
    for (let index = 0; index < count; index += 1) {
      if (!isRunning) return;
      for (const child of resolved.children || []) {
        if (!isRunning) return;
        await executeCommand(child, parameterMap);
      }
    }
    return;
  }

  if (resolved.type === 'call') {
    const definition = findCustomCommand(resolved.name);
    if (!definition) return;
    const localParams = { ...(resolved.paramValues || {}) };
    for (const param of definition.params || []) {
      if (!Object.prototype.hasOwnProperty.call(localParams, param)) {
        localParams[param] = '0';
      }
    }
    const boundBody = applyBindingsToBody(definition.body || [], definition.bindings || {}, localParams);
    for (const child of boundBody) {
      if (!isRunning) return;
      await executeCommand(child, localParams);
    }
  }
}

function wait(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

async function runProgram() {
  if (isRunning) return;
  isRunning = true;

  try {
    for (const command of program) {
      if (!isRunning) break;
      await executeCommand(command);
    }
  } finally {
    isRunning = false;
    render();
  }
}

function renderBoard() {
  const canvas = view?.querySelector('#turtle-canvas');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#f5f3ed';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(23, 33, 31, 0.12)';
  context.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.strokeStyle = '#17211f';
  context.lineWidth = 2;
  strokes.forEach((stroke) => {
    context.beginPath();
    context.moveTo(stroke.x1, stroke.y1);
    context.lineTo(stroke.x2, stroke.y2);
    context.stroke();
  });

  context.save();
  context.translate(turtle.x, turtle.y);
  context.rotate((turtle.angle * Math.PI) / 180);
  context.fillStyle = '#ef694f';
  context.beginPath();
  context.moveTo(14, 0);
  context.lineTo(-10, -8);
  context.lineTo(-8, 0);
  context.lineTo(-10, 8);
  context.closePath();
  context.fill();
  context.restore();

  context.fillStyle = '#17211f';
  context.beginPath();
  context.arc(turtle.x, turtle.y, 4, 0, Math.PI * 2);
  context.fill();
}

function renderCommandList(commands, pathPrefix = '') {
  if (!Array.isArray(commands)) return '';
  return commands.map((command, index) => {
    const path = pathPrefix ? `${pathPrefix}.${index}` : `${index}`;
    const unitLabel = command.type === 'left' || command.type === 'right' ? '°' : command.type === 'repeat' ? 'x' : 'px';
    const valueInput = command.type === 'repeat' || command.type === 'forward' || command.type === 'back' || command.type === 'left' || command.type === 'right'
      ? `<label class="command-value"><span>${unitLabel}</span><input type="number" inputmode="numeric" value="${command.type === 'repeat' ? command.count : command.value}" data-program-path="${path}" min="${command.type === 'repeat' ? '1' : '10'}" max="${command.type === 'repeat' ? '24' : command.type === 'left' || command.type === 'right' ? '360' : '220'}" /></label>`
      : '';
    const children = command.type === 'repeat'
      ? `<div class="command-children"><div class="command-row-label">Loop body</div>${renderCommandList(command.children || [], `${path}.children`)}</div>`
      : '';
    const addButtons = command.type === 'repeat'
      ? `<div class="command-actions"><button type="button" class="mini-button" data-add-command="forward" data-command-parent="${path}">+ forward</button><button type="button" class="mini-button" data-add-command="right" data-command-parent="${path}">+ right</button><button type="button" class="mini-button" data-add-command="repeat" data-command-parent="${path}">+ repeat</button></div>`
      : '';
    const label = command.type === 'call' ? `${command.name}()` : command.type === 'penUp' ? 'Pen up' : command.type === 'penDown' ? 'Pen down' : command.type === 'repeat' ? 'Repeat' : command.type === 'forward' ? 'Forward' : command.type === 'back' ? 'Back' : command.type === 'left' ? 'Left' : command.type === 'right' ? 'Right' : command.type;
    const callArgs = command.type === 'call'
      ? `<div class="call-arg-list">${(command.args || []).map((param) => `<label class="command-value"><span>${param}</span><input type="number" inputmode="numeric" value="${command.paramValues?.[param] ?? 0}" data-call-path="${path}" data-call-param="${param}" /></label>`).join('')}</div>`
      : '';

    return `
      <div class="command-block" data-command-block="${path}">
        <div class="command-header">
          <span class="command-name">${label}</span>
          ${valueInput}
          <button type="button" class="text-button small" data-delete-command="${path}" aria-label="Delete command">Delete</button>
        </div>
        ${callArgs}
        ${children}
        ${addButtons}
      </div>
    `;
  }).join('');
}

function renderCustomCommands() {
  if (!customCommands.length) {
    return '<p class="custom-empty">No custom commands yet.</p>';
  }

  return customCommands.map((command) => `
    <div class="custom-command-item">
      <span class="custom-command-name">${command.name}${command.params.length ? `(${command.params.join(', ')})` : '()'}</span>
      <div class="custom-command-actions">
        <button type="button" class="mini-button" data-use-custom="${command.name}">Use</button>
        <button type="button" class="mini-button" data-delete-custom="${command.name}">Delete</button>
      </div>
    </div>
  `).join('');
}

function render() {
  if (!view) return;

  const buttons = [
    { type: 'forward', label: 'Forward' },
    { type: 'back', label: 'Back' },
    { type: 'left', label: 'Left' },
    { type: 'right', label: 'Right' },
    { type: 'penUp', label: 'Pen up' },
    { type: 'penDown', label: 'Pen down' },
    { type: 'repeat', label: 'Repeat' }
  ];

  view.innerHTML = `
    <div class="turtle-shell">
      <div class="turtle-toolbar">
        <div class="turtle-actions">
          <button class="primary-button" type="button" data-turtle-action="run">Run</button>
          <button class="secondary-button" type="button" data-turtle-action="clear">Clear</button>
          <button class="secondary-button" type="button" data-turtle-action="reset">Reset turtle</button>
        </div>
      </div>

      <div class="turtle-layout">
        <div class="turtle-canvas-panel">
          <canvas id="turtle-canvas" width="640" height="440" aria-label="Turtle drawing canvas"></canvas>
        </div>

        <aside class="turtle-sidebar">
          <div class="palette">
            <p class="section-label">Command toolbox</p>
            <div class="tool-grid">
              ${buttons.map((button) => `<button type="button" class="tool-button" data-add-command="${button.type}">${button.label}</button>`).join('')}
            </div>
          </div>

          <div class="program-panel">
            <p class="section-label">Program</p>
            <div class="program-list">
              ${renderCommandList(program)}
            </div>
          </div>

          <div class="custom-panel">
            <p class="section-label">My commands</p>
            <div class="custom-form">
              <label class="field-group">
                <span>Name</span>
                <input id="custom-name-input" type="text" placeholder="square" />
              </label>
              <label class="field-group">
                <span>Parameters</span>
                <input id="custom-params-input" type="text" placeholder="size, turn" />
              </label>
              <label class="field-group">
                <span>Bindings</span>
                <input id="custom-bindings-input" type="text" placeholder="size: 0, 2; turn: 1.children.0" />
              </label>
            </div>
            <button type="button" class="secondary-button full" data-save-custom-command>Save current program</button>
            <div class="custom-command-list">
              ${renderCustomCommands()}
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;

  renderBoard();
}

function handleAction(event) {
  const runTrigger = event.target.closest('[data-turtle-action="run"]');
  if (runTrigger) { runProgram(); return; }

  const clearTrigger = event.target.closest('[data-turtle-action="clear"]');
  if (clearTrigger) { strokes = []; renderBoard(); return; }

  const resetTrigger = event.target.closest('[data-turtle-action="reset"]');
  if (resetTrigger) { resetTurtle(); return; }

  const addCommandTrigger = event.target.closest('[data-add-command]');
  if (addCommandTrigger) {
    addCommand(addCommandTrigger.dataset.addCommand, addCommandTrigger.dataset.commandParent || '');
    return;
  }

  const deleteCommandTrigger = event.target.closest('[data-delete-command]');
  if (deleteCommandTrigger) {
    removeCommand(deleteCommandTrigger.dataset.deleteCommand);
    return;
  }

  const saveCommandTrigger = event.target.closest('[data-save-custom-command]');
  if (saveCommandTrigger) {
    saveCurrentProgramAsCommand();
    return;
  }

  const useCustomTrigger = event.target.closest('[data-use-custom]');
  if (useCustomTrigger) {
    appendCustomCommand(useCustomTrigger.dataset.useCustom);
    return;
  }

  const deleteCustomTrigger = event.target.closest('[data-delete-custom]');
  if (deleteCustomTrigger) {
    deleteCustomCommand(deleteCustomTrigger.dataset.deleteCustom);
    return;
  }

  const callParamInput = event.target.closest('[data-call-param]');
  if (callParamInput) {
    updateCallParameter(callParamInput.dataset.callPath, callParamInput.dataset.callParam, callParamInput.value);
    return;
  }

  const programInput = event.target.closest('[data-program-path]');
  if (programInput) {
    updateProgramFromInput(event);
  }
}

export function initTurtleGame(turtleView) {
  view = turtleView;
  let active = false;

  const activate = () => {
    if (active) return;
    view.addEventListener('click', handleAction);
    view.addEventListener('input', handleAction);
    active = true;
  };

  const deactivate = () => {
    if (!active) return;
    view.removeEventListener('click', handleAction);
    view.removeEventListener('input', handleAction);
    active = false;
  };

  activate();

  return {
    render(nextMode = 'draw') {
      setProgramFromMode(nextMode);
      activate();
    },
    destroy() {
      isRunning = false;
      deactivate();
      view.innerHTML = '';
    }
  };
}
