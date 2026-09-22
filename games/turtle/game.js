import { escapeHtml } from '../../dom.js';
import { createLifecycle } from '../../shared/lifecycle.js';
import { createCommand as createEngineCommand, cloneProgram as cloneEngineProgram, executeProgram, parseBindingPath } from './engine.js';
import { loadJson, saveJson } from '../../shared/storage.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const MOVEMENT_MIN = 1;
const MOVEMENT_MAX = 220;
const REPEAT_MIN = 1;
const REPEAT_MAX = 500;
const TURN_MIN = 1;
const TURN_MAX = 360;
const DEFAULT_TURTLE = { x: 450, y: 300, angle: -90, penDown: true };
const STORAGE_KEY = 'playroom-turtle-custom-commands';
const DEFAULT_ANIMATION_DELAY = 90;
const MIN_ANIMATION_DELAY = 0;
const MAX_ANIMATION_DELAY = 200;
const BUILT_IN_COMMANDS = [
  { type: 'forward', label: 'Forward' },
  { type: 'back', label: 'Back' },
  { type: 'left', label: 'Left' },
  { type: 'right', label: 'Right' },
  { type: 'penUp', label: 'Pen up' },
  { type: 'penDown', label: 'Pen down' },
  { type: 'repeat', label: 'Repeat' }
];

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
let activeRunId = 0;
let animationDelay = DEFAULT_ANIMATION_DELAY;
let customCommands = loadCustomCommands();
let editingCustomCommandName = '';
let programBeforeCustomEdit = null;
let customDraft = { name: '', params: '', bindings: '' };

function cloneProgram(commands) { return cloneEngineProgram(commands); }

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
  return loadJson(STORAGE_KEY, []);
}

function persistCustomCommands() {
  saveJson(STORAGE_KEY, customCommands);
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

function getCommandValueRange(command) {
  if (command?.type === 'repeat') return { min: REPEAT_MIN, max: REPEAT_MAX, field: 'count' };
  if (command?.type === 'left' || command?.type === 'right') return { min: TURN_MIN, max: TURN_MAX, field: 'value' };
  if (command?.type === 'forward' || command?.type === 'back') return { min: MOVEMENT_MIN, max: MOVEMENT_MAX, field: 'value' };
  return null;
}

function getNodeAtBindingPath(list, path) {
  const parts = parseBindingPath(path);
  if (!parts) return undefined;
  let current = list;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

function getCallParameterTarget(body, path) {
  const parts = parseBindingPath(path);
  if (!parts || parts.length < 3) return null;
  const parameterName = parts.at(-1);
  const parameterValuesKey = parts.at(-2);
  if (parameterValuesKey !== 'paramValues' || typeof parameterName !== 'string') return null;
  const commandPath = parts.slice(0, -2);
  const command = getNodeAtBindingPath(body, commandPath.join('.'));
  if (!command || command.type !== 'call') return null;
  const definition = findCustomCommand(command.name);
  if (!definition || !(definition.params || []).includes(parameterName)) return null;
  return { command, paramName: parameterName };
}

function validateBindings(bindings, params, body) {
  const parameterSet = new Set(params);
  const seenPaths = new Set();

  for (const [paramName, paths] of Object.entries(bindings)) {
    if (!parameterSet.has(paramName)) {
      return `Binding "\${paramName}" must reference a declared parameter.`;
    }
    if (!paths.length) {
      return `Binding "\${paramName}" must include at least one command path.`;
    }
    for (const path of paths) {
      if (seenPaths.has(path)) {
        return `Binding path "\${path}" is used more than once.`;
      }
      seenPaths.add(path);

      const parts = parseBindingPath(path);
      if (!parts) {
        return `Binding path "\${path}" is invalid. Use JSONPath-style paths such as "$[0].children[0]".`;
      }

      const target = getNodeAtBindingPath(body, path);
      const range = getCommandValueRange(target);
      if (range) continue;

      if (getCallParameterTarget(body, path)) continue;

      return `Binding path "\${path}" must target a movement, turn, repeat value, or custom-call parameter.`;
    }
  }
  return '';
}

function applyBindingsToBody(body, bindings = {}, parameterMap = {}) {
  const nextBody = cloneProgram(body || []);
  Object.entries(bindings).forEach(([paramName, pathList]) => {
    const value = Number(parameterMap[paramName] ?? 0);
    (Array.isArray(pathList) ? pathList : []).forEach((path) => {
      const target = getNodeAtBindingPath(nextBody, path);
      if (target) {
        const range = getCommandValueRange(target);
        if (range) {
          target[range.field] = clamp(Number.isFinite(value) ? value : range.min, range.min, range.max);
          return;
        }
      }

      const callTarget = getCallParameterTarget(nextBody, path);
      if (callTarget) {
        callTarget.command.paramValues = {
          ...(callTarget.command.paramValues || {}),
          [callTarget.paramName]: String(Number.isFinite(value) ? value : 0)
        };
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

function createCommand(type, customName = '') {
  const command = createEngineCommand(type);
  if (!command) return { type: 'forward', value: 80 };
  if (type === 'forward' || type === 'back') command.value = 80;
  if (type === 'repeat') { command.count = 4; command.children = [{ type: 'forward', value: 60 }, { type: 'right', value: 90 }]; }
  if (type === 'call') {
    const definition = findCustomCommand(customName) || customCommands[0];
    if (definition) {
      command.name = definition.name;
      command.args = [...(definition.params || [])];
      command.paramValues = Object.fromEntries((definition.params || []).map((param) => [param, '0']));
    }
  }
  return command;
}

function renderCommandActions(parentPath = '') {
  const builtIns = BUILT_IN_COMMANDS.map((button) =>
    `<button type="button" class="mini-button" data-add-command="${button.type}" data-command-parent="${parentPath}">+ ${button.label.toLowerCase()}</button>`
  ).join('');
  const custom = customCommands.map((command) =>
    `<button type="button" class="mini-button" data-add-custom="${escapeHtml(command.name)}" data-command-parent="${parentPath}">+ ${escapeHtml(command.name)}</button>`
  ).join('');
  return builtIns + custom;
}

function resetTurtle() {
  activeRunId += 1;
  isRunning = false;
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
    if (node.type === 'repeat') {
      node.count = REPEAT_MIN;
    } else {
      node.value = textValue;
    }
    return;
  }

  const numericValue = Number(textValue);
  if (node.type === 'repeat') {
    node.count = clamp(Number.isFinite(numericValue) ? numericValue : REPEAT_MIN, REPEAT_MIN, REPEAT_MAX);
    return;
  }
  if (node.type === 'left' || node.type === 'right') {
    node.value = clamp(Number.isFinite(numericValue) ? numericValue : 30, TURN_MIN, TURN_MAX);
    return;
  }
  node.value = clamp(Number.isFinite(numericValue) ? numericValue : MOVEMENT_MIN, MOVEMENT_MIN, MOVEMENT_MAX);
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
  const numericValue = Number(value);
  paramValues[paramName] = clamp(Number.isFinite(numericValue) ? numericValue : REPEAT_MIN, REPEAT_MIN, REPEAT_MAX);
  node.paramValues = paramValues;
}

function addCommand(type, path = '', customName = '') {
  const command = createCommand(type, customName);
  if (type === 'call' && !command.name) return;
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

function appendCustomCommand(name, path = '') {
  const customName = String(name || '').trim();
  if (!customName || !findCustomCommand(customName)) return;
  addCommand('call', path, customName);
}

function bindingsToInput(bindings = {}) {
  return Object.entries(bindings).map(([name, paths]) => `${name}: ${(paths || []).join(', ')}`).join('; ');
}

function editCustomCommand(name) {
  const definition = findCustomCommand(name);
  if (!definition) return;
  if (!editingCustomCommandName) {
    programBeforeCustomEdit = cloneProgram(program);
  }
  editingCustomCommandName = definition.name;
  customDraft = {
    name: definition.name,
    params: (definition.params || []).join(', '),
    bindings: bindingsToInput(definition.bindings)
  };
  program = cloneProgram(definition.body || []);
  render();
}

function cancelCustomCommandEdit() {
  if (programBeforeCustomEdit) {
    program = programBeforeCustomEdit;
  }
  editingCustomCommandName = '';
  programBeforeCustomEdit = null;
  customDraft = { name: '', params: '', bindings: '' };
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

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    window.alert('Use a name beginning with a letter or underscore, followed by letters, numbers, or underscores.');
    return;
  }
  const normalized = name;

  const rawParams = String(paramsInput?.value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
  if (rawParams.some((param) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(param))) {
    window.alert('Each parameter must begin with a letter or underscore and contain only letters, numbers, or underscores.');
    return;
  }
  const params = rawParams.filter((value, index, all) => all.indexOf(value) === index);
  if (params.length !== rawParams.length) {
    window.alert('Parameter names must be unique.');
    return;
  }
  const rawBindings = String(bindingsInput?.value || '').trim();
  const bindings = parseBindingMap(rawBindings);
  const bindingError = validateBindings(bindings, params, program);
  if (bindingError) {
    window.alert(bindingError);
    return;
  }
  const nextEntry = {
    name: normalized,
    params,
    bindings,
    body: cloneProgram(program)
  };
  customCommands = customCommands.filter((entry) => entry.name.toLowerCase() !== normalized.toLowerCase());
  if (editingCustomCommandName) {
    customCommands = customCommands.filter((entry) => entry.name.toLowerCase() !== editingCustomCommandName.toLowerCase());
  }
  customCommands.push(nextEntry);
  persistCustomCommands();
  editingCustomCommandName = '';
  programBeforeCustomEdit = null;
  customDraft = { name: '', params: '', bindings: '' };
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

  turtle.x = clamp(nextX, 20, 880);
  turtle.y = clamp(nextY, 20, 580);
  renderBoard();
}

function turnTurtle(delta) {
  turtle.angle = (turtle.angle + delta + 360) % 360;
  renderBoard();
}

async function runProgram() {
  if (isRunning) return;
  const runId = activeRunId + 1;
  activeRunId = runId;
  isRunning = true;
  try {
    const initialState = { ...turtle };
    for (const step of executeProgram(program, customCommands, initialState, { bounds: { minX: 20, maxX: 880, minY: 20, maxY: 580 } })) {
      if (!isRunning || runId !== activeRunId) break;
      turtle = step.state;
      if (step.stroke) strokes.push(step.stroke);
      renderBoard();
      if (animationDelay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, animationDelay));
      }
    }
  } finally {
    if (runId === activeRunId) {
      isRunning = false;
      render();
    }
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
      ? `<label class="command-value"><span>${unitLabel}</span><input type="number" inputmode="numeric" value="${command.type === 'repeat' ? command.count : command.value}" data-program-path="${path}" min="${command.type === 'repeat' ? REPEAT_MIN : command.type === 'left' || command.type === 'right' ? TURN_MIN : MOVEMENT_MIN}" max="${command.type === 'repeat' ? REPEAT_MAX : command.type === 'left' || command.type === 'right' ? TURN_MAX : MOVEMENT_MAX}" /></label>`
      : '';
    const children = command.type === 'repeat'
      ? `<div class="command-children"><div class="command-row-label">Loop body</div>${renderCommandList(command.children || [], `${path}.children`)}</div>`
      : '';
    const addButtons = command.type === 'repeat'
      ? `<div class="command-actions">${renderCommandActions(path)}</div>`
      : '';
    const label = command.type === 'call' ? `${command.name}()` : command.type === 'penUp' ? 'Pen up' : command.type === 'penDown' ? 'Pen down' : command.type === 'repeat' ? 'Repeat' : command.type === 'forward' ? 'Forward' : command.type === 'back' ? 'Back' : command.type === 'left' ? 'Left' : command.type === 'right' ? 'Right' : command.type;
    const callArgs = command.type === 'call'
      ? `<div class="call-arg-list">${(command.args || []).map((param) => `<label class="command-value"><span>${escapeHtml(param)}</span><input type="number" inputmode="numeric" min="${REPEAT_MIN}" max="${REPEAT_MAX}" step="1" value="${command.paramValues?.[param] ?? REPEAT_MIN}" data-call-path="${path}" data-call-param="${escapeHtml(param)}" /></label>`).join('')}</div>`
      : '';

    return `
      <div class="command-block" data-command-block="${path}">
        <div class="command-header">
          <span class="command-name">${escapeHtml(label)}</span>
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
  if (!customCommands.length) return '<p class="custom-empty">No custom commands yet.</p>';
  return customCommands.map((command) => {
    const name = escapeHtml(command.name);
    const params = (command.params || []).map(escapeHtml).join(', ');
    return `<div class="custom-command-item">
      <span class="custom-command-name">${name}${command.params.length ? `(${params})` : '()'}</span>
      <div class="custom-command-actions"><button type="button" class="mini-button" data-use-custom="${name}">Use</button><button type="button" class="mini-button" data-edit-custom="${name}">Edit</button><button type="button" class="mini-button" data-delete-custom="${name}">Delete</button></div>
    </div>`;
  }).join('');
}

function renderToolbar() {
  return `<div class="turtle-toolbar"><div class="turtle-actions">
    <button class="primary-button" type="button" data-turtle-action="run">Run</button><button class="secondary-button" type="button" data-turtle-action="clear">Clear</button><button class="secondary-button" type="button" data-turtle-action="reset">Reset turtle</button>
  </div><label class="animation-speed-control"><span>Animation delay <strong data-animation-delay-value>${animationDelay} ms</strong></span><input type="range" min="0" max="200" step="10" value="${animationDelay}" data-animation-delay aria-label="Animation delay in milliseconds" /><small>0 ms = fastest</small></label></div>`;
}
function renderCanvasPanel() {
  return '<div class="turtle-canvas-panel"><canvas id="turtle-canvas" width="900" height="600" aria-label="Turtle drawing canvas"></canvas></div>';
}
function renderToolbox() {
  return `<div class="palette"><p class="section-label">Command toolbox</p><div class="tool-grid">${BUILT_IN_COMMANDS.map((button) => `<button type="button" class="tool-button" data-add-command="${escapeHtml(button.type)}">${escapeHtml(button.label)}</button>`).join('')}</div></div>`;
}
function renderProgramEditor() {
  return `<div class="program-panel"><p class="section-label">Program</p><div class="program-list">${renderCommandList(program)}</div>
    <div class="custom-editor"><div class="custom-panel-header"><p class="section-label">${editingCustomCommandName ? `Edit ${escapeHtml(editingCustomCommandName)}` : 'Save as custom command'}</p><button type="button" class="info-button" data-custom-help-toggle aria-label="Show binding help" aria-expanded="false">i</button></div>
      <div class="custom-help-panel" data-custom-help-panel><p><strong>Parameters</strong> are placeholders. <strong>Bindings</strong> connect each parameter to one or more values inside the saved program body.</p><p>Use JSONPath-style bindings. Example: <strong>size: $[0], $[2]; turn: $[1].children[0]</strong>.</p><p>To forward a parameter into a nested custom command, target its argument: <strong>size: $[0].children[0].paramValues.size</strong>.</p><p>Legacy dotted paths such as <strong>0.children.0</strong> are still supported for existing commands.</p></div>
      <div class="custom-form"><label class="field-group"><span>Name</span><input id="custom-name-input" type="text" value="${escapeHtml(customDraft.name)}" placeholder="square" /></label><label class="field-group"><span>Parameters</span><input id="custom-params-input" type="text" value="${escapeHtml(customDraft.params)}" placeholder="size, turn" /></label><label class="field-group"><span>Bindings</span><input id="custom-bindings-input" type="text" value="${escapeHtml(customDraft.bindings)}" placeholder="size: 0, 2; innerSize: 0.children.0.paramValues.size" /></label></div>
      <div class="custom-editor-actions"><button type="button" class="secondary-button full" data-save-custom-command>${editingCustomCommandName ? 'Update custom command' : 'Save as custom command'}</button>${editingCustomCommandName ? '<button type="button" class="secondary-button full" data-cancel-custom-edit>Cancel edit</button>' : ''}</div>
    </div></div>`;
}
function renderMyCommands() {
  return `<div class="custom-panel"><div class="custom-panel-header"><p class="section-label">My commands</p></div><div class="custom-command-list">${renderCustomCommands()}</div></div>`;
}
function render() {
  if (!view) return;
  view.innerHTML = `<div class="turtle-shell">${renderToolbar()}<div class="turtle-layout">${renderCanvasPanel()}<aside class="turtle-sidebar">${renderToolbox()}${renderProgramEditor()}${renderMyCommands()}</aside></div></div>`;
  renderBoard();
}

function updateAnimationDelay(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  animationDelay = clamp(numericValue, MIN_ANIMATION_DELAY, MAX_ANIMATION_DELAY);
  const valueLabel = view?.querySelector('[data-animation-delay-value]');
  if (valueLabel) valueLabel.textContent = `${animationDelay} ms`;
}

function handleAction(event) {
  const animationDelayInput = event.target.closest('[data-animation-delay]');
  if (animationDelayInput) {
    updateAnimationDelay(animationDelayInput.value);
    return;
  }

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

  const addCustomTrigger = event.target.closest('[data-add-custom]');
  if (addCustomTrigger) {
    appendCustomCommand(addCustomTrigger.dataset.addCustom, addCustomTrigger.dataset.commandParent || '');
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

  const cancelEditTrigger = event.target.closest('[data-cancel-custom-edit]');
  if (cancelEditTrigger) {
    cancelCustomCommandEdit();
    return;
  }

  const helpToggle = event.target.closest('[data-custom-help-toggle]');
  if (helpToggle) {
    const panel = view?.querySelector('[data-custom-help-panel]');
    if (!panel) return;
    const isOpen = panel.classList.toggle('is-open');
    helpToggle.setAttribute('aria-expanded', String(isOpen));
    return;
  }

  const useCustomTrigger = event.target.closest('[data-use-custom]');
  if (useCustomTrigger) {
    appendCustomCommand(useCustomTrigger.dataset.useCustom);
    return;
  }

  const editCustomTrigger = event.target.closest('[data-edit-custom]');
  if (editCustomTrigger) {
    editCustomCommand(editCustomTrigger.dataset.editCustom);
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
    return;
  }

  const draftInput = event.target.closest('#custom-name-input, #custom-params-input, #custom-bindings-input');
  if (draftInput) {
    customDraft = {
      name: view.querySelector('#custom-name-input')?.value || '',
      params: view.querySelector('#custom-params-input')?.value || '',
      bindings: view.querySelector('#custom-bindings-input')?.value || ''
    };
  }
}

export function initTurtleGame(section) {
  view = section.querySelector('.turtle-view');
  const lifecycle = createLifecycle();
  lifecycle.on(view, 'click', handleAction);
  lifecycle.on(view, 'input', handleAction);

  return {
    render(nextMode = 'draw') {
      setProgramFromMode(nextMode);
    },
    destroy() {
      activeRunId += 1;
      isRunning = false;
      lifecycle.dispose();
      view.innerHTML = '';
    }
  };
}
