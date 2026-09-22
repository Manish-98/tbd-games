# Refactoring PR 01 — Game Platform Foundation

## Goal

Establish a consistent runtime boundary for every implemented game before changing game internals.

This PR makes the lobby responsible for orchestration only. Each game owns its DOM, while the shared platform owns lifecycle and persistence primitives.

## Changes

### 1. Simplified game registry

Game metadata now contains only:

```js
{
  id,
  title,
  type,
  category,
  description,
  symbol,
  initialMode,
  initialize
}
```

The registry no longer contains game-specific selectors or DOM event details.

The lobby derives each game section from the stable `<game-id>-game` convention and passes the section to the game initializer.

### 2. Standard game controller contract

Every implemented game now follows:

```js
const controller = initialize(section);

controller.render(mode);
controller.destroy();
```

Game initializers resolve their own internal view elements.

### 3. Lazy initialization

Games are no longer initialized at page load.

A controller is created when its game is opened and destroyed when the user leaves it. This prevents unused games from registering listeners and creating game runtime state. Game modules are still imported by the registry at page load; this PR does not introduce code-splitting or dynamic module loading.

### 4. Shared lifecycle management

Added `shared/lifecycle.js` with deterministic cleanup support for:

- DOM/window event listeners
- intervals
- timeouts
- arbitrary cleanup callbacks

Logic, Turtle, and Cellular now use the lifecycle utility for their event ownership.

Typing retains its existing `TypingSession.destroy()` cleanup because the keyboard listener and timer belong to the session itself.

### 5. Shared localStorage access

Added `shared/storage.js` for safe JSON load/save operations.

Typing, Turtle, and Cellular now use the shared storage abstraction instead of duplicating localStorage parsing and error handling.

### 6. Data-driven lobby counts

The lobby now derives game/category counts from the registry instead of hardcoding them in HTML.

## Non-goals

- No game-engine extraction.
- No visual redesign.
- No testing work.
- No framework introduction.
- No intentional gameplay changes.
- No rendering/security cleanup; those belong to later refactoring PRs.

## Acceptance criteria

- [x] Lobby registry contains metadata and initializer only.
- [x] Games own their internal DOM queries.
- [x] Game controllers are initialized lazily when their game is opened.
- [x] Every implemented game exposes `render()` and `destroy()`.
- [x] Event listeners owned by Logic, Turtle, and Cellular have deterministic cleanup.
- [x] Shared localStorage access is centralized.
- [x] Lobby counts are derived from the registry.
- [x] Existing game behavior remains conceptually unchanged.

## Follow-up

**PR 02 — Extract Game Engines** can now separate simulation/domain logic from UI rendering without also having to solve lifecycle and ownership boundaries.
