# 🐢 Turtle Canvas

A lightweight, visual programming game inspired by classic **MSWLogo / Logo Turtle**.

Turtle Canvas lets players create drawings by programming a turtle with a small set of commands. Instead of typing traditional code, players build programs using clickable command blocks and immediately see the result on a high-resolution canvas.

The goal is simple:

> **If you can describe a drawing as a set of instructions, you can program it.**

---

## Features

* Large, high-resolution drawing canvas
* Visual, clickable programming commands
* No traditional code typing required
* Lightweight Turtle/Logo-style instruction set
* Loops and nested loops
* Custom reusable commands
* Parameterized custom commands
* Custom commands persisted in browser storage
* Undo / redo
* Run / stop / step execution
* Input validation and execution safeguards
* Completely free-form creative drawing

---

## Game Mode

### Free Draw

Turtle Canvas has a single mode: **Free Draw**.

Players start with a blank canvas and can create anything they want.

There are no scores, targets, timers, or predefined solutions.

Players can experiment with:

* Geometric shapes
* Repeating patterns
* Spirals
* Symmetry
* Flowers
* Mandalas
* Abstract drawings
* Their own custom creations

The experience should feel more like a **creative programming tool** than a conventional game.

---

# Turtle

The turtle maintains three important pieces of state:

```text
Position
Direction
Pen State
```

The turtle moves around the canvas and draws whenever the pen is down.

The drawing uses a **single consistent pen style**.

There are intentionally no controls for:

* Pen colour
* Pen size

This keeps the programming model focused on movement, geometry, repetition, and abstraction.

---

# Command System

Players construct programs using clickable command blocks.

### Core commands

| Command    | Parameter | Purpose                     |
| ---------- | --------- | --------------------------- |
| `FORWARD`  | Length    | Move forward while drawing  |
| `BACK`     | Length    | Move backward while drawing |
| `LEFT`     | Angle     | Rotate left                 |
| `RIGHT`    | Angle     | Rotate right                |
| `PEN UP`   | —         | Stop drawing while moving   |
| `PEN DOWN` | —         | Resume drawing              |
| `REPEAT`   | Count     | Repeat a group of commands  |
| `CALL`     | Command   | Execute a custom command    |

Example:

```text
FORWARD [100]
RIGHT [90]

REPEAT [4]
    FORWARD [100]
    RIGHT [90]
```

The player never needs to type these commands manually. The UI creates and edits the corresponding command blocks.

---

# Program Builder

Programs are represented as a visual command tree.

Example:

```text
┌─────────────────────┐
│ FORWARD [100]       │
├─────────────────────┤
│ RIGHT [90]          │
├─────────────────────┤
│ REPEAT [4]          │
│   ├─ FORWARD [100]  │
│   └─ RIGHT [90]     │
└─────────────────────┘
```

Players can:

* Add commands
* Delete commands
* Reorder commands
* Duplicate commands
* Edit parameters
* Nest commands
* Undo changes
* Redo changes

The underlying program should be represented as a **structured command tree / AST**, not as raw text.

---

# Loops

`REPEAT` allows players to express repetition without manually duplicating commands.

Example:

```text
REPEAT [4]
    FORWARD [100]
    RIGHT [90]
```

Nested loops are supported:

```text
REPEAT [6]
    REPEAT [4]
        FORWARD [50]
        RIGHT [90]

    RIGHT [60]
```

This makes it possible to create complex patterns from a very small set of commands.

---

# Custom Commands

Players can turn a group of commands into a reusable command.

For example:

```text
REPEAT [4]
    FORWARD [100]
    RIGHT [90]
```

can become:

```text
SQUARE()
```

The player can then use:

```text
SQUARE()
RIGHT [45]
SQUARE()
```

Custom commands become part of the player's personal command toolbox.

```text
My Commands

[SQUARE] [STAR] [FLOWER] [+ Create Command]
```

---

# Parameterized Commands

Custom commands can define parameters.

Example:

```text
SQUARE(size)
```

Definition:

```text
REPEAT [4]
    FORWARD [size]
    RIGHT [90]
```

The command can then be reused with different values:

```text
SQUARE(50)
SQUARE(100)
SQUARE(150)
```

Custom commands can use:

* Built-in commands
* Existing custom commands
* Their own parameters

This allows players to gradually build abstractions on top of abstractions.

For example:

```text
FLOWER(size)
    PETAL(size)
    RIGHT [60]
    PETAL(size)
    RIGHT [60]
    ...
```

---

# Custom Command Editor

Selecting **Create Command** opens a visual command editor.

Example:

```text
Command name:
[ SQUARE ]

Parameters:
[ size ]

Definition:

┌──────────────────────────┐
│ REPEAT [4]               │
│   FORWARD [size]         │
│   RIGHT [90]             │
└──────────────────────────┘

             [ Save ]
```

The definition uses the same command blocks as the main program.

This keeps the concept of a custom command consistent with the rest of the game.

---

# Input Validation

Command parameters should use constrained inputs rather than unrestricted text.

### Length

```text
FORWARD [100]
```

* Numeric values only
* No `NaN`
* No `Infinity`
* No invalid characters
* Defined maximum
* Sensible decimal precision

### Angle

```text
RIGHT [90]°
```

* Numeric values only
* Sensible bounds
* Normalized where appropriate

### Repeat count

```text
REPEAT [4] times
```

* Integer only
* Minimum of `1`
* Safe maximum

Validation should occur both when editing a command and immediately before execution.

---

# Execution Safety

Programs should be validated before they run.

The engine should protect against:

* Infinite loops
* Circular custom-command dependencies
* Excessive recursion
* Excessive nesting
* Extremely large repeat counts
* Invalid parameters
* Excessive execution time

For example, this should be rejected:

```text
A → B
B → C
C → A
```

because the commands form a circular dependency.

Custom command definitions should be validated before they are saved.

---

# Browser Storage

Custom commands should persist between sessions using browser local storage.

The UI should **not** be stored directly.

Instead, custom commands should be represented using a compact, versioned command format that is easy for the game engine to parse.

Example:

```json
{
  "v": 1,
  "commands": [
    {
      "n": "square",
      "p": ["size"],
      "b": [
        ["repeat", 4, [
          ["forward", "size"],
          ["right", 90]
        ]]
      ]
    }
  ]
}
```

Short opcodes may be used if further size optimization is useful:

```text
f = forward
b = back
l = left
r = right
u = pen up
d = pen down
x = repeat
c = call
```

Example compact representation:

```json
{
  "v": 1,
  "n": "square",
  "p": ["size"],
  "b": [
    ["x", 4, [
      ["f", "size"],
      ["r", 90]
    ]]
  ]
}
```

The format should be versioned from the beginning so that future versions of the game can migrate older saved commands.

---

# Canvas Controls

The canvas should provide:

* **Run**
* **Stop**
* **Step**
* **Clear**
* **Reset Turtle**
* **Undo**
* **Redo**

The turtle should be visible while the program executes.

Execution animation should be lightweight and should never become the primary focus of the game.

---

# Interface

A possible layout:

```text
┌──────────────────────────────────────────────────────────┐
│ Turtle Canvas                                             │
├───────────────────────────────────┬──────────────────────┤
│                                   │ Commands             │
│                                   │                      │
│                                   │ [Forward] [Back]     │
│          CANVAS                   │ [Left] [Right]       │
│                                   │ [Repeat] [Pen]       │
│               🐢                  │                      │
│                                   │ ───────────────────  │
│                                   │ Your Program         │
│                                   │                      │
│                                   │ FORWARD [100]        │
│                                   │ RIGHT [90]           │
│                                   │ REPEAT [4]           │
│                                   │                      │
│                                   │ [▶ Run] [■ Stop]     │
├───────────────────────────────────┴──────────────────────┤
│ My Commands: [SQUARE] [STAR] [FLOWER] [+ Create Command] │
└──────────────────────────────────────────────────────────┘
```

The canvas should receive the majority of the available space.

The programming interface should feel like a **toolbox**, not a traditional IDE.

---

# Design Philosophy

Turtle Canvas is intended to teach programming concepts indirectly through creative experimentation.

The player naturally progresses through:

```text
Sequence
   ↓
Repetition
   ↓
Nested repetition
   ↓
Reusable commands
   ↓
Parameters
   ↓
Composition
   ↓
Complex algorithms
```

The game does not need to explicitly teach programming terminology.

Instead, the player discovers:

> "I keep doing these four things, so I'll make a command for them."

Then:

> "This command works at different sizes, so I'll give it a parameter."

And eventually:

> "I can build a complicated drawing from a few simple commands."

That is the core learning experience.

---

# Core Principle

**Turtle Canvas turns programming into drawing.**

The programming language remains intentionally small, while the expressive power comes from **loops, reusable commands, parameters, and composition**.

The player doesn't need to learn syntax first.

They simply need to answer:

> **"What instructions would make the turtle draw this?"**


# Repeat Composition

A `REPEAT` block can contain the complete command set, not only movement and nested-repeat commands. Its body may include:

- `FORWARD`, `BACK`, `LEFT`, and `RIGHT`
- `PEN UP` and `PEN DOWN`
- Nested `REPEAT` blocks
- Calls to any saved custom command, including parameterized commands

The repeat-body controls use the same command creation model as the main program, so nested levels remain composable. The execution engine already evaluates the resulting command tree recursively; this feature expands the UI to expose that capability.

# Parameter Binding Paths

Custom-command parameters can be bound to values in the command tree using JSONPath-style paths.

Examples:

    size: $[0], $[2]
    turn: $[1].children[0]
    innerSize: $[0].children[0].paramValues.size

The leading `$` represents the program root. Bracket notation addresses array entries, while dotted properties traverse command fields.

For example, given:

    SQUARE(size)
        REPEAT [4]
            FORWARD [size]
            RIGHT [90]

    FLOWER(size)
        REPEAT [6]
            SQUARE(size)
            RIGHT [60]

the `FLOWER` definition can bind:

    size: $[0].children[0].paramValues.size

Calling `FLOWER(100)` then forwards `100` into the nested `SQUARE(size)` call.

Legacy dotted bindings such as `0.children.0` remain supported for existing saved commands.
