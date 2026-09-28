import { createGitEngine } from './engine.js';
import { createGitVisualization, renderGitVisualization } from './visualization.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testInitialRender() {
  const repository = createGitEngine({
    seed: 'visualization-test',
    history: [
      { 'feature.js': 'ready' },
      { 'feature.js': 'fixed' }
    ]
  });
  const html = renderGitVisualization(repository.snapshot());

  assert(html.includes('Repository map'), 'Visualization should render a repository heading.');
  assert(html.includes('feature.js'), 'Visualization should expose changed files.');
  assert(html.includes('References'), 'Visualization should render refs.');
  assert(html.includes('Working tree'), 'Visualization should render working-tree state.');
  assert(html.includes('data-inspect-kind="commit"'), 'Commits should be inspectable.');
  assert(html.includes('tabindex="0"'), 'Graph inspection targets should be keyboard focusable.');
}

function testTransitionHighlight() {
  const repository = createGitEngine();
  const before = repository.snapshot();
  const mainCommit = before.head.commit;
  repository.execute({ type: 'branch', params: { name: 'feature', startPoint: mainCommit } });
  const after = repository.snapshot();
  const html = renderGitVisualization(after, before, {
    type: 'branch',
    command: { type: 'branch' }
  });

  assert(html.includes('branch · 1 visual changes'), 'Transition label should count visual changes.');
  assert(html.includes('git-visualization-changed'), 'Changed refs should receive visual emphasis.');
}

function testRemoteStateAndDeletedRefs() {
  const repository = createGitEngine({
    remotes: { origin: 'https://example.test/repo.git' }
  });
  const before = repository.snapshot();
  const after = repository.snapshot();
  after.remotes.origin.branches.main = after.head.commit;
  after.remotes.origin.commits[after.head.commit] = after.commits[after.head.commit];
  after.branches.feature = after.head.commit;
  const remoteHtml = renderGitVisualization(after, before, {
    type: 'push',
    command: { type: 'push' }
  });

  assert(remoteHtml.includes('Remote state'), 'Remote repository state should be visible.');
  assert(remoteHtml.includes('data-inspect-kind="remote-branch"'), 'Remote branches should be inspectable.');
  assert(remoteHtml.includes('Remote commits'), 'Remote branch inspection should expose remote commit state.');
  assert(remoteHtml.includes('push · 2 visual changes'), 'Remote changes should contribute to transition emphasis.');

  const deletedBefore = repository.snapshot();
  const deletedAfter = repository.snapshot();
  deletedBefore.branches.feature = deletedAfter.head.commit;
  delete deletedAfter.branches.feature;
  const deletedHtml = renderGitVisualization(deletedAfter, deletedBefore, {
    type: 'branch-delete',
    command: { type: 'branch-delete' }
  });
  assert(deletedHtml.includes('branch-delete · 1 visual changes'), 'Deleted refs should remain part of transition accounting.');
}

function testWorkingStagingAndConflictTransitions() {
  const repository = createGitEngine();
  const before = repository.snapshot();
  const after = repository.snapshot();
  after.workingTree[Object.keys(after.workingTree)[0]] = 'changed';
  after.staging['staged.js'] = 'staged';
  after.conflicts = ['conflicted.js'];
  const html = renderGitVisualization(after, before, {
    type: 'restore',
    command: { type: 'restore' }
  });

  assert(html.includes('restore · 3 visual changes'), 'Working, staged, and conflict changes should be counted.');
  assert(html.includes('staged.js'), 'Staged files should remain visible after a transition.');
  assert(html.includes('conflicted.js'), 'Conflict files should remain visible after a transition.');
}

function testKeyboardInspection() {
  const listeners = new Map();
  const inspected = [];
  const container = {
    innerHTML: '',
    addEventListener(event, handler) { listeners.set(event, handler); },
    removeEventListener(event) { listeners.delete(event); },
    contains() { return true; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const visualization = createGitVisualization(container, {
    onInspect: payload => inspected.push(payload)
  });
  const state = createGitEngine().snapshot();
  visualization.render(state);

  let prevented = false;
  const target = {
    dataset: { inspectKind: 'commit', inspectId: state.head.commit },
    closest() { return target; }
  };
  listeners.get('keydown')({
    key: 'Enter',
    target,
    preventDefault() { prevented = true; }
  });

  assert(prevented, 'Enter should activate SVG inspection targets.');
  assert(inspected.length === 1, 'Keyboard activation should invoke inspection once.');
  assert(inspected[0].kind === 'commit', 'Keyboard inspection should identify the commit target.');
  visualization.destroy();
  assert(!listeners.has('keydown'), 'Destroy should remove keyboard listeners.');
}

function testDetachedHeadAndInspectionData() {
  const repository = createGitEngine({
    detachedHead: true,
    tags: { release: null }
  });
  const html = renderGitVisualization(repository.snapshot());

  assert(html.includes('HEAD (detached)'), 'Detached HEAD should be visible.');
  assert(html.includes('release'), 'Tags should be visible.');
  assert(html.includes('Author'), 'Commit inspection should expose author data.');
  assert(html.includes('Changed files'), 'Commit inspection should expose changed files.');
}

function testValidation() {
  let failed = false;
  try {
    renderGitVisualization({});
  } catch {
    failed = true;
  }
  assert(failed, 'Invalid repository state should be rejected.');
}

testInitialRender();
testTransitionHighlight();
testRemoteStateAndDeletedRefs();
testWorkingStagingAndConflictTransitions();
testKeyboardInspection();
testDetachedHeadAndInspectionData();
testValidation();

console.log('Git visualization tests passed.');
