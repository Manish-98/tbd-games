import { renderInspectionOutput } from './inspection-output.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const reflog = renderInspectionOutput('reflog', [{
  id: 1,
  ref: 'refs/heads/feature',
  oldValue: 'abc123',
  newValue: null,
  reason: 'branch deleted'
}]);

assert(reflog.includes('refs/heads/feature'), 'reflog output must show the moved reference');
assert(reflog.includes('abc123 -> null'), 'reflog output must show old and new values');
assert(reflog.includes('branch deleted'), 'reflog output must show the movement reason');
assert(reflog.includes('aria-label="Git command output"'), 'inspection output must be accessible');

const log = renderInspectionOutput('log', [{
  id: 'abc123',
  message: 'Initial commit'
}]);

assert(log.includes('"message": "Initial commit"'), 'generic inspection output must preserve structured command data');

const unsafe = renderInspectionOutput('show', {
  commit: {
    message: '<script>alert(1)</script>'
  }
});

assert(!unsafe.includes('<script>alert(1)</script>'), 'inspection output must escape command data before rendering');
assert(unsafe.includes('&lt;script&gt;'), 'inspection output must encode unsafe command data');

console.log('Git inspection output tests passed.');
