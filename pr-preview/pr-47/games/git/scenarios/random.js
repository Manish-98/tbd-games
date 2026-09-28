const UINT32_MAX = 0x100000000;

export function createRandom(seed) {
  let state = hashSeed(seed);

  return Object.freeze({
    next,
    int,
    pick,
    boolean
  });

  function next() {
    state += 0x6D2B79F5;
    let value = state;

    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);

    return ((value ^ value >>> 14) >>> 0) / UINT32_MAX;
  }

  function int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError('Random integer bounds must be ordered integers.');
    }

    return Math.floor(next() * (max - min + 1)) + min;
  }

  function pick(values) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new RangeError('Cannot pick from an empty collection.');
    }

    return values[int(0, values.length - 1)];
  }

  function boolean(probability = 0.5) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError('Boolean probability must be between 0 and 1.');
    }

    return next() < probability;
  }
}

function hashSeed(seed) {
  const value = String(seed ?? '');
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
