# Game Contract

Every playable game registered in `games/registry.js` must provide a first-class About mode.

## About mode

About is a normal game tab, not a section displayed alongside the game. It uses the same game-mode area and switches in and out through the shared tab system.

Each playable game must define an `about` object with these fields:

- `objective`: the goal of the game.
- `concept`: the skill or concept the game teaches or explores.
- `howToPlay`: the basic flow for a new player.
- `rules`: the rules and constraints.
- `components`: the major game elements.
- `controls`: available inputs and interactions.
- `scoring`: scoring, progression, completion, or an explicit statement that the game has no score.
- `visual`: a compact visual explanation of the core interaction, represented as ordered steps.

The shared game launcher validates this contract before initializing a playable game.

New games should add their About content to the registry at the same time they are registered. The launcher automatically exposes About as a tab so every playable game has the same entry point for learning the rules before play.
