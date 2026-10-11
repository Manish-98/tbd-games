import { DEFAULTS } from './constants.js';

export function createClock(startTime = DEFAULTS.startTime) {
  const start = Date.parse(startTime);

  if (Number.isNaN(start)) {
    throw new Error('Clock start time must be a valid ISO timestamp.');
  }

  let sequence = 0;

  return {
    now() {
      const timestamp = new Date(start + sequence).toISOString();
      sequence += 1;
      return timestamp;
    },
    snapshot() {
      return sequence;
    },
    restore(sequenceValue) {
      sequence = sequenceValue;
    }
  };
}
