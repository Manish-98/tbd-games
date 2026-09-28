# Clean Code Standards

This document is the repository's baseline for writing and reviewing framework-free HTML, CSS, and JavaScript.

These rules are intentionally pragmatic: they prioritize readability, local reasoning, accessibility, maintainability, and predictable browser behavior over adopting a large framework or an exhaustive style system.

## 1. Core principles

1. **Prefer simple code over clever code.** A future contributor should be able to understand a function or module without reconstructing hidden state.
2. **Keep responsibilities small.** Separate game/domain logic, DOM rendering, persistence, and lifecycle concerns when they have different reasons to change.
3. **Make dependencies explicit.** Prefer ES modules and explicit imports/exports over globals.
4. **Keep state ownership clear.** Each piece of mutable state should have one obvious owner.
5. **Avoid duplication.** Repeated values, selectors, transformations, and rules should be centralized when they represent one concept.
6. **Do not introduce abstractions without a concrete need.** A small helper is preferable to a framework-like abstraction that hides simple browser APIs.
7. **Preserve existing architecture.** Shared platform behavior belongs in shared modules; game-specific behavior belongs inside the game.
8. **Prefer readable names over comments.** Comments should explain intent, constraints, or non-obvious browser behavior—not restate the code.
9. **Keep changes scoped.** Do not mix unrelated refactors or formatting churn into a feature/bug change.

## 2. JavaScript

### Variables and declarations

- Use const by default.
- Use let only when a binding must be reassigned.
- Do not use var.
- Declare one variable per declaration.
- Declare variables close to their first use and keep their scope as small as practical.
- Prefer immutable bindings and data flow where practical; remember that const does not make objects or arrays immutable.
- Use strict equality (===, !==) and avoid implicit type coercion.

### Naming

- Use camelCase for variables, functions, and parameters.
- Use PascalCase for classes and constructors.
- Use descriptive names that communicate intent.
- Avoid generic names such as data, thing, temp, or value when a domain-specific name is available.
- Boolean names should read naturally as predicates, such as isComplete, hasSelection, or canAdvance.
- Keep file names lowercase and consistent with the existing repository convention.

### Functions

- Give each function one clear responsibility.
- Keep functions short enough that their control flow can be understood locally.
- Prefer early returns for guard conditions when they make the main path clearer.
- Avoid functions with long parameter lists; use a named object when a group of related options is required.
- Avoid hidden side effects. A function that mutates DOM, storage, timers, or global state should make that responsibility clear from its name and location.
- Do not duplicate validation or transformation logic across callers.

### Modules and dependencies

- Use ES modules with import and export.
- Avoid mutable module-level state unless it is intentionally shared and owned by that module.
- Avoid attaching application state or functions to window.
- Keep engine/domain logic independent of the DOM whenever practical.
- Keep rendering code responsible for translating state into UI, rather than embedding game rules inside event handlers.
- Prefer dependency direction such as controller → engine/state → renderer, not circular dependencies.
- Reuse repository utilities such as lifecycle and storage helpers instead of recreating their responsibilities in each game.

### DOM interaction

- Cache stable DOM references when repeated access is necessary, but do not cache elements whose lifecycle can outlive the view that owns them.
- Prefer event delegation when many equivalent dynamic elements would otherwise require many listeners.
- Register listeners and timers through the repository lifecycle mechanism when the owning view can be destroyed.
- Do not leave event listeners, intervals, animation frames, or observers running after a game/view is destroyed.
- Prefer textContent, createElement, and explicit DOM APIs for untrusted or plain-text content.
- Treat innerHTML, insertAdjacentHTML, and similar HTML sinks as security-sensitive. Use them only when the HTML is controlled and the safety boundary is explicit.

### Data and constants

- Do not scatter magic numbers or strings through implementation code.
- Promote values that represent domain concepts, game rules, UI timing, limits, storage keys, or repeated selectors into named constants or configuration objects.
- Do not turn every literal into a constant merely to avoid literals; a local value is fine when its meaning is obvious and it is used once.
- Prefer data-driven tables/arrays/maps over long repeated conditional branches when the behavior is naturally data-driven.
- Keep configuration separate from behavior where doing so makes rules easier to review or test.

### Error handling

- Validate external or persisted data at the boundary where it enters the application.
- Fail safely when localStorage data is missing, malformed, or from an older/incompatible version.
- Do not silently swallow errors unless ignoring the failure is intentional and documented.
- Error messages should identify the failed operation without exposing sensitive data.
- Avoid using exceptions as ordinary control flow.

### Browser APIs

- Prefer standard Web APIs over custom implementations when the platform already provides the required behavior.
- Use modern APIs when they are supported by the repository's browser baseline.
- Do not add polyfills or compatibility workarounds without a demonstrated compatibility requirement.

## 3. HTML

### Structure and semantics

- Use semantic HTML: header, nav, main, section, article, aside, footer, headings, lists, buttons, links, and form controls according to their meaning.
- Use the correct native element for the job. Do not use a div or span as a button or link.
- Maintain logical source order; use CSS for presentation rather than rearranging meaningful content solely for visual placement.
- Keep heading hierarchy meaningful and avoid choosing heading levels only for their default visual size.
- Use lists for lists and tables for tabular data.

### Interactive controls

- Use button for actions and a for navigation.
- Every form control must have an accessible label.
- Do not rely on placeholder text as the only label.
- Ensure interactive functionality is keyboard accessible.
- Do not remove focus indicators without providing an equally clear alternative.
- Prefer native browser behavior before adding custom keyboard handling or ARIA.

### Images and text

- Provide meaningful alt text for informative images.
- Use empty alt text for purely decorative images when appropriate.
- Use descriptive link text; avoid ambiguous labels such as "click here".
- Keep user-facing text clear and concise.

### Attributes and IDs

- Use IDs only where a unique document identifier is required, such as label/control associations or deliberate DOM lookup.
- Prefer classes for styling and reusable behavior hooks where appropriate.
- Keep data-* attributes for small pieces of declarative state or configuration that genuinely belong on an element.
- Avoid encoding complex application state into CSS classes or DOM attributes.

## 4. CSS

### Organization

- Keep shared styles in shared stylesheets and game-specific styles in the owning game.
- Organize styles so base/layout/component/state concerns are easy to locate.
- Keep related rules together and use consistent formatting.
- Prefer a small number of predictable layers over repeated overrides.

### Selectors and cascade

- Prefer simple, low-specificity selectors.
- Prefer classes, attributes, and pseudo-classes over deeply nested selectors.
- Avoid IDs for styling.
- Avoid selector chains that depend on a particular DOM structure unless that structure is an intentional component boundary.
- Avoid !important except for a documented, unavoidable override.
- When a rule needs increasingly specific overrides, stop and reconsider the component or cascade structure rather than continuing to increase specificity.
- Do not leave dead selectors, empty declarations, duplicate declarations, or obsolete compatibility code.

### Values and reuse

- Use CSS custom properties for shared design tokens such as colors, spacing, radii, typography values, and repeated animation timings.
- Avoid repeating the same literal value when it represents one design decision.
- Keep game-specific constants close to the game stylesheet rather than adding them to global styles without need.
- Prefer relative and responsive units where appropriate for the property and layout.

### Layout and state

- Prefer modern layout primitives such as Flexbox and Grid for layout.
- Use classes or data attributes to represent UI states; avoid manipulating many individual inline styles from JavaScript.
- Keep presentation in CSS and behavior in JavaScript.
- Animations should be purposeful and should not interfere with usability or interaction.

### Responsive and accessible styling

- Design for different viewport sizes instead of relying on one fixed canvas/layout size unless the game explicitly requires it.
- Maintain readable text and sufficient contrast.
- Preserve visible keyboard focus.
- Respect reduced-motion preferences for non-essential animation.
- Do not communicate important information through color alone.

## 5. Accessibility baseline

Accessibility is part of implementation quality, not a separate polish phase.

For every new or modified UI:

- Use semantic HTML first.
- Verify keyboard access for interactive controls.
- Verify visible focus.
- Provide accessible names for controls.
- Provide text alternatives for meaningful non-text content.
- Ensure dynamic status changes are understandable without relying solely on animation or color.
- Avoid unexpected context changes on focus.
- Test important flows with keyboard-only navigation.

Use ARIA to supplement native semantics when necessary; do not use ARIA to replace an appropriate native HTML element.

## 6. Security and DOM safety

- Treat URL parameters, query strings, hash fragments, localStorage/sessionStorage values, and other external input as untrusted.
- Prefer DOM APIs that insert text rather than HTML when displaying untrusted data.
- Never pass untrusted input to eval, Function, or equivalent code-execution APIs.
- Avoid constructing executable JavaScript from strings.
- Validate values before using them as URLs, selectors, storage keys, or DOM attributes when the value comes from outside the application.
- Keep HTML generation controlled and local; do not concatenate untrusted input into HTML.
- When an HTML sink is genuinely required, establish and document the trust boundary rather than assuming input is safe.

## 7. Game-specific maintainability

Because this repository contains small browser games:

- Keep the game engine deterministic where practical and independent of the DOM.
- Keep rendering as a projection of game state rather than the source of truth.
- Keep player input handling separate from rule evaluation.
- Keep timers and animation loops owned by the game/view lifecycle.
- Keep persistence at the owning game boundary and use the repository's versioned storage format.
- Do not duplicate common lobby, lifecycle, storage, or DOM-safety behavior inside individual games.
- Avoid hardcoding level data, command palettes, scoring rules, or repeated UI definitions directly inside event handlers. Represent them as named data structures or configuration.
- Avoid "magic" positional indexes when an object with named fields makes the domain clearer.
- When a game grows beyond a single small module, split it by responsibility rather than allowing one controller file to become the dumping ground for state, rules, rendering, and persistence.

## 8. Comments and documentation

- Explain why, not what the code obviously does.
- Document browser quirks, non-obvious invariants, security boundaries, and deliberate trade-offs.
- Remove comments that become false after a refactor.
- Prefer a named function, constant, or data structure when that makes the code self-explanatory.
- Update relevant documentation when a public contract, game contract, storage format, or architectural rule changes.

## 9. Review checklist

Before opening a PR, verify:

- [ ] Names communicate intent.
- [ ] Constants/configuration replace repeated domain values and magic numbers.
- [ ] Responsibilities are separated cleanly.
- [ ] No unnecessary globals or hidden mutable state were introduced.
- [ ] DOM listeners, timers, observers, and animation frames have clear ownership and cleanup.
- [ ] User-controlled or persisted data is handled safely.
- [ ] Semantic HTML and keyboard interaction are preserved.
- [ ] Focus remains visible.
- [ ] CSS specificity and overrides remain manageable.
- [ ] No dead, duplicate, or unrelated code was added.
- [ ] The change follows CONTRIBUTING.md and stays scoped to the issue.

## 10. Sources and authority

This repository guide adapts established guidance rather than copying any single style guide. Where sources differ, this document's repository-specific rule wins.

- **MDN — JavaScript code style:** recommends const/let, strict equality, avoiding implicit coercion, and other readable JavaScript practices.
  https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Code_style_guide/JavaScript
- **Google JavaScript Style Guide:** provides established conventions for JavaScript source structure, declarations, naming, and maintainability. Google notes that this guide is no longer being updated and recommends TypeScript for new Google work; this repository uses it as a source of applicable JavaScript conventions, not as a framework requirement.
  https://google.github.io/styleguide/jsguide.html
- **MDN — HTML accessibility:** recommends semantic HTML, correct controls, logical source order, accessible links, and text alternatives.
  https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/HTML
- **MDN — CSS and JavaScript accessibility:** covers focus, contrast, animation, unobtrusive JavaScript, and sensible event handling.
  https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/CSS_and_JavaScript
- **MDN — Organizing CSS:** emphasizes consistency, maintainability, naming conventions, and avoiding stylesheet complexity.
  https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Organizing
- **MDN — CSS code style:** recommends planning styles, avoiding redundant/dead CSS, and using supported modern CSS.
  https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Code_style_guide/CSS
- **W3C WAI — Keyboard accessibility:** establishes keyboard access as a core accessibility principle.
  https://www.w3.org/WAI/fundamentals/accessibility-principles/
- **W3C WAI — Form labels:** recommends explicitly associating labels with form controls.
  https://www.w3.org/WAI/tutorials/forms/labels/
- **OWASP — DOM-based XSS Prevention:** recommends treating untrusted data as text and using safe DOM construction APIs instead of unsafe HTML/code sinks.
  https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html

Last reviewed: 2026-09-28.
