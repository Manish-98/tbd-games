import {
  createGitEngine,
  validateCommand
} from './engine.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertValid(result, message) {
  assert(result.ok, message);
}

function assertInvalid(result, code, message) {
  assert(!result.valid, message);
  assert(result.error.code === code, `Expected ${code}, received ${result.error.code}`);
}

function sameSnapshot(left, right, message) {
  assert(
    JSON.stringify(left) === JSON.stringify(right),
    message
  );
}

export function runGitEngineTests() {
  const input = {
    seed: 'engine-test',
    reflog: [{
      id: 7,
      ref: 'refs/heads/recovered',
      oldValue: 'abc123',
      newValue: null,
      reason: 'branch deleted',
      timestamp: '2000-01-01T00:00:00.000Z'
    }],
    files: {
      'README.md': '# Test',
      'app.js': 'old'
    },
    workingTree: {
      'README.md': '# Test',
      'app.js': 'new',
      'feature.js': 'feature'
    }
  };

  const engine = createGitEngine(input);
  const initial = engine.inspect();
  const initialHead = initial.head.commit;

  assert(initial.branches.main === initialHead, 'main should point at HEAD');
  assert(
    initial.reflog[0].ref === 'refs/heads/recovered',
    'repository fixtures should preserve seeded reflog entries'
  );
  assertValid(
    engine.execute({
      type: 'branch',
      params: { name: 'recovered' }
    }),
    'branch creation should succeed after seeded reflog entries'
  );
  assert(
    engine.inspect().reflog.at(-1).id === 8,
    'new reflog entries must continue after seeded entry ids'
  );
  assert(
    initial.workingTree['app.js'] === 'new',
    'working tree should preserve the supplied fixture'
  );

  assertInvalid(
    validateCommand(initial, 'status'),
    'INVALID_COMMAND',
    'raw command strings must not cross the engine boundary'
  );

  assertInvalid(
    validateCommand(initial, {
      type: 'add',
      params: { file: 'missing.js' }
    }),
    'UNKNOWN_FILE',
    'unknown files must fail validation'
  );

  assertInvalid(
    validateCommand(initial, {
      type: 'branch',
      params: { name: 'main', delete: true }
    }),
    'DELETE_CURRENT_BRANCH',
    'the current branch must not be deletable'
  );

  assertValid(
    engine.execute({
      type: 'add',
      params: { file: 'app.js' }
    }),
    'add should stage a file'
  );

  const commitResult = engine.execute({
    type: 'commit',
    params: { message: 'Update app' }
  });
  assertValid(commitResult, 'commit should succeed');
  assert(
    engine.inspect().branches.main === commitResult.data.commit.id,
    'main should move to the new commit'
  );

  assertValid(
    engine.execute({
      type: 'add',
      params: { file: 'feature.js' }
    }),
    'new files should be stageable'
  );

  const featureCommit = engine.execute({
    type: 'commit',
    params: { message: 'Add feature' }
  });
  assertValid(featureCommit, 'feature commit should succeed');

  assertValid(
    engine.execute({
      type: 'branch',
      params: { name: 'feature' }
    }),
    'branch creation should succeed'
  );
  assertValid(
    engine.execute({
      type: 'switch',
      params: { branch: 'feature' }
    }),
    'switch should succeed'
  );

  assertValid(
    engine.execute({
      type: 'switch',
      params: { branch: 'main' }
    }),
    'switch back to main should succeed'
  );

  const cherryPick = engine.execute({
    type: 'cherry-pick',
    params: { commit: featureCommit.data.commit.id }
  });
  assertValid(cherryPick, 'cherry-pick should create a new commit');
  assert(
    cherryPick.data.commit.id !== featureCommit.data.commit.id,
    'cherry-pick should create a distinct commit'
  );

  const statusResult = engine.execute({ type: 'status', params: {} });
  assert(
    statusResult.ok && statusResult.data.clean,
    'status should report a clean tree'
  );

  const resetResult = engine.execute({
    type: 'reset',
    params: { commit: initialHead, mode: 'mixed' }
  });
  assertValid(resetResult, 'reset should succeed');

  const resetState = engine.inspect();
  assert(
    resetState.head.commit === initialHead,
    'reset should restore the initial repository HEAD'
  );

  assertValid(
    engine.execute({
      type: 'add',
      params: { file: 'app.js' }
    }),
    'add should work after a mixed reset'
  );

  const postResetCommit = engine.execute({
    type: 'commit',
    params: { message: 'Update app' }
  });
  assertValid(postResetCommit, 'commit should work after reset');
  assert(
    postResetCommit.data.commit.id === commitResult.data.commit.id,
    'reset should restore deterministic commit sequencing'
  );

  // A commit records the staged snapshot but must preserve later working-tree edits.
  const postStageEditEngine = createGitEngine({
    seed: 'commit-post-stage-edit',
    files: { 'note.txt': 'original' }
  });
  assertValid(
    postStageEditEngine.execute({ type: 'resolve', params: { file: 'note.txt', content: 'staged' } }),
    'test fixture should accept edited working-tree content'
  );
  assertValid(
    postStageEditEngine.execute({ type: 'add', params: { file: 'note.txt' } }),
    'edited file should stage successfully'
  );
  assertValid(
    postStageEditEngine.execute({ type: 'resolve', params: { file: 'note.txt', content: 'newer unstaged edit' } }),
    'post-staging edit should succeed'
  );
  const postStageCommit = postStageEditEngine.execute({
    type: 'commit',
    params: { message: 'Commit staged note' }
  });
  assertValid(postStageCommit, 'commit should succeed with a post-staging edit');
  const postStageState = postStageEditEngine.inspect();
  assert(
    postStageCommit.data.commit.tree['note.txt'] === 'staged',
    'commit tree should contain the content captured when the file was staged'
  );
  assert(
    postStageState.workingTree['note.txt'] === 'newer unstaged edit',
    'working tree should retain content edited after staging'
  );
  assert(
    postStageEditEngine.execute({ type: 'status', params: {} }).data.clean === false,
    'a post-staging edit should remain visible as a working-tree change'
  );

  // A staged deletion followed by recreation must retain the recreated file.
  const recreatedFileEngine = createGitEngine({
    seed: 'commit-recreated-staged-deletion',
    files: { 'note.txt': 'original' }
  });
  assertValid(
    recreatedFileEngine.execute({ type: 'restore', params: { file: 'note.txt', staged: true } }),
    'staged deletion fixture should succeed'
  );
  const deleteStageState = recreatedFileEngine.inspect();
  assert(
    deleteStageState.staging['note.txt'] === null,
    'staged deletion should be represented by a null index entry'
  );
  assertValid(
    recreatedFileEngine.execute({ type: 'resolve', params: { file: 'note.txt', content: 'recreated after staging deletion' } }),
    'recreating the staged-deleted file should succeed'
  );
  const recreatedCommit = recreatedFileEngine.execute({
    type: 'commit',
    params: { message: 'Delete staged note' }
  });
  assertValid(recreatedCommit, 'staged deletion should commit');
  const recreatedState = recreatedFileEngine.inspect();
  assert(
    !Object.prototype.hasOwnProperty.call(recreatedCommit.data.commit.tree, 'note.txt'),
    'commit tree should reflect the staged deletion'
  );
  assert(
    recreatedState.workingTree['note.txt'] === 'recreated after staging deletion',
    'file recreated after staging deletion should survive as an unstaged addition'
  );
  assert(
    recreatedFileEngine.execute({ type: 'status', params: {} }).data.clean === false,
    'a recreated file should remain visible as a working-tree change'
  );

  const first = createGitEngine(input).inspect();
  const second = createGitEngine(input).inspect();
  sameSnapshot(
    first,
    second,
    'identical repository inputs should produce identical snapshots'
  );


  const conflictEngine = createGitEngine({
    seed: 'merge-conflict-lifecycle',
    files: {
      'README.md': 'base',
      'shared.txt': 'base'
    },
    commits: [
      { id: 'base', message: 'Base', parents: [], tree: {
        'README.md': 'base',
        'shared.txt': 'base'
      } },
      { id: 'ours', message: 'Current-side change', parents: ['base'], tree: {
        'README.md': 'current-side',
        'shared.txt': 'base'
      } },
      { id: 'theirs', message: 'Incoming change', parents: ['base'], tree: {
        'README.md': 'incoming-side',
        'shared.txt': 'clean incoming change'
      } }
    ],
    branches: { main: 'ours', feature: 'theirs' },
    headBranch: 'main'
  });
  const mergeConflict = conflictEngine.execute({
    type: 'merge',
    params: { branch: 'feature' }
  });
  assert(!mergeConflict.ok, 'conflicting merge should stop for manual resolution');
  assert(
    mergeConflict.error.code === 'MERGE_CONFLICT',
    'conflicting merge should return MERGE_CONFLICT'
  );
  let conflictState = conflictEngine.inspect();
  assert(
    conflictState.mergeInProgress?.ours === 'ours' &&
      conflictState.mergeInProgress?.theirs === 'theirs',
    'conflict state must preserve both merge parents'
  );
  assert(
    conflictState.staging['shared.txt'] === 'clean incoming change',
    'non-conflicting merge changes should remain staged'
  );
  assert(
    conflictState.conflicts.some(conflict => conflict.file === 'README.md'),
    'the conflicted file should remain unresolved'
  );

  const prematureCommit = conflictEngine.execute({
    type: 'commit',
    params: { message: 'Premature merge commit' }
  });
  assert(
    !prematureCommit.valid &&
      prematureCommit.error.code === 'UNRESOLVED_CONFLICTS',
    'commit must be blocked while conflicts remain unresolved'
  );

  const markerResolution = conflictEngine.execute({
    type: 'resolve',
    params: {
      file: 'README.md',
      content: '<<<<<<< HEAD\\ncurrent-side\\n=======\\nincoming-side\\n>>>>>>> incoming'
    }
  });
  assertValid(markerResolution, 'conflicted file content should be editable');
  assertValid(
    conflictEngine.execute({ type: 'add', params: { file: 'README.md' } }),
    'a file containing conflict markers should still be stageable'
  );
  assert(
    conflictEngine.inspect().conflicts.length === 1,
    'staging conflict markers must not mark the file resolved'
  );

  assertValid(
    conflictEngine.execute({
      type: 'resolve',
      params: { file: 'README.md', content: 'combined resolution' }
    }),
    'resolved file content should be accepted'
  );
  assertValid(
    conflictEngine.execute({ type: 'add', params: { file: 'README.md' } }),
    'resolved file should be stageable'
  );
  conflictState = conflictEngine.inspect();
  assert(conflictState.conflicts.length === 0, 'staging marker-free content should clear the conflict');
  assert(conflictState.mergeInProgress, 'merge metadata must remain until the merge commit succeeds');

  const mergeCommit = conflictEngine.execute({
    type: 'commit',
    params: { message: 'Complete merge' }
  });
  assertValid(mergeCommit, 'merge commit should succeed after all conflicts are resolved');
  assert(
    JSON.stringify(mergeCommit.data.commit.parents) === JSON.stringify(['ours', 'theirs']),
    'merge commit must preserve both parent commits in order'
  );
  assert(
    mergeCommit.data.commit.tree['README.md'] === 'combined resolution' &&
      mergeCommit.data.commit.tree['shared.txt'] === 'clean incoming change',
    'merge commit should preserve resolved and non-conflicting changes'
  );
  conflictState = conflictEngine.inspect();
  assert(conflictState.mergeInProgress === null, 'successful merge commit should clear merge metadata');
  assert(conflictState.conflicts.length === 0, 'successful merge commit should clear conflicts');
  assert(conflictEngine.execute({ type: 'status', params: {} }).data.clean, 'completed merge should leave a clean tree');

  conflictEngine.reset();
  assert(
    conflictEngine.inspect().mergeInProgress === null,
    'repository reset should clear merge-in-progress state'
  );

  return true;
}
