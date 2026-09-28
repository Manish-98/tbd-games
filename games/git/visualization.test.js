import { createGitEngine } from './engine.js';
import { renderGitVisualization } from './visualization.js';

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
testDetachedHeadAndInspectionData();
testValidation();

console.log('Git visualization tests passed.');
