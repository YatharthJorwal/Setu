# RULES — Setu

Non-negotiables. If a rule gets in the way, change the rule here first, with a note in `docs/DECISIONS.md`. Do not quietly work around it.

## A. Product rules

**P1. No fabricated data shown as real.** Every number on screen is one of: (a) from a dataset listed in `provenance.json`, (b) computed by the sim from such data, or (c) a labelled assumption. Anything modelled gets an assumption tag in the UI and an entry in `web/src/sim/assumptions.ts` with its basis.

**P2. The LLM never computes or invents numbers.** It receives computed metrics and narrates them. The server rejects output containing numbers not present in the input.

**P3. Every metric has a unit and a tag.** Unit (minutes, people, hours) and tag (`data` or `assumption`). A bare number is a bug.

**P4. Not an operational system.** The persistent UI notice that Setu is illustrative and not a warning system must never be removed or hidden.

**P5. Restraint in the UI.** No emojis. No buttons or controls that do nothing. No lorem ipsum, fake data, or decorative widgets. If a control is not wired, it is not shipped.

**P6. Say what is thin.** Where data was patched by hand or estimated, the provenance panel says so.

## B. Code rules

**C1. TypeScript strict.** `strict: true`. No `any` (use `unknown` and narrow). No non-null assertions without a comment explaining why it is safe.

**C2. Pure sim core.** `web/src/sim/` does not import React, three.js, or browser globals. Enforced by lint.

**C3. Determinism.** No `Math.random`, `Date.now`, or `performance.now` in `sim/`. Use `sim/rng.ts` (seeded) and sim time. A run is a pure function of `(inputs, seed)`.

**C4. Units and names.** SI units. Variables carry unit suffixes where ambiguity is possible: `length_m`, `time_s`, `speed_kmh`. Never mix degrees and metres in one structure without naming it.

**C5. Coordinates.** WGS84 for storage and exchange. Projected metres for sim and render. Convert only in `lib/geo` and the pipeline. Never convert ad hoc.

**C6. No magic numbers.** Constants that model the world (speeds, clearance times, thresholds, persons per household) live in `sim/assumptions.ts` with a comment stating the basis and a status (`assumption`, `sourced`, `validated`). UI-only constants (durations, sizes) live next to their component.

**C7. Worker boundary.** Only `state/` talks to the worker. Messages are typed. Large data moves as transferable typed arrays.

**C8. Errors are handled, not swallowed.** User-visible failures get a clear message. Unexpected states throw in dev. No empty `catch`.

**C9. Dependencies.** Added only with a short justification in `docs/DECISIONS.md`. Prefer the platform and existing deps. No dependency for something under about 30 lines.

**C10. Size and structure.** Files over roughly 300 lines get split. Functions do one thing. Prefer small pure functions in `sim/` so they can be tested with fixtures.

**C11. Tests for the core.** Any change to `sim/` ships with a test. The properties listed in `docs/ARCHITECTURE.md` section 11 must always hold.

**C12. No debug leftovers.** No stray `console.log`, commented-out blocks, or TODOs without an owner and a reason.

## D. Data rules

**D1. Raw is immutable.** `data/raw/` is never edited or committed (gitignored). Record how each file was obtained in `docs/DATA.md`.

**D2. Processed is reproducible.** Everything in `data/processed/` comes from `python -m pipeline.build`. No hand edits. Manual patches (for example a missing road segment) are written as explicit, reviewed patch files in `pipeline/patches/` and applied by the pipeline, so they are visible and repeatable.

**D3. Provenance always.** Each dataset has source, licence, retrieval date, and notes in `provenance.json`.

**D4. Attribution.** Respect each licence. OpenStreetMap data requires "© OpenStreetMap contributors" visible in the app. Add the attribution required by every other dataset.

**D5. Validate on every build.** `python -m pipeline.validate` must pass before processed data is committed.

**D6. No personal data.** Aggregate data only. No individual-level records.

**D7. File size.** Keep committed files well under GitHub's 100 MB per-file limit. Large assets use progressive tiles, Git LFS, or deploy-time hosting.

## E. Git rules

**G1. Branches.** `main` is always deployable. Work on short-lived branches: `feat/...`, `fix/...`, `docs/...`, `data/...`, `chore/...`.

**G2. Commits.** Conventional commits: `feat:`, `fix:`, `docs:`, `data:`, `refactor:`, `test:`, `chore:`. Imperative, specific subject lines. One concern per commit.

**G3. Docs travel with code.** A change in behaviour updates the relevant doc in the same pull request.

**G4. No secrets.** API keys live in environment variables. `.env*` is gitignored. If a secret is ever committed, rotate it.

**G5. Pull requests.** Small and focused. Use `.github/pull_request_template.md`.

## F. Design rules

**U1. Tone.** Calm, precise, operational. This is a decision tool, not a game. Muted terrain palette; strong colour reserved for state (closed, isolated, delayed, open).

**U2. Colour-blind-safe.** State is never encoded by colour alone. Pair colour with shape, pattern, or label. Check palettes in a colour-blind simulator.

**U3. Typography.** One typeface family, a restrained scale, tabular figures for numbers in the dashboard.

**U4. Motion.** Motion explains change (a road closing, an agent rerouting). It never decorates. Honour `prefers-reduced-motion`.

**U5. Accessibility.** Keyboard-operable controls, visible focus, labelled inputs, sufficient contrast, no information only in the 3D view that is absent from the panels.

**U6. Performance is design.** The budget in SPEC section 10 is a requirement. Measure before adding effects. A smooth simple scene beats a stuttering rich one.

**U7. Language.** All user-facing strings go through the i18n layer. English first; Hindi must not require refactoring.

## G. Definition of done

A change is done when:

- Typecheck, lint, and tests pass
- The relevant doc is updated
- New on-screen numbers have units and tags (P3)
- Nothing violates P1 to P6, C1 to C12, D1 to D7
- It meets the performance budget on the reference machine
