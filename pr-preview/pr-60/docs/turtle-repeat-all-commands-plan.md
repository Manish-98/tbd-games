# Turtle Repeat: Full Command Support Plan

Related issue: #8 — Turtle: allow REPEAT to contain all built-in and custom commands.

## Goal

Make a `REPEAT` body a normal command container rather than a special case that only exposes `FORWARD`, `RIGHT`, and `REPEAT`.

## Current behavior

The execution engine already walks nested command trees and can execute built-in commands and custom-command calls recursively. The limitation is in `game.js`: the controls rendered inside a repeat block are hard-coded to three commands.

## Implementation

1. Reuse the existing command creation path for repeat children.
2. Render the complete built-in command set in every repeat body:
   - Forward
   - Back
   - Left
   - Right
   - Pen up
   - Pen down
   - Repeat
3. Render saved custom commands as `CALL` options inside every repeat body.
4. Allow the same repeat-body renderer to appear recursively, so nested repeats expose the same complete command set.
5. Keep command values, call parameters, and existing execution behavior unchanged.
6. Update the Turtle game documentation to describe the expanded repeat composition model.

## Data model

No command-tree format change is required. Repeat children remain:

```js
{ type: 'repeat', count: 4, children: [...] }
```

Custom commands remain represented as `call` nodes and continue using the existing `name`, `args`, and `paramValues` fields.

## Validation

Before merging, verify:

- Every built-in command can be inserted into a repeat.
- A saved custom command can be inserted into a repeat.
- Custom command parameters can still be edited.
- Nested repeats expose the complete command set.
- A repeat containing movement, pen-state changes, nested repeats, and custom calls executes correctly.
- Existing top-level commands and saved custom commands are unaffected.

## Scope

This change is intentionally limited to command composition and documentation. It does not introduce a new command type, change the persisted custom-command schema, or alter the execution engine.
