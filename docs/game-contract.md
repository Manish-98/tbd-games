# Game Contract

Every playable game registered in `games/registry.js` must provide player-facing About content.

## Required About content

Each playable game must define an `about` object with these fields:

- `objective`: the goal of the game.
- `concept`: the skill or concept the game teaches or explores.
- `howToPlay`: the basic flow for a new player.
- `rules`: the rules and constraints.
- `components`: the major game elements.
- `controls`: available inputs and interactions.
- `scoring`: scoring, progression, completion, or an explicit statement that the game has no score.

The shared game launcher validates this contract before initializing a playable game.

New games should add their About content to the registry at the same time they are registered so the game cannot be integrated without player-facing documentation.
