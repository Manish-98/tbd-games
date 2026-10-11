# Refactoring PR 02 — Extract Game Engines

## Goal

Separate game rules and state transitions from DOM, Canvas, SVG, and browser APIs.

## Implemented

### Cellular
- Added `games/cellular/engine.js`
- Extracted grid creation/cloning, rule masks, cell access, randomization, living-cell counting and generation evolution.
- `nextGeneration()` returns the next grid and derived metrics without rendering.

### Logic
- Added `games/logic/engine.js`
- Extracted gate definitions, connection/cycle validation and circuit evaluation.
- The controller delegates circuit output calculation to the engine.

### Turtle
- Added `games/turtle/engine.js`
- Extracted command definitions/default creation, program cloning, movement/rotation and program execution.
- Program execution produces state/stroke steps; the controller is responsible for timing and Canvas rendering.

### Typing
- Added `games/typing/engine.js`
- Extracted CPM/WPM/accuracy calculations and history aggregation.
- The keyboard/session controller remains responsible for browser events.

## Dependency direction

```
UI/controller
    ↓
game engine
    ↓
plain data
```

Engines do not access DOM, Canvas, `window`, `localStorage`, or rendering functions.

## Non-goals

- No automated tests.
- No UI redesign.
- No persistence schema migration.
- No broad CSS cleanup.
- No gameplay redesign.

## Acceptance criteria

- [x] Cellular evolution is independent of Canvas.
- [x] Logic evaluation is independent of SVG/DOM.
- [x] Turtle execution is independent of Canvas.
- [x] Typing metrics can be calculated without DOM state.
- [x] Controllers remain responsible for browser interaction and rendering.
