const gateTypes = {
  AND: { inputs: 2, symbol: '&', label: 'AND' },
  OR: { inputs: 2, symbol: '>=1', label: 'OR' },
  NOT: { inputs: 1, symbol: '!', label: 'NOT' },
  XOR: { inputs: 2, symbol: '=1', label: 'XOR' },
  NAND: { inputs: 2, symbol: 'N&', label: 'NAND' },
  NOR: { inputs: 2, symbol: 'N>=1', label: 'NOR' }
};

let view;
let mode = 'lab';
let inputCount = 3;
let outputCount = 2;
let nodes = [];
let wires = [];
let nextGateId = 0;
let selectedPort = null;
let challenge;

const inputId = (index) => `input-${index}`;
const outputId = (index) => `output-${index}`;
const gateId = () => `gate-${nextGateId++}`;

function makeNodes() {
  nodes = [
    ...Array.from({ length: inputCount }, (_, index) => ({ id: inputId(index), kind: 'input', index, value: false })),
    ...Array.from({ length: outputCount }, (_, index) => ({ id: outputId(index), kind: 'output', index })),
    { id: gateId(), kind: 'gate', type: 'AND' },
    { id: gateId(), kind: 'gate', type: 'NOT' }
  ];
  wires = [];
  selectedPort = null;
}

function getNode(id) { return nodes.find((node) => node.id === id); }
function sourcePort(node) { return { node: node.id, port: 'out' }; }
function targetPort(node, index) { return { node: node.id, port: `in-${index}` }; }
function samePort(first, second) { return Boolean(first && second) && first.node === second.node && first.port === second.port; }

function removeWireAt(target) {
  wires = wires.filter((wire) => !samePort(wire.to, target));
}

function hasPath(startNode, targetNode, visited = new Set()) {
  if (startNode === targetNode) return true;
  if (visited.has(startNode)) return false;
  visited.add(startNode);
  return wires.filter((wire) => wire.from.node === startNode).some((wire) => hasPath(wire.to.node, targetNode, visited));
}

function connect(source, target) {
  if (source.node === target.node || source.port !== 'out' || target.port === 'out') return;
  const replacedWires = wires.filter((wire) => samePort(wire.to, target));
  removeWireAt(target);
  if (hasPath(target.node, source.node)) {
    wires.push(...replacedWires);
    return;
  }
  wires.push({ from: source, to: target });
}

function addGate(type) {
  nodes.push({ id: gateId(), kind: 'gate', type });
  render();
}

function valueAt(port, inputs, stack = new Set()) {
  const node = getNode(port.node);
  if (!node || stack.has(node.id)) return null;
  if (node.kind === 'input') return inputs[node.index] ?? node.value;
  if (node.kind === 'output') {
    const wire = wires.find((item) => samePort(item.to, port));
    return wire ? valueAt(wire.from, inputs, stack) : null;
  }
  const nextStack = new Set(stack).add(node.id);
  const values = Array.from({ length: gateTypes[node.type].inputs }, (_, index) => {
    const wire = wires.find((item) => item.to.node === node.id && item.to.port === `in-${index}`);
    return wire ? valueAt(wire.from, inputs, nextStack) : null;
  });
  if (values.some((value) => value === null)) return null;
  if (node.type === 'NOT') return !values[0];
  if (node.type === 'AND') return values.every(Boolean);
  if (node.type === 'OR') return values.some(Boolean);
  if (node.type === 'XOR') return values.filter(Boolean).length === 1;
  if (node.type === 'NAND') return !values.every(Boolean);
  return !values.some(Boolean);
}

function circuitOutputs(inputs = nodes.filter((node) => node.kind === 'input').map((node) => node.value)) {
  return nodes.filter((node) => node.kind === 'output').map((node) => valueAt({ node: node.id, port: 'in-0' }, inputs));
}

function positionStyle(node) {
  if (node.kind === 'input') return `--row:${node.index}; --column:1;`;
  if (node.kind === 'output') return `--row:${node.index}; --column:4;`;
  const gates = nodes.filter((item) => item.kind === 'gate');
  return `--row:${gates.indexOf(node) + 1}; --column:2;`;
}

function portMarkup(node) {
  if (node.kind === 'input') return '<button class="port output-port" data-port-node="' + node.id + '" data-port="out" aria-label="Output from input"> </button>';
  if (node.kind === 'output') return '<button class="port input-port" data-port-node="' + node.id + '" data-port="in-0" aria-label="Input to output"> </button>';
  const count = gateTypes[node.type].inputs;
  return `<div class="gate-inputs">${Array.from({ length: count }, (_, index) => `<button class="port input-port" data-port-node="${node.id}" data-port="in-${index}" aria-label="Input ${index + 1} to ${node.type}"></button>`).join('')}</div><button class="port output-port" data-port-node="${node.id}" data-port="out" aria-label="Output from ${node.type}"></button>`;
}

function nodeMarkup(node, inputValues, outputValues) {
  if (node.kind === 'input') return `<article class="circuit-node input-node ${inputValues[node.index] ? 'on' : ''}" style="${positionStyle(node)}"><div class="node-heading"><span class="node-kicker">Input ${node.index + 1}</span><strong>${inputValues[node.index] ? 'ON' : 'OFF'}</strong></div><button class="switch" type="button" data-toggle-input="${node.index}" aria-pressed="${inputValues[node.index]}"><span></span></button>${portMarkup(node)}</article>`;
  if (node.kind === 'output') { const value = outputValues[node.index]; return `<article class="circuit-node output-node ${value === true ? 'on' : ''}" style="${positionStyle(node)}"><div class="bulb" aria-hidden="true"></div><div class="node-heading"><span class="node-kicker">Output ${node.index + 1}</span><strong>${value === true ? 'LIT' : value === false ? 'DARK' : 'UNKNOWN'}</strong></div>${portMarkup(node)}</article>`; }
  return `<article class="circuit-node gate-node" style="${positionStyle(node)}"><span class="gate-label">${node.type}</span><strong class="gate-symbol">${gateTypes[node.type].symbol}</strong>${portMarkup(node)}<button class="remove-gate" type="button" data-remove-gate="${node.id}" aria-label="Remove ${node.type} gate">x</button></article>`;
}

function truthRows() {
  return Array.from({ length: 2 ** inputCount }, (_, value) => {
    const inputs = Array.from({ length: inputCount }, (_, index) => Boolean(value & (1 << (inputCount - index - 1))));
    return { inputs, outputs: challenge.outputs[value] };
  });
}

function renderTruthTable() {
  if (!challenge) return '';
  const headers = [...Array.from({ length: inputCount }, (_, index) => `I${index + 1}`), ...Array.from({ length: outputCount }, (_, index) => `O${index + 1}`)];
  return `<div class="truth-table-wrap"><table class="truth-table"><caption>Target behavior</caption><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${truthRows().map((row) => `<tr data-truth-row="${row.inputs.map(Number).join('')}">${row.inputs.map((value) => `<td><span class="truth-bit ${value ? 'high' : ''}">${Number(value)}</span></td>`).join('')}${row.outputs.map((value) => `<td><span class="truth-bit target-bit ${value ? 'high' : ''}">${Number(value)}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function generateChallenge() {
  challenge = { outputs: Array.from({ length: 2 ** inputCount }, () => Array.from({ length: outputCount }, () => Math.random() > 0.5)) };
}

function drawWires() {
  const svg = view.querySelector('.wire-layer');
  if (!svg) return;
  const board = view.querySelector('.circuit-board').getBoundingClientRect();
  svg.innerHTML = wires.map((wire) => {
    const from = view.querySelector(`[data-port-node="${wire.from.node}"][data-port="${wire.from.port}"]`).getBoundingClientRect();
    const to = view.querySelector(`[data-port-node="${wire.to.node}"][data-port="${wire.to.port}"]`).getBoundingClientRect();
    const x1 = from.left + from.width / 2 - board.left;
    const y1 = from.top + from.height / 2 - board.top;
    const x2 = to.left + to.width / 2 - board.left;
    const y2 = to.top + to.height / 2 - board.top;
    const middle = x1 + (x2 - x1) / 2;
    return `<path class="wire" d="M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}" />`;
  }).join('');
}

function updateTruthResults() {
  if (mode !== 'detective' || !challenge) return;
  let passed = 0;
  truthRows().forEach((row) => {
    const actual = circuitOutputs(row.inputs);
    const match = actual.every((value, index) => value === row.outputs[index]);
    if (match) passed += 1;
    const tableRow = view.querySelector(`[data-truth-row="${row.inputs.map(Number).join('')}"]`);
    if (tableRow) tableRow.classList.toggle('passed', match);
  });
  const status = view.querySelector('.detective-status');
  const solved = passed === 2 ** inputCount;
  if (status) { status.textContent = solved ? 'Solved. Every row matches.' : `${passed} of ${2 ** inputCount} rows match`; status.classList.toggle('solved', solved); }
}

function render() {
  const values = nodes.filter((node) => node.kind === 'input').map((node) => node.value);
  const gates = Object.keys(gateTypes).map((type) => `<button class="gate-tool" type="button" data-add-gate="${type}"><strong>${gateTypes[type].symbol}</strong><span>${type}</span></button>`).join('');
  const outputValues = circuitOutputs(values);
  view.innerHTML = `<div class="logic-controls"><div class="control-group"><span class="control-label">Inputs</span><div class="stepper"><button type="button" data-count="inputs" data-step="-1" aria-label="Fewer inputs">-</button><strong>${inputCount}</strong><button type="button" data-count="inputs" data-step="1" aria-label="More inputs">+</button></div></div><div class="control-group"><span class="control-label">Outputs</span><div class="stepper"><button type="button" data-count="outputs" data-step="-1" aria-label="Fewer outputs">-</button><strong>${outputCount}</strong><button type="button" data-count="outputs" data-step="1" aria-label="More outputs">+</button></div></div><button class="reset-button" type="button" data-reset>Reset circuit</button></div><div class="logic-intro"><div><p class="section-label">${mode === 'lab' ? 'Freeform sandbox' : 'Unknown circuit'}</p><p>${mode === 'lab' ? 'Toggle a switch, choose a gate, and connect the dots. Click an output port, then an input port. Click a connected input port to disconnect it.' : 'Build any circuit that produces the target signals. Green rows pass when you check the circuit.'}</p></div><div class="gate-palette" aria-label="Logic gates">${gates}</div></div><div class="circuit-board"><svg class="wire-layer" aria-hidden="true"></svg><div class="node-grid">${nodes.map((node) => nodeMarkup(node, values, outputValues)).join('')}</div></div>${mode === 'detective' ? `<div class="detective-footer"><div><span class="section-label">Truth table</span><p class="detective-status">Press check to test all ${2 ** inputCount} rows</p></div><button class="primary-button" type="button" data-check>Check circuit</button></div>${renderTruthTable()}` : `<div class="lab-readout"><span class="section-label">Live readout</span><p>${outputValues.map((value, index) => `Output ${index + 1} is <strong>${value === true ? 'high' : value === false ? 'low' : 'unknown'}</strong>`).join(' / ')}</p></div>`}`;
  drawWires();
}

function handleClick(event) {
  const add = event.target.closest('[data-add-gate]');
  if (add) return addGate(add.dataset.addGate);
  const toggle = event.target.closest('[data-toggle-input]');
  if (toggle) { getNode(inputId(Number(toggle.dataset.toggleInput))).value = !getNode(inputId(Number(toggle.dataset.toggleInput))).value; return render(); }
  const port = event.target.closest('[data-port-node]');
  if (port) {
    const clicked = { node: port.dataset.portNode, port: port.dataset.port };
    if (clicked.port === 'out') selectedPort = samePort(selectedPort, clicked) ? null : clicked;
    else if (selectedPort) { connect(selectedPort, clicked); selectedPort = null; }
    else removeWireAt(clicked);
    render();
    return;
  }
  const remove = event.target.closest('[data-remove-gate]');
  if (remove) { nodes = nodes.filter((node) => node.id !== remove.dataset.removeGate); wires = wires.filter((wire) => wire.from.node !== remove.dataset.removeGate && wire.to.node !== remove.dataset.removeGate); return render(); }
  const count = event.target.closest('[data-count]');
  if (count) {
    const key = count.dataset.count;
    const next = (key === 'inputs' ? inputCount : outputCount) + Number(count.dataset.step);
    if (next < 1 || next > 4) return;
    if (key === 'inputs') inputCount = next; else outputCount = next;
    makeNodes();
    if (mode === 'detective') generateChallenge();
    return render();
  }
  if (event.target.closest('[data-reset]')) { makeNodes(); if (mode === 'detective') generateChallenge(); return render(); }
  if (event.target.closest('[data-check]')) updateTruthResults();
}

export function initLogicGame(logicView) {
  view = logicView;
  makeNodes();
  let active = false;
  const activate = () => { if (!active) { view.addEventListener('click', handleClick); window.addEventListener('resize', drawWires); active = true; } };
  const deactivate = () => { if (active) { view.removeEventListener('click', handleClick); window.removeEventListener('resize', drawWires); active = false; } };
  activate();
  return {
    render(nextMode = 'lab') { activate(); mode = nextMode; if (mode === 'detective') generateChallenge(); makeNodes(); render(); },
    destroy() { deactivate(); view.innerHTML = ''; }
  };
}
