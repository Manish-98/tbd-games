# Git state engine

The Git game engine is intentionally independent of the DOM, scenario templates, and rendering.

## Module boundaries

The engine is split by responsibility:

- `constants.js` — command names, domain defaults, and domain tokens
- `clock.js` — deterministic repository time
- `repository-state.js` — private repository-state boundary
- `utils.js` — immutable tree helpers, graph traversal, ref validation, and deterministic IDs
- `validation.js` — command parameter validation and normalized command input
- `operations.js` — operation registry only
- `operations/inspection.js` — read models
- `operations/working-tree.js` — staging, commits, restore, and reset
- `operations/refs.js` — branches, switching, merge, and rebase
- `operations/history.js` — revert and cherry-pick
- `operations/remotes.js` — fetch, pull, and push
- `operations/stash.js` — stash lifecycle
- `operations/common.js` — shared operation primitives
- `engine.js` — repository lifecycle, command orchestration, and public API
- `engine.test.js` — framework-free behavioral smoke tests

This keeps Git algorithms out of command parsing and keeps UI/scenario concerns out of the state layer.

## Repository model

The state model represents:

- commits, parent relationships, trees, metadata, and file changes
- local branches and detached HEAD
- working tree and staging area
- remotes and remote-tracking references
- tags
- merge conflicts
- reflog entries
- stash entries
- structured command history

Commit IDs and repository timestamps are deterministic for a given seed and generated input, which makes scenario generation and replay reproducible.

## Command execution

Commands are structured data, for example:

```js
{
  type: 'switch',
  params: { branch: 'feature' }
}
```

`validateCommand(state, command)` normalizes and validates command parameters before execution. `executeCommand(repository, command)` then dispatches the validated command to a read or write operation and distinguishes validation failures from Git-level failures.

No arbitrary shell command or free-form Git string is executed.

## Supported command families

The engine covers:

- inspection: status, log, show, diff, reflog
- everyday work: add, commit, branch, switch, merge
- history changes: rebase, reset, restore, revert, cherry-pick
- remotes: fetch, pull, push
- temporary work: stash

New command behavior should be added by extending validation and operation modules rather than growing the repository orchestration layer.

## Reset and state inspection

`reset()` restores the generated repository snapshot, deterministic ID sequences, and repository clock. Repository state is privately owned by `GitRepository`; `snapshot()` / `inspect()` return clones for visualization or objective evaluation. 
