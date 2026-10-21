# P07-G07 — Verify native standalone foundations

## 1. Context and authority

Master 3.0.2 / DEC-003 / DEC-004 §§9/12; [Phase 7](../phase7.md); predecessor P07-G06 `feat(p07-g06): advance native careers deterministically` plus passed NM-G09 bridge.

Commit: `test(p07-g07): verify native standalone foundations`.

## 2. Goal and user-observable result

Certify the completed native foundation after migration and Rust Continue: existing saves/workflows stay intact, time advances once and the game stops at kickoff. This is the gate before Phase 8.

## 3. Preconditions

Verify bridge NM-G09 and P07-G06 commits/actual checks. Do not use certification to implement missing migration, fixtures, AI, development or rollover. Fix foundation regressions without weakening constraints or changing golden data.

## 4. Files to inspect

- Phase 7 and bridge acceptance/progress logs and active guides.
- Rust core/calendar/generator golden tests, SQLite import/retry/backup/fault tests.
- Native GameClient/commands and direct-call guards.
- Desktop E2E harness and release/test feature configuration.
- README, DEC-002 and actual supported-version/platform notes.

## 5. Files to create/modify

- Cross-feature Rust integration tests for any remaining foundation gaps.
- Native E2E foundation journey including imported/current saves and progression/relaunch.
- UI progression/blocker tests only where useful.
- README, Phase 7 progress and Phase 8 handoff.

Reuse meaningful earlier tests. Do not duplicate every implementation function or rewrite completed guide files.

## 6. Implementation steps

1. Audit native standalone correctness and bridge evidence; save preservation, deterministic generation and receipt semantics remain protected. Old-output equality and manual-feature parity are not gates.
2. Exercise source standalone import, native new career and guarded management through the actual native app. Historical manual saves remain inspectable/exportable with unchanged rows; direct editing and progression refuse. No working manual-play workflow is required.
3. Advance to deadline/kickoff with close/relaunch; verify matching retries/stale conflicts and hard stop. No unrelated player/finance/history changes.
4. Check export/consistent backup/reopen and campaign/reset isolation after progression. Source browser data is unchanged.
5. Confirm generated bindings and IPC screen projections are current and desktop runtime has no Dexie fallback or raw SQL API.
6. Run native tests with isolated app paths/test-only automation; build and smoke the normal artifact without that instrumentation.
7. Record actual commands/results/support limitations. Frontend/browser passes do not imply packaged Rust/SQLite success.
8. Mark phase complete only after every required gate passes; hand off to Phase 8 planning.

## 7. Tests to add/change

- Actual create/import/read/write/advance/relaunch foundation journey.
- Retry/concurrency/failure and cross-campaign isolation where not already proven.
- Retained Challenge/Sandbox/standalone guard behavior after advancement.
- Snapshot/backup reflects latest clock and can reopen without duplicating receipts.
- Kickoff has explicit future-feature state; no fabricated matches/AI/growth/rollover.
- Normal release artifact excludes test automation; browser exporter compatibility remains.

## 8. Verification commands

```bash
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
pnpm test:desktop
```

Run relevant browser compatibility E2E when changed. Record targeted/full native results and manual normal-artifact smoke; do not claim Phase 13 installer/updater or untested-platform certification.

## 9. Manual acceptance check

Follow Phase 7 §8 journey in the native app. Check preserved read-only historical data, a new fixed-seed standalone career, Challenge rejection/Sandbox edit, persisted deadline/kickoff and restart, export/backup, isolated standalone demo reset and source preservation.

## 10. Definition of done

- [ ] NM bridge and P07-G06 evidence verified.
- [ ] Native acceptance criteria and required checks pass.
- [ ] Completed G01–G05 artifacts and evidence remain unchanged.
- [ ] Source/backup/history/versions and native authority preserved.
- [ ] Time progresses once and stops at kickoff.
- [ ] No match engine, full-season or broad release claim.
- [ ] Phase 8 handoff accurately names Rust/SQLite/IPC contracts.

## 11. Commit instructions

```text
test(p07-g07): verify native standalone foundations
```

Stage only related tests/fixes/docs and phase evidence. Record actual SHA/checks; a narrow follow-up evidence commit is allowed. Do not mark complete while required native gates fail.

## 12. Handoff

Generate `plans/phase8.md` and all its guides from master 3.0.2 before implementation. Add fixture/result/performance contracts through a later SQLite migration and one pure Rust engine for managed/AI matches. Market/lifecycle/analytics/import/release remain Phases 9–13.
