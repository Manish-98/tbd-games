# Turtle nested custom-command parameter forwarding

## Goal

Allow a custom command parameter to be forwarded directly into a parameter of a nested custom-command call.

Example:

    SQUARE(size)
      REPEAT [4]
        FORWARD [size]
        RIGHT [90]

    FLOWER(size)
      REPEAT [6]
        SQUARE(size)
        RIGHT [60]

Binding in FLOWER:

    size: 0.children.0.paramValues.size

Calling FLOWER(100) should pass 100 into the inner SQUARE(size) call.

## Implementation

1. Extend binding-path validation to recognize call-parameter targets using `.paramValues.<parameter>`.
2. Resolve the call at the target path and verify that the referenced parameter exists on that custom command definition.
3. During binding application, write the outer runtime parameter value into the nested call's `paramValues`.
4. Keep existing numeric command bindings unchanged.
5. Rely on the existing recursive custom-command execution path so forwarding works through multiple custom-command levels and inside repeats.
6. Update the custom-command help text and turtle documentation with the new binding syntax and example.

## Compatibility

Existing numeric binding paths remain valid. Existing saved custom commands require no migration.

## Validation

- Bind an outer parameter to an inner custom call parameter.
- Verify forwarding works inside REPEAT.
- Verify forwarding works through more than one custom-command level.
- Verify invalid call parameters are rejected when saving.
- Verify existing movement/turn/repeat bindings still save and execute.