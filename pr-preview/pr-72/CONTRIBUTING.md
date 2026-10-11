# Contributing

## Development Workflow

All work follows this flow:

**Issue → Branch → Implementation → PR → Review → Merge → Delete branch**

### 1. Start with an Issue

Every piece of work must begin with a GitHub Issue.

Use the appropriate issue type:
- **Feature** — new functionality or game behavior
- **Bug** — incorrect, broken, or unexpected behavior
- **Refactor** — structural or technical improvements without changing intended behavior
- **Documentation** — documentation-only changes

The issue should describe the goal, relevant context, constraints, and acceptance criteria.

### 2. Create a dedicated branch

Create a branch from the latest `main` for the issue.

Naming convention:
- `feat/<short-description>`
- `fix/<short-description>`
- `refactor/<short-description>`
- `docs/<short-description>`

Do not develop directly on `main`.

### 3. Implement the issue

Keep the work scoped to the issue. If implementation reveals unrelated work, create a separate issue rather than expanding the current scope unnecessarily.

Keep commits focused and descriptive. Prefer conventional prefixes such as:
- `feat:`
- `fix:`
- `refactor:`
- `docs:`

### 4. Open a Pull Request

Every PR implementing or fixing an issue must reference its Issue number.

Use:
- `Closes #123` when the PR completes the issue.
- `Refs #123` when the PR is related to the issue but should not close it automatically.

A PR should normally address one issue.

PR descriptions should include:
- What changed
- Why it changed
- Issue reference
- Important implementation decisions
- Anything reviewers should pay particular attention to

### 5. Review

All changes require a review pass before merging.

Address blocking review feedback before merge. Non-blocking comments may be resolved when appropriate.

### 6. Merge

Do not merge directly to `main`.

Use **Squash and merge** so each logical change is represented by one clean commit on `main`.

### 7. Clean up

Delete the feature branch after the PR is merged.

Start future work from the latest `main`; do not reuse an old branch for unrelated work.

## Project-specific rules

### Keep game and platform changes distinct

Changes specific to one game should remain scoped to that game.

Changes to shared game infrastructure, APIs, registries, UI primitives, or other platform code should be explicitly identified as platform-level work in the issue and PR.

### Keep issues independently actionable

If two pieces of work can be implemented, reviewed, and merged independently, they should normally be separate issues and PRs.

### Avoid unrelated changes

Do not include opportunistic refactors, formatting changes, or unrelated fixes in a feature or bug PR unless they are necessary for the change. Create a separate issue when appropriate.
