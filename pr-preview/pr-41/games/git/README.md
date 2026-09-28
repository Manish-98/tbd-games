# Git state engine

The Git game engine is intentionally independent of the DOM, scenario templates, and rendering.

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

Commit IDs are deterministic for a given seed and generated input, which makes scenario generation reproducible.

## Command execution

Commands are structured data, for example:

\`\`\`js
{
  type: 'switch',
  params: { branch: 'feature' }
}
\`\`\`

validateCommand(state, command) handles parameter validation before execution. executeCommand(repository, command) then distinguishes validation failures from Git-level failures and successful state transitions.

No arbitrary shell command or free-form Git string is executed.

## Supported command families

The first engine implementation covers:

- inspection: status, log, show, diff, reflog
- everyday work: add, commit, branch, switch, merge
- history changes: rebase, reset, restore, revert, cherry-pick
- remotes: fetch, pull, push
- temporary work: stash

The command list is data-driven so later issues can add specialized operations without coupling them to UI code.

## Reset and state inspection

reset() restores the exact generated repository snapshot. snapshot() returns a cloned state suitable for visualization or objective evaluation without exposing mutable engine internals.
