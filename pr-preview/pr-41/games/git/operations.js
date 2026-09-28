import { READ_OPERATIONS } from './operations/inspection.js';
import { WORKING_TREE_OPERATIONS } from './operations/working-tree.js';
import { REF_OPERATIONS } from './operations/refs.js';
import { HISTORY_OPERATIONS } from './operations/history.js';
import { REMOTE_OPERATIONS } from './operations/remotes.js';
import { STASH_OPERATIONS } from './operations/stash.js';

export const READ_OPERATIONS_REGISTRY = READ_OPERATIONS;
export const WRITE_OPERATIONS = Object.freeze({
  ...WORKING_TREE_OPERATIONS,
  ...REF_OPERATIONS,
  ...HISTORY_OPERATIONS,
  ...REMOTE_OPERATIONS,
  ...STASH_OPERATIONS
});

export function getOperation(type) {
  return READ_OPERATIONS_REGISTRY[type] || WRITE_OPERATIONS[type];
}
