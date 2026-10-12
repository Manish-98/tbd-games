# Cellular Automata Playground

## Concept

An interactive browser visualisation of **Cellular Automata**, starting with Conway's Game of Life.

The user creates an initial world, runs the simulation, and experiments with different rules to see how simple local behaviour produces complex patterns.

> **Create → Run → Observe → Change the rules → Experiment**

## Features

### World

- Large interactive grid with enough space for creative patterns without hurting performance
- Cells are either alive or dead
- Click/drag to toggle cells
- Clear and randomize controls
- Wrap-around edges

### Simulation

Default rules use Conway's Game of Life:

- Alive + 2–3 neighbours → survives
- Alive + 0–1 or 4–8 neighbours → dies
- Dead + exactly 3 neighbours → becomes alive

Represent rules using standard **B/S notation**, e.g. `B3/S23`.

Controls:

- Run / Pause
- Step one generation
- Reset to initial state
- Simulation speed
- Generation counter

### Rule Lab

Allow users to create custom cellular automata.

**Birth rules**

Select which neighbour counts cause a dead cell to become alive:

`0 1 2 3 4 5 6 7 8`

**Survival rules**

Select which neighbour counts allow an alive cell to survive:

`0 1 2 3 4 5 6 7 8`

Display the resulting rule as B/S notation.

Changing the rules should immediately affect the simulation.

### Custom Worlds

Users can save interesting configurations as **custom worlds**.

A saved world should contain:

- Cell configuration
- Grid dimensions
- Birth rules
- Survival rules
- World name

Users can load, reset, and continue experimenting with saved worlds.

### Visual Polish

Keep the interface minimal and let the grid dominate the screen.

- Subtle cell transitions
- Clear distinction between alive/dead cells
- Generation counter
- Living-cell count
- Changed-cell count

## Technical Direction

- Canvas-based grid rendering
- `Uint8Array` for simulation state
- Keep the simulation world large enough for creative patterns while maintaining smooth performance
- Keep simulation logic separate from rendering

## Core Idea

> **Simple rules. Local interactions. Unexpected complexity.**
