import { containsConflictMarkers, renderConflictResolutionPanel } from './conflict-resolution-panel.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const state = {
  workingTree: {
    'config.txt': '<<<<<<< HEAD\\ncurrent\\n=======\\nincoming\\n>>>>>>> incoming\\n',
    'src/app.js': '<<<<<<< HEAD\\nours\\n=======\\ntheirs\\n>>>>>>> incoming\\n'
  },
  conflicts: [
    { file: 'config.txt', base: 'base config', ours: 'current config', theirs: 'incoming config' },
    { file: 'src/app.js', base: null, ours: null, theirs: 'new file content' }
  ]
};
const html = renderConflictResolutionPanel(state, { 'config.txt': 'resolved config' }, 'config.txt');
assert(html.includes('Left · Current (ours)'), 'panel must identify the current-side pane');
assert(html.includes('Right · Incoming (theirs)'), 'panel must identify the incoming-side pane');
assert(html.includes('Final · Resolved content'), 'panel must provide the editable final pane');
assert(html.includes('current config') && html.includes('incoming config'), 'both conflicting values must be shown');
assert(html.includes('resolved config'), 'final pane must preserve the selected draft');
assert(html.includes('src/app.js'), 'file selector must expose multiple conflicts');
assert(html.includes('(file absent on this side)'), 'deleted-side values must be identified explicitly');
assert(html.includes('Show common base version'), 'base value should be available as supplementary context');

const unsafe = renderConflictResolutionPanel({
  conflicts: [{ file: '<img src=x onerror=alert(1)>', ours: '<script>', theirs: 'incoming', base: null }]
});
assert(!unsafe.includes('<script>'), 'conflict contents must be HTML escaped');
assert(unsafe.includes('&lt;script&gt;'), 'conflict contents must be displayed as plain text');
assert(!unsafe.includes('<img src=x onerror=alert(1)>'), 'file names must be HTML escaped');
assert(containsConflictMarkers('<<<<<<< HEAD\\nours\\n=======\\ntheirs\\n>>>>>>> incoming'));
assert(!containsConflictMarkers('resolved safely'));

const applied = renderConflictResolutionPanel(
  { conflicts: [{ file: 'a.txt', ours: 'ours', theirs: 'theirs', base: 'base' }] },
  { 'a.txt': 'resolved' },
  'a.txt',
  { 'a.txt': { content: 'resolved', deleteFile: false } }
);
assert(applied.includes('Stage resolved file'), 'applied resolutions should offer staging');
assert(!applied.match(/data-conflict-action="stage" disabled/), 'clean applied resolution should be stageable');

console.log('Git conflict resolution panel tests passed.');
