# Refactoring PR 01 — Game Platform Foundation

## Goal

Create a consistent runtime boundary for every game before changing individual game internals.

This PR is the foundation for the remaining refactoring work. It should make the lobby independent of each game's internal DOM structure and give every game the same lifecycle.

## Scope

### 1. Standardize the game controller contract

Every game should expose:

```js
const controller = initialize(container);

controller.render(mode);
controller.destroy();
```

Optional capabilities such as `setMode` should not be required by the lobby.

### 2. Simplify the game registry

The registry should contain game metadata and the initializer only:

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

Remove selectors such as `sectionSelector`, `viewSelector`, `closeSelector`, `tabsSelector`, and `modeAttribute` from the central registry.

Each game owns its own view structure and controls.

### 3. Lazy initialization

Do not initialize every game during page load.

Initialize a game when the user opens it, cache the controller while it is active, and destroy it when leaving the game.

This prevents unused games from loading assets, creating listeners, or starting timers.

### 4. Add shared lifecycle management

Introduce a small lifecycle utility for:

- DOM event listeners
- window/document listeners
- intervals
- timeouts
- cleanup

Game `destroy()` implementations should have one deterministic cleanup path.

### 5. Add shared storage helper

Create a small JSON storage abstraction used by games instead of repeating `try/catch + JSON.parse/stringify` around localStorage.

Keep it deliberately small; this is not a persistence framework.

## Non-goals

- No game-engine extraction.
- No visual redesign.
- No testing work.
- No behavior changes to the games.
- No framework introduction.

## Acceptance criteria

- The lobby does not know game-specific selectors.
- Games are initialized lazily.
- Every implemented game follows the same lifecycle contract.
- Destroying a game removes all listeners/timers owned by that game.
- Shared localStorage access is centralized.
- Existing game behavior remains unchanged.

## Dependency

None. This is the first refactoring PR.

## Follow-up

PR 02 can safely extract domain/game engines once the lifecycle and ownership boundaries are stable.
