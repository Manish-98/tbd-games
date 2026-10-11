# Git Scenario Framework

The scenario framework turns declarative templates into deterministic, state-driven game scenarios.

## Scenario contract

A generated scenario contains:

- `story` — player-facing scenario context.
- `parameters` — generated values used by the scenario.
- `repository` — input accepted by `createGitEngine()`.
- `availableCommands` — supported commands exposed to the command builder.
- `objectives` — state predicates; they do not prescribe a command sequence.
- `completionExplanation` — explanation shown after completion.
- `concept` — optional learning metadata.
- `modifiers` — modifiers applied to the generated scenario.
- `metadata` — optional template-specific data.

## Template contract

Use `defineScenarioTemplate()` with:

- `id`
- `story`
- `generate({ random, modifiers })`
- optional `availableCommands`
- optional `objectives`
- optional `modifiers`
- optional `completionExplanation`
- optional `concept`

`generateScenario(template, { seed, modifiers })` creates a concrete instance. The same template and seed produce the same generated values.

The generator never receives a command history and never creates a required command sequence. Objectives inspect repository state instead.

## Objective contract

Create objectives with `createObjective()`. An objective may return a boolean or:

~~~js
createObjective({
  id: 'target-branch',
  description: 'The target branch points to the expected commit.',
  evaluate(state) {
    const satisfied = state.branches.feature === expectedCommit;

    return {
      satisfied,
      unmet: satisfied ? [] : [{
        id: 'target-branch',
        description: 'feature must point to the expected commit.',
        expected: expectedCommit,
        actual: state.branches.feature || null
      }]
    };
  }
});
~~~

The structured form gives the UI diagnostic information about unmet conditions.

## Modifiers

Templates can register reusable modifiers. A modifier has an `id` and an `apply(scenario)` function that returns a new scenario.

The framework applies only requested modifiers. By default, no template modifiers are enabled; pass modifier ids through `generateScenario(template, { modifiers })` to opt in.

## Reset and regeneration

A scenario is immutable after generation. To regenerate or reset, call `generateScenario()` again with the same seed or another explicit seed, then create a fresh `GitRepository` from `scenario.repository`.

This keeps scenario generation independent from repository execution and rendering.


## Registered scenarios

The initial playable scenario set is registered in `registry.js`:

- **The Missing Feature** — recover a deleted feature branch from repository history.
- **Friday Afternoon Merge** — integrate two cleanly divergent lines of development.
- **Make This PR Presentable** — rebase a feature history onto an updated target branch.
- **Your Teammate Got There First** — reconcile local work with an advanced remote branch.

Each template randomizes repository details and exposes only commands currently supported by the engine. Scenario objectives inspect repository state rather than prescribing a command sequence.

The scenario registry is UI-independent:

~~~js
import { generateRegisteredScenario } from './registry.js';

const scenario = generateRegisteredScenario('missing-feature', {
  seed: 'example-seed'
});
~~~

The generated `repository` can be passed directly to `createGitEngine()`. Resetting a scenario means creating a fresh engine from the same immutable generated repository; regenerating with another seed creates a new instance.
