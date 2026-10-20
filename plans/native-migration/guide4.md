# NM-G04 — Rust policies, money, selection and calendar

## 1. Context and authority

Master 3.0.0 → [native migration plan](../native-migration.md) → this guide.
Predecessor: NM-G03; locate its subject in the bridge progress log and verify its commit is an ancestor.
Commit: `feat(nm-g04): port foundational rules to rust`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Port existing foundational business rules and calendar to pure Rust with exact golden parity.

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
- Rust compatibility tests consuming NM-G01 fixtures

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Port integer-cent parsing/calculation/rounding with checked arithmetic and JS-safe transport bounds. Preserve unknown/null cases and reversal/season scoping.
2. Port date bounds/leap logic, current-age estimates, supported formation slot/position semantics and roster/registration checks. UI SVG drawing/formatting can remain TS.
3. Port evaluateAction presets, verdicts, severity/evidence/remedies, qualification ratios and current Challenge/standalone guards without changing behavior.
4. Reproduce hashSeed using UTF-16 code units and wrapping u32 operations, mulberry32 draws, stream namespaces and exact JSON fingerprint content. Do not use default Rust RNG or unordered iteration.
5. Port pure calendar/window/cursor preview functions only. Continue persistence remains blocked until the bridge completes.
6. Keep core free of store/Tauri/filesystem/ambient clock/network. Expose pure APIs for app-service previews/commit checks.
7. Compare to fixed fixtures, including Unicode/astral seeds and overflow/date boundaries. Document a discovered pre-existing bug rather than silently changing the oracle.

## 7. Tests to add/change

- Exact PRNG/stream/hash/fingerprint vectors and namespace independence.
- Money/floor/reversal/budget/age/wage/prestige/registration vectors and invalid data.
- Calendar July→deadline→kickoff preview and consumed-boundary cases, leap/century/year bounds.
- Cross-campaign/Challenge/standalone guard decisions and unique selection behavior.
- Core dependency and ambient-time/randomness checks.

Prefer compatibility/integration properties over tests that mirror implementation. Keep golden data independent of the Rust port.

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

1. Review Rust vs JS fixture differences; zero unexplained differences are permitted.
2. Confirm this guide has no store writes or clock-advance command.

## 10. Definition of done

- [ ] The narrow outcome is implemented and verified.
- [ ] Source/browser data and completed guide history are preserved.
- [ ] Required parity, negative and rollback checks pass.
- [ ] No new gameplay or false native/release claim is introduced.
- [ ] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
feat(nm-g04): port foundational rules to rust
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

NM-G05 reuses the pure core for exact world generation and career preparation. New engine features remain deferred.
