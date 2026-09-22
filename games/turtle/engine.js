export const COMMANDS = {
  forward: { valueField: 'value', min: 1, max: 220 },
  back: { valueField: 'value', min: 1, max: 220 },
  left: { valueField: 'value', min: 1, max: 360 },
  right: { valueField: 'value', min: 1, max: 360 },
  penUp: {},
  penDown: {},
  repeat: { valueField: 'count', min: 1, max: 500 },
  call: {}
};

export function cloneProgram(commands) {
  return JSON.parse(JSON.stringify(commands));
}

export function createCommand(type) {
  const definition = COMMANDS[type];
  if (!definition) return null;
  return definition.valueField === 'count'
    ? { type, count: 1, children: [] }
    : definition.valueField
      ? { type, value: type === 'left' || type === 'right' ? 30 : 60 }
      : { type };
}

export function clampCommandValue(command, value) {
  const definition = COMMANDS[command.type];
  if (!definition?.valueField) return command;
  const numeric = Number(value);
  command[definition.valueField] = Math.min(Math.max(Number.isFinite(numeric) ? numeric : definition.min, definition.min), definition.max);
  return command;
}

export function moveTurtle(state, distance, bounds = { minX: 20, maxX: 880, minY: 20, maxY: 580 }) {
  const radians = (state.angle * Math.PI) / 180;
  const nextX = state.x + Math.cos(radians) * distance;
  const nextY = state.y + Math.sin(radians) * distance;
  return {
    turtle: { ...state, x: Math.min(Math.max(nextX, bounds.minX), bounds.maxX), y: Math.min(Math.max(nextY, bounds.minY), bounds.maxY) },
    stroke: state.penDown ? { x1: state.x, y1: state.y, x2: nextX, y2: nextY } : null
  };
}

export function turnTurtle(state, delta) {
  return { ...state, angle: (state.angle + delta + 360) % 360 };
}

export function* executeProgram(program, customCommands, initialState, options = {}) {
  const { maxDepth = 50, parameterMap = {}, bounds } = options;
  function* execute(commands, state, params, depth) {
    if (depth > maxDepth) return;
    for (const command of commands || []) {
      const definition = command.type === 'call' ? customCommands.find((entry) => entry.name.toLowerCase() === String(command.name).toLowerCase()) : null;
      if (command.type === 'call') {
        if (!definition) continue;
        const localParams = { ...params, ...(command.paramValues || {}) };
        for (const param of definition.params || []) if (!Object.prototype.hasOwnProperty.call(localParams, param)) localParams[param] = '0';
        const boundBody = applyBindings(definition.body || [], definition.bindings || {}, localParams);
        for (const step of execute(boundBody, state, localParams, depth + 1)) {
          state = step.state;
          yield step;
        }
        continue;
      }
      if (command.type === 'repeat') {
        for (let i = 0; i < Number(command.count) || 0; i += 1) {
          for (const step of execute(command.children || [], state, params, depth + 1)) {
            state = step.state;
            yield step;
          }
        }
        continue;
      }
      if (command.type === 'forward' || command.type === 'back') {
        const result = moveTurtle(state, (command.type === 'back' ? -1 : 1) * resolveValue(command.value, params), bounds);
        state = result.turtle;
        yield { state, stroke: result.stroke };
      } else if (command.type === 'left' || command.type === 'right') {
        state = turnTurtle(state, (command.type === 'left' ? -1 : 1) * resolveValue(command.value, params));
        yield { state, stroke: null };
      } else if (command.type === 'penUp' || command.type === 'penDown') {
        state = { ...state, penDown: command.type === 'penDown' };
        yield { state, stroke: null };
      }
    }
  }
  function* root() {
    yield* execute(program, initialState, parameterMap, 0);
  }
  yield* root();
}

function resolveValue(value, params) {
  const text = typeof value === 'string' ? value.trim() : value;
  if (typeof text === 'string' && Object.prototype.hasOwnProperty.call(params, text)) return Number(params[text]) || 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNodeAtPath(list, path) {
  let current = list;
  for (const part of String(path).split('.')) {
    if (part === '') continue;
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

function applyBindings(body, bindings, params) {
  const next = cloneProgram(body);
  for (const [name, paths] of Object.entries(bindings || {})) {
    for (const path of paths || []) {
      const node = getNodeAtPath(next, path);
      if (!node) continue;
      const definition = COMMANDS[node.type];
      if (!definition?.valueField) continue;
      clampCommandValue(node, params[name] ?? node[definition.valueField]);
    }
  }
  return next;
}
