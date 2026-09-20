# Playroom

A small collection of framework-free browser games, built with plain HTML, CSS, and JavaScript.

## Run locally

Serve the folder with any static file server so the game can load its local JSON data:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000`.

The lobby lives in `script.js`. Each playable game owns its code and assets in a directory under `games/`; the typing game is in `games/typing/`.