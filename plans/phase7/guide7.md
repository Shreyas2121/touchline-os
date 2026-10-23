# P07-G07 — Verify native standalone foundations

## 1. Context and authority

Master 3.0.4 / DEC-003 / DEC-004 / DEC-005 / DEC-006 §§9/12; [Phase 7](../phase7.md); predecessor P07-G06 `feat(p07-g06): advance native careers deterministically` plus passed NM-G09 bridge and completed P07-G07a standalone-only cleanup.

Commit: `test(p07-g07): verify native standalone foundations`.

## 2. Goal and user-observable result

Certify the completed native foundation after migration and Rust Continue: existing saves/workflows stay intact, time advances once and the game stops at kickoff. This is the gate before Phase 8.

## 3. Preconditions

Verify bridge NM-G09, P07-G06 and P07-G07a commits/actual checks. P07-G07a is the required forward cleanup under DEC-006; do not certify while it is pending. Do not use certification to implement missing migration, fixtures, AI, development or rollover. Fix foundation regressions without weakening constraints or changing golden data.

## 4. Files to inspect

- Phase 7 and bridge acceptance/progress logs and active guides.
- Rust core/calendar/generator golden tests, SQLite import/retry/backup/fault tests.
- Native GameClient/commands and direct-call guards.
- Rust/SQLite integration suites and production Tauri configuration.
- README, DEC-002 and actual supported-version/platform notes.

## 5. Files to create/modify

- Cross-feature Rust integration tests for any remaining foundation gaps.
- Rust application/storage foundation integration coverage including supported standalone saves, progression and store reopen.
- UI progression/blocker tests only where useful.
- README, Phase 7 progress and Phase 8 handoff.

Reuse meaningful earlier tests. Do not duplicate every implementation function or rewrite completed guide files.

## 6. Implementation steps

1. Audit native standalone correctness and bridge evidence; supported standalone save integrity, deterministic generation and receipt semantics remain protected. Old-output equality, manual-feature parity and old-save preservation are not gates.
2. Exercise supported standalone snapshot import, native new career and guarded management through Rust application/storage integration tests. Only standalone saves are supported. Confirm manual-mode types, old-save readers, v1 normalization and compatibility-only APIs/tests have been removed; unsupported inputs are rejected without altering user files.
3. Advance to deadline/kickoff with real SQLite store close/reopen; verify matching retries/stale conflicts and hard stop. No unrelated player/finance/history changes.
4. Check export/consistent backup/reopen and campaign/reset isolation after progression. No old-save preservation check is required.
5. Confirm generated bindings and IPC screen projections are current and desktop runtime has no Dexie fallback or raw SQL API.
6. Run unit/integration tests with isolated temporary DB/file paths and build the normal artifact. No desktop automation, dedicated test binary or manual smoke is required (DEC-005).
7. Record actual commands/results/support limitations. Frontend mocks do not replace real Rust/SQLite integration tests, and build success does not claim installer interaction.
8. Mark phase complete only after every required gate passes; hand off to Phase 8 planning.

## 7. Tests to add/change

- Rust create/import/read/write/advance/store-reopen foundation integration coverage.
- Retry/concurrency/failure and cross-campaign isolation where not already proven.
- Retained Challenge/Sandbox/standalone guard behavior after advancement.
- Snapshot/backup reflects latest clock and can reopen without duplicating receipts.
- Kickoff has explicit future-feature state; no fabricated matches/AI/growth/rollover.
- Production configuration remains free of test instrumentation; supported standalone snapshot unit/integration coverage remains.

## 8. Verification commands

```bash
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

Unit/integration tests and the listed code/build checks are sufficient. Existing browser E2E is optional. Record actual results; do not claim installer interaction, updater or untested-platform certification. No manual testing or sign-off is required (DEC-005).

## 9. Acceptance coverage

Use Phase 7 §8 unit/integration coverage for standalone-only contracts, fixed-seed creation, Challenge rejection/Sandbox edit, persisted deadline/kickoff after store reopen, export/backup, isolated standalone demo reset and supported standalone save integrity. No desktop session, manual checklist or user sign-off is required.

## 10. Definition of done

- [x] NM bridge, P07-G06 and P07-G07a evidence verified.
- [x] No runtime manual mode, legacy generator/demo, v1 normalization or historical-save workspace remains.
- [ ] Native acceptance criteria and required checks pass.
- [x] Completed G01–G05 artifacts and evidence remain unchanged.
- [x] Supported standalone snapshot/backup/clock/receipt integrity and native authority verified.
- [x] Time progresses once and stops at kickoff.
- [ ] No match engine, full-season or broad release claim.
- [ ] Phase 8 handoff accurately names Rust/SQLite/IPC contracts.

## 11. Commit instructions

```text
test(p07-g07): verify native standalone foundations
```

Stage only related tests/fixes/docs and phase evidence. Record actual SHA/checks; a narrow follow-up evidence commit is allowed. Do not mark complete while required native gates fail.

## 12. Handoff

Phase 8 and its six guides are written in [plans/phase8.md](../phase8.md). Do not regenerate them. Implement [P08-G01](../phase8/guide1.md) next. Fixture, result, and appearance contracts land through a later SQLite migration and one pure Rust engine for managed and AI matches. Market, lifecycle, analytics, import, and release remain Phases 9–13.
