import { createGitEngine } from './engine.js';
import { getInspectorDefaults, renderFileInspector } from './file-inspector.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repository = createGitEngine({
  seed: 'file-inspector-test',
  commits: [
    { id: 'base', message: 'Base', parents: [], tree: {
      'readme.txt': 'first line\nkeep this line', 'deleted.txt': 'remove me', 'unchanged.txt': 'same'
    } },
    { id: 'next', message: 'Update readme', parents: ['base'], tree: {
      'readme.txt': 'first line\nupdated line\nkeep this line', 'unchanged.txt': 'same', 'added.txt': 'new file'
    } }
  ],
  branches: { main: 'next' },
  headBranch: 'main',
  workingTree: { 'readme.txt': 'first line\nworking edit\nkeep this line', 'unchanged.txt': 'same', 'added.txt': 'new file', 'local.txt': 'local untracked file' },
  staging: { 'readme.txt': 'first line\nstaged edit\nkeep this line', 'deleted.txt': null }
});
const before = JSON.stringify(repository.snapshot());
const state = repository.snapshot();
const defaults = getInspectorDefaults(state);
assert(defaults.file === 'added.txt', 'default file should come from the sorted repository file list');
assert(defaults.from === 'HEAD' && defaults.to === 'WORKING', 'default comparison should be HEAD against working tree');

const working = renderFileInspector(state, { file: 'readme.txt', from: 'INDEX', to: 'WORKING' });
assert(working.includes('Compare from') && working.includes('Compare to'), 'both revision selectors should be available');
assert(working.includes('working edit') && working.includes('staged edit'), 'unstaged changes should compare against the index');
assert(working.includes('is-deleted') && working.includes('is-added'), 'diff should distinguish removed and added lines');
assert(working.includes('aria-label="Repository file and diff viewer"'), 'viewer should have an accessible region label');

const staged = renderFileInspector(state, { file: 'readme.txt', from: 'HEAD', to: 'INDEX' });
assert(staged.includes('staged edit'), 'index view should reflect staged content');
assert(staged.includes('is-deleted') && staged.includes('is-added'), 'staged differences should be visible');

const absent = renderFileInspector(state, { file: 'deleted.txt', from: 'HEAD', to: 'INDEX' });
assert(absent.includes('not present at the selected revision'), 'staged deletions should be shown as absent');
assert(absent.includes('deleted.txt'), 'selected file name should remain visible when absent');

const commits = renderFileInspector(state, { file: 'readme.txt', from: 'commit:base', to: 'commit:next' });
assert(commits.includes('Commit base') && commits.includes('Commit next'), 'commit comparisons should name both revisions');
assert(commits.includes('updated line'), 'commit diffs should display the selected revision contents');

assert(before === JSON.stringify(repository.snapshot()), 'inspection rendering must not mutate repository state');
const unsafe = renderFileInspector({ ...state, workingTree: { 'unsafe.txt': '<script>alert(1)</script>' }, staging: {} },
  { file: 'unsafe.txt', from: 'HEAD', to: 'WORKING' });
assert(unsafe.includes('&lt;script&gt;'), 'file contents must be escaped before rendering');
assert(!unsafe.includes('<script>alert(1)</script>'), 'file contents must not become executable HTML');

console.log('Git file inspector tests passed.');
