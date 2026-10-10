export const gateTypes = {
  AND: { inputs: 2, symbol: '&', label: 'AND', meaning: 'all on' },
  OR: { inputs: 2, symbol: '>=1', label: 'OR', meaning: 'any on' },
  NOT: { inputs: 1, symbol: '!', label: 'NOT', meaning: 'flips' },
  XOR: { inputs: 2, symbol: '=1', label: 'XOR', meaning: 'one on' },
  NAND: { inputs: 2, symbol: 'N&', label: 'NAND', meaning: 'not all' },
  NOR: { inputs: 2, symbol: 'N>=1', label: 'NOR', meaning: 'none on' }
};

export function hasCircuitPath(startNode, targetNode, wires, visited = new Set()) {
  if (startNode === targetNode) return true;
  if (visited.has(startNode)) return false;
  visited.add(startNode);
  return wires.filter((wire) => wire.from.node === startNode).some((wire) => hasCircuitPath(wire.to.node, targetNode, wires, visited));
}

export function canConnect(source, target, wires) {
  if (!source || !target || source.node === target.node || source.port !== 'out' || target.port === 'out') return false;
  return !hasCircuitPath(target.node, source.node, wires);
}

export function evaluateCircuit(nodes, wires, inputs = nodes.filter((node) => node.kind === 'input').map((node) => node.value)) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const valueAt = (port, stack = new Set()) => {
    const node = nodeMap.get(port.node);
    if (!node || stack.has(node.id)) return null;
    if (node.kind === 'input') return inputs[node.index] ?? node.value;
    const nextStack = new Set(stack).add(node.id);
    if (node.kind === 'output') {
      const wire = wires.find((item) => item.to.node === node.id && item.to.port === port.port);
      return wire ? valueAt(wire.from, nextStack) : null;
    }
    const values = Array.from({ length: gateTypes[node.type].inputs }, (_, index) => {
      const wire = wires.find((item) => item.to.node === node.id && item.to.port === `in-${index}`);
      return wire ? valueAt(wire.from, nextStack) : null;
    });
    if (values.some((value) => value === null)) return null;
    if (node.type === 'NOT') return !values[0];
    if (node.type === 'AND') return values.every(Boolean);
    if (node.type === 'OR') return values.some(Boolean);
    if (node.type === 'XOR') return values.filter(Boolean).length === 1;
    if (node.type === 'NAND') return !values.every(Boolean);
    return !values.some(Boolean);
  };
  return nodes.filter((node) => node.kind === 'output').map((node) => valueAt({ node: node.id, port: 'in-0' }));
}

export function evaluateTruthTable(nodes, wires, rows) {
  return rows.map((row) => ({ ...row, outputs: evaluateCircuit(nodes, wires, row.inputs) }));
}
