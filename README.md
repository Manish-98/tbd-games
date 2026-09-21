# Playroom

A small collection of framework-free browser games, built with plain HTML, CSS, and JavaScript.

## Run locally

Serve the folder with any static file server so the game can load its local JSON data:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000`.

The lobby lives in `script.js`. Each playable game owns its code and assets in a directory under `games/`; the typing game is in `games/typing/` and the circuit game is in `games/logic/`.

## Registering a game

Add a playable game as one entry in the `games` list in `script.js`. The entry supplies the lobby metadata, controller initializer, game section and view selectors, close button selector, tab selector, mode data attribute, and initial mode. The controller must return `render(mode)` and `destroy()` methods.

The lobby uses that metadata to render cards and manage opening, closing, and tabs. Game-specific rendering and mode behavior stays inside the game controller. Cards without an `id` and `initialize` entry remain marked as coming soon.