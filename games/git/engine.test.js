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

  const targetTipBeforePick = engine.inspect().head.commit;
  const cherryPick = engine.execute({
    type: 'cherry-pick',
    params: { commit: featureCommit.data.commit.id }
  });
  assertValid(cherryPick, 'cherry-pick should create a new commit');
  assert(
    cherryPick.data.commit.id !== featureCommit.data.commit.id,
    'cherry-pick should create a distinct commit'
  );
  assert(JSON.stringify(cherryPick.data.commit.parents) === JSON.stringify([targetTipBeforePick]), 'clean cherry-pick must have one parent: the prior target tip');
  assert(engine.inspect().cherryPickInProgress === null, 'clean cherry-pick must clear pending operation state');

  const cleanCherryPickEngine = createGitEngine({
    seed: 'cherry-pick-clean-application',
    commits: [
      { id: 'clean-base', message: 'Base', parents: [], tree: { 'app.txt': 'base', 'untouched.txt': 'keep' } },
      { id: 'clean-source', message: 'Add source change', parents: ['clean-base'], tree: { 'app.txt': 'incoming', 'untouched.txt': 'keep', 'new.txt': 'added' } }
    ],
    branches: { main: 'clean-base', feature: 'clean-source' },
    headBranch: 'main'
  });
  const cleanPickResult = cleanCherryPickEngine.execute({
    type: 'cherry-pick',
    params: { commit: 'clean-source' }
  });
  assertValid(cleanPickResult, 'clean cherry-pick should apply the source patch');
  assert(cleanPickResult.data.commit.tree['app.txt'] === 'incoming' && cleanPickResult.data.commit.tree['new.txt'] === 'added', 'clean cherry-pick must apply modifications and additions');
  assert(JSON.stringify(cleanPickResult.data.commit.parents) === JSON.stringify(['clean-base']), 'clean cherry-pick must have only the target tip as its parent');

  const dirtyCherryPickEngine = createGitEngine({
    seed: 'cherry-pick-dirty-state', files: { 'note.txt': 'base', 'local.txt': 'committed' },
    workingTree: { 'note.txt': 'base', 'local.txt': 'unstaged edit' },
    commits: [
      { id: 'dirty-base', message: 'Base', parents: [], tree: { 'note.txt': 'base', 'local.txt': 'committed' } },
      { id: 'dirty-source', message: 'Source', parents: ['dirty-base'], tree: { 'note.txt': 'incoming', 'local.txt': 'committed' } }
    ], branches: { main: 'dirty-base', feature: 'dirty-source' }, headBranch: 'main'
  });
  const dirtyBefore = dirtyCherryPickEngine.inspect();
  const dirtyResult = dirtyCherryPickEngine.execute({ type: 'cherry-pick', params: { commit: 'dirty-source' } });
  assert(!dirtyResult.valid && dirtyResult.error.code === 'DIRTY_WORKTREE', 'dirty worktree must reject cherry-pick before mutation');
  sameSnapshot(dirtyBefore, dirtyCherryPickEngine.inspect(), 'rejected cherry-pick must preserve existing unstaged changes');

  const cherryConflictEngine = createGitEngine({
    seed: 'cherry-pick-file-conflicts',
    commits: [
      { id: 'cp-base', message: 'Base', parents: [], tree: { 'modify.txt': 'base', 'delete.txt': 'base', 'remove.txt': 'base', 'keep.txt': 'base', 'clean-delete.txt': 'remove me' } },
      { id: 'cp-target', message: 'Target edits', parents: ['cp-base'], tree: { 'modify.txt': 'target edit', 'delete.txt': 'target edit', 'keep.txt': 'base', 'clean-delete.txt': 'remove me', 'both-added.txt': 'target added', 'target-only.txt': 'target' } },
      { id: 'cp-source', message: 'Incoming changes', parents: ['cp-base'], tree: { 'modify.txt': 'source edit', 'remove.txt': 'source recreates file', 'keep.txt': 'incoming clean change', 'added.txt': 'source addition', 'both-added.txt': 'source added' } }
    ], branches: { main: 'cp-target', feature: 'cp-source' }, headBranch: 'main'
  });
  const conflictsBefore = cherryConflictEngine.inspect();
  const conflictingPick = cherryConflictEngine.execute({ type: 'cherry-pick', params: { commit: 'cp-source' } });
  assert(!conflictingPick.ok && conflictingPick.error.code === 'CHERRY_PICK_CONFLICT', 'overlapping cherry-pick must pause with a conflict');
  let cherryState = cherryConflictEngine.inspect();
  assert(cherryState.head.commit === 'cp-target' && cherryState.branches.main === 'cp-target', 'conflicting cherry-pick must not move HEAD or refs');
  assert(Object.keys(cherryState.commits).length === Object.keys(conflictsBefore.commits).length, 'conflicting cherry-pick must not create a commit');
  assert(cherryState.cherryPickInProgress?.sourceCommit === 'cp-source', 'pending source commit must be inspectable');
  assert(cherryState.conflicts.map(conflict => conflict.file).sort().join(',') === 'both-added.txt,delete.txt,modify.txt,remove.txt', 'modify, delete-versus-modify, and modify-versus-delete conflicts must be detected');
  assert(cherryState.workingTree['keep.txt'] === 'incoming clean change' && cherryState.staging['keep.txt'] === 'incoming clean change', 'non-conflicting changes must stay applied and staged');
  assert(cherryState.workingTree['added.txt'] === 'source addition', 'non-conflicting additions must be retained');
  assert(cherryState.staging['clean-delete.txt'] === null, 'non-conflicting deletions must be staged');
  assert(cherryState.workingTree['modify.txt'].includes('<<<<<<< HEAD'), 'conflicted files must contain markers');
  assert(cherryState.staging['delete.txt'] === undefined, 'conflicted files must not be staged automatically');
  const blockedSwitch = cherryConflictEngine.execute({ type: 'switch', params: { branch: 'feature' } });
  assert(!blockedSwitch.valid && blockedSwitch.error.code === 'CHERRY_PICK_IN_PROGRESS', 'branch switching must be blocked during cherry-pick');
  assert(cherryConflictEngine.execute({ type: 'status', params: {} }).data.cherryPickInProgress.sourceCommit === 'cp-source', 'status must expose pending cherry-pick state');
  const blockedCommit = cherryConflictEngine.execute({ type: 'commit', params: { message: 'Too soon' } });
  assert(!blockedCommit.valid && blockedCommit.error.code === 'UNRESOLVED_CONFLICTS', 'commit must be blocked while conflicts remain');
  assertValid(cherryConflictEngine.execute({ type: 'resolve', params: { file: 'modify.txt', content: '<<<<<<< HEAD\\ntarget\\n=======\\nincoming\\n>>>>>>> incoming' } }), 'conflict markers may be edited');
  assertValid(cherryConflictEngine.execute({ type: 'add', params: { file: 'modify.txt' } }), 'unresolved marker content may be staged without clearing its conflict');
  assert(cherryConflictEngine.inspect().conflicts.length === 3, 'staging conflict markers must keep the conflict unresolved');
  assertValid(cherryConflictEngine.execute({ type: 'resolve', params: { file: 'both-added.txt', content: 'combined addition' } }), 'add/add conflict should be resolvable');
  assertValid(cherryConflictEngine.execute({ type: 'add', params: { file: 'both-added.txt' } }), 'add/add resolution must be staged');
  assertValid(cherryConflictEngine.execute({ type: 'resolve', params: { file: 'modify.txt', content: 'combined modification' } }), 'modified conflict should be resolvable');
  assertValid(cherryConflictEngine.execute({ type: 'add', params: { file: 'modify.txt' } }), 'modified resolution must be staged');
  assertValid(cherryConflictEngine.execute({ type: 'resolve', params: { file: 'delete.txt', deleteFile: true } }), 'delete conflict should support deletion resolution');
  assertValid(cherryConflictEngine.execute({ type: 'add', params: { file: 'delete.txt' } }), 'resolved deletion must be staged');
  assertValid(cherryConflictEngine.execute({ type: 'resolve', params: { file: 'remove.txt', content: 'restore source change' } }), 'delete-versus-modify conflict should be resolvable');
  assertValid(cherryConflictEngine.execute({ type: 'add', params: { file: 'remove.txt' } }), 'delete-versus-modify resolution must be staged');
  cherryState = cherryConflictEngine.inspect();
  assert(cherryState.conflicts.length === 0, 'marker-free staged resolutions must clear conflicts');
  assert(cherryState.staging['clean-delete.txt'] === null, 'clean deletions must remain staged until completion');
  assert(!Object.prototype.hasOwnProperty.call(cherryState.workingTree, 'delete.txt'), 'deletion resolution must remove the file from the worktree');
  assert(cherryState.cherryPickInProgress, 'resolving conflicts must retain operation state until commit');
  const completedPick = cherryConflictEngine.execute({ type: 'commit', params: { message: 'Apply source changes' } });
  assertValid(completedPick, 'cherry-pick should complete after resolution and staging');
  assert(JSON.stringify(completedPick.data.commit.parents) === JSON.stringify(['cp-target']), 'completion must create a single-parent commit at the target tip');
  assert(completedPick.data.commit.tree['modify.txt'] === 'combined modification' && completedPick.data.commit.tree['keep.txt'] === 'incoming clean change', 'commit tree must include resolutions and clean changes');
  assert(!Object.prototype.hasOwnProperty.call(completedPick.data.commit.tree, 'delete.txt'), 'resolved deletion must be present in the committed tree');
  assert(!Object.prototype.hasOwnProperty.call(completedPick.data.commit.tree, 'clean-delete.txt'), 'clean deletion must be present in the committed tree');
  assert(completedPick.data.commit.tree['both-added.txt'] === 'combined addition', 'add/add resolution must be committed');
  cherryState = cherryConflictEngine.inspect();
  assert(cherryState.cherryPickInProgress === null && cherryState.conflicts.length === 0, 'completion must clear cherry-pick state and conflict records');
  assert(cherryConflictEngine.execute({ type: 'status', params: {} }).data.clean, 'completed cherry-pick should leave a clean tree');

  const abortEngine = createGitEngine({
    seed: 'cherry-pick-abort',
    commits: [
      { id: 'abort-base', message: 'Base', parents: [], tree: { 'file.txt': 'base' } },
      { id: 'abort-target', message: 'Target', parents: ['abort-base'], tree: { 'file.txt': 'target' } },
      { id: 'abort-source', message: 'Source', parents: ['abort-base'], tree: { 'file.txt': 'source' } }
    ], branches: { main: 'abort-target', feature: 'abort-source' }, headBranch: 'main'
  });
  const abortBefore = abortEngine.inspect();
  const abortConflict = abortEngine.execute({ type: 'cherry-pick', params: { commit: 'abort-source' } });
  assert(!abortConflict.ok && abortEngine.inspect().cherryPickInProgress, 'abort fixture must pause on a conflict');
  assertValid(abortEngine.execute({ type: 'cherry-pick', params: { abort: true } }), 'cherry-pick abort should succeed');
  cherryState = abortEngine.inspect();
  assert(cherryState.head.commit === abortBefore.head.commit && cherryState.branches.main === abortBefore.branches.main, 'abort must preserve refs');
  assert(JSON.stringify(cherryState.workingTree) === JSON.stringify(abortBefore.workingTree) && JSON.stringify(cherryState.staging) === JSON.stringify(abortBefore.staging), 'abort must restore original worktree and index');
  assert(cherryState.cherryPickInProgress === null && cherryState.conflicts.length === 0, 'abort must clear operation metadata and conflicts');

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
    files: { 'note.txt': 'original' },
    workingTree: { 'note.txt': 'newer unstaged edit' },
    staging: { 'note.txt': 'staged' }
  });
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
    files: { 'note.txt': 'original' },
    workingTree: { 'note.txt': 'recreated after staging deletion' },
    staging: { 'note.txt': null }
  });
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
