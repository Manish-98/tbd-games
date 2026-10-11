# Turtle JSONPath-style parameter binding

## Goal

Make custom-command bindings easier to understand by using a JSONPath-style syntax while retaining the existing dotted-path syntax.

Recommended syntax:

    size: $[0], $[2]
    turn: $[1].children[0]
    innerSize: $[0].children[0].paramValues.size

## Implementation

1. Add a dedicated binding-path parser rather than changing the program UI's existing node-path parser.
2. Parse the `$` root, bracketed array indexes, and dotted property names into the same internal path-part representation used today.
3. Accept both JSONPath-style and legacy dotted paths during validation and runtime binding application.
4. Keep nested custom-call parameter validation based on the resolved target node and custom-command definition.
5. Prefer JSONPath-style examples and placeholders in the editor help.
6. Document the syntax and backward-compatibility behavior.

## Compatibility

Existing bindings such as `0.children.0` and `0.children.0.paramValues.size` remain valid. New bindings use `$[0].children[0]...`.

## Validation

- Built-in value binding with `$[0]`.
- Nested repeat target with `$[0].children[0]`.
- Nested custom-call parameter target with `$[0].children[0].paramValues.size`.
- Multiple targets separated by commas.
- Existing legacy bindings still load and execute.
- Invalid JSONPath-style syntax is rejected.