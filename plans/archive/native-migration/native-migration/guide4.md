# NM-G04 — Rust policies, money, selection and calendar

## 1. Context and authority

Master 3.0.1 / DEC-003 → [native migration plan](../native-migration.md) → this guide. The user's clarification removes exact compatibility with previous business logic; native correctness and intended rules govern this implementation.
Predecessor: NM-G03; locate its subject in the bridge progress log and verify its commit is an ancestor.
Commit: `feat(nm-g04): port foundational rules to rust`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Implement foundational business rules and calendar in pure Rust with direct correctness and determinism tests. Previous TypeScript logic is a reference, not a compatibility obligation.

## 3. Preconditions

Read master, DEC-002 and bridge plan. Inspect git status; preserve completed P07-G01–G05 and unrelated work. Verify predecessor evidence before code. Introduce only dependencies assigned to this guide, with verified versions/lockfiles. Missing future feature is an unavailable state, never permission to fall back to Dexie.

## 4. Files to inspect

- src/domain/models/{money,dates,positions}.ts
- src/domain/rules/** and finance/**
- src/domain/player/lineup-draft.ts, registration-draft.ts and relevant age/selection helpers
- src/domain/simulation/{schemas,random,calendar}.ts
- Current guard/default/Strict presets and committed compatibility vectors

Paths under new native directories exist only after their introducing guide; do not assume future files are already implemented.

## 5. Files to create/modify

- game-core models/validation, money/date/position modules
- game-core policy, finance, lineup/registration and calendar/random modules
- Rust rule, arithmetic, selection, guard and determinism tests; historical fixtures may supply synthetic input data

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Port integer-cent parsing/calculation/rounding with checked arithmetic and JS-safe transport bounds. Preserve unknown/null cases and reversal/season scoping.
2. Port date bounds/leap logic, current-age estimates, supported formation slot/position semantics and roster/registration checks. UI SVG drawing/formatting can remain TS.
3. Implement presets, policy verdicts, severity/evidence/remedies, qualification ratios and Challenge/standalone guards according to intended product rules. Previous behavior and wording need not match.
4. Use explicit deterministic seed hashing, PRNG draws, independent stream namespaces and ordered fingerprint content. Existing UTF-16/u32/mulberry32 algorithms may be reused as a sound implementation choice, without making old-world equality a requirement.
5. Port pure calendar/window/cursor preview functions only. Continue persistence remains blocked until the bridge completes.
6. Keep core free of store/Tauri/filesystem/ambient clock/network. Expose pure APIs for app-service previews/commit checks.
7. Test Unicode/astral seeds, integer percentage flooring, overflow/date boundaries and rule/selection/guard invariants. Correct previous implementation quirks where appropriate and document native decisions.

## 7. Tests to add/change

- Native PRNG/stream/hash/fingerprint reproducibility and namespace independence.
- Money/floor/reversal/budget/age/wage/prestige/registration vectors and invalid data.
- Calendar July→deadline→kickoff preview and consumed-boundary cases, leap/century/year bounds.
- Cross-campaign/Challenge/standalone guard decisions and unique selection behavior.
- Core dependency and ambient-time/randomness checks.

Prefer externally meaningful properties and integration tests over tests that mirror implementation. Historical TypeScript golden fixtures remain reference material; exact old-output equality is not required.

## 8. Verification commands

Run focused new tests first, then:

```bash
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

The native scripts are introduced by NM-G02. Missing prerequisites or failed native checks must be resolved; a frontend/mock pass is not a substitute.
Run relevant browser compatibility/E2E when its flows are touched; NM-G09 records the complete cutover evidence.

## 9. Manual acceptance check

1. Review native rule/arithmetic/selection decisions and their direct correctness tests; previous-logic differences do not block acceptance.
2. Confirm this guide has no store writes or clock-advance command.

## 10. Definition of done

- [x] The narrow outcome is implemented and verified.
- [x] Source/browser data and completed guide history are preserved.
- [x] Required correctness, negative and side-effect checks pass.
- [x] No new gameplay or false native/release claim is introduced.
- [x] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
feat(nm-g04): port foundational rules to rust
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

NM-G05 reuses the pure core for valid deterministic world generation and career preparation. Exact previous-world equality is not required. New engine features remain deferred.
