# Playroom

A small collection of framework-free browser games, built with plain HTML, CSS, and JavaScript.

## Run locally

Serve the folder with any static file server so the game can load its local JSON data:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000`.

The lobby orchestration lives in `script.js`. Game metadata and initializers are registered in `games/registry.js`. Each playable game owns its code and assets in a directory under `games/`; the typing game is in `games/typing/` and the circuit game is in `games/logic/`.

## Registering a game

Add a playable game as one entry in the `games` list in `games/registry.js`. The entry supplies the lobby metadata, initializer, and initial mode. The game must have a matching `<section id="<game-id>-game">` in `index.html`, and its initializer receives that section and returns a controller with `render(mode)` and `destroy()` methods.

The lobby owns orchestration only. Game controllers resolve their own internal view elements from the section. Tabs use `role="tab"` and `data-game-mode="..."`, and the game section uses `data-close-game` for its close action. These are shared platform conventions rather than per-game registry configuration.

Cards without an `id` and `initialize` entry remain marked as coming soon.