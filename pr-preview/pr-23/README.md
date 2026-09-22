# Playroom

A small collection of framework-free browser games, built with plain HTML, CSS, and JavaScript.

## Run locally

Serve the folder with any static file server:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000/`.

## Architecture

```text
lobby
  ↓
game controller
  ↓
game engine
  ↓
renderer / persistence
```

The lobby owns navigation and uses `games/registry.js` as the single source of truth for game metadata, categories, and playable state. Each playable game owns its controller, engine, renderer, assets, and persistence under `games/<game>/`.

Shared platform utilities live in `shared/`:
- `shared/lifecycle.js` manages event-listener and timer cleanup.
- `shared/storage.js` provides JSON persistence and versioned storage boundaries.
- `dom.js` contains shared DOM-safety helpers.

## Registering a game

1. Add the game module.
2. Expose the standard controller contract: `render(mode)` and `destroy()`.
3. Keep engine logic independent of the DOM.
4. Register game metadata in `games/registry.js`.
5. Keep game-specific CSS local to `games/<game>/styles.css`.
6. Add the required player-facing `about` metadata to the game registry.
7. Use shared lifecycle/storage utilities where applicable.

The lobby only knows the registry and controller contracts. A new game's internal implementation should not require changes to unrelated game modules.

## Persisted data

Game-specific localStorage values are versioned at the owning module boundary. Version 1 data uses the envelope:

```js
{ version: 1, data: /* game-owned payload */ }
```

Stored data must match the current versioned envelope. Unversioned or incompatible payloads fall back to the owning game's default data.


See [`docs/game-contract.md`](docs/game-contract.md) for the required game contract, including About content.
