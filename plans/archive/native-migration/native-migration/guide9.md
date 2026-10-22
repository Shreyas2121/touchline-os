# NM-G09 — Native cutover and compatibility certification

## 1. Context and authority

Master 3.0.3 / DEC-003 / DEC-004 / DEC-005 → [native migration plan](../native-migration.md) → this guide. Certification covers the standalone product and save-data preservation, not previous-logic equality or continued manual campaign gameplay.
Predecessor: revised NM-G08 `refactor(nm-g08): retire manual campaign workflows`; locate its actual commit in the bridge progress log and verify it is an ancestor. The canceled manual-workflow port is not a prerequisite.
Commit: `test(nm-g09): certify the native migration bridge`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Certify the standalone native foundations and retirement of manual workflows, then release the explicit gate for Phase 7 Guide 6. Previously stored manual saves remain preserved/read-only; a working manual-play journey is not required.

## 3. Preconditions

Read master, DEC-002/003/004/005 and bridge plan. Inspect git status; preserve completed P07-G01–G05 and unrelated work. Verify predecessor evidence before code. Unit/integration tests satisfy testing gates under DEC-005; no new automation dependencies are needed. Missing future feature is an unavailable state, never permission to fall back to Dexie.

## 4. Files to inspect

- Every NM guide and bridge acceptance/progress log
- Supported standalone service inventory, retired manual paths and relevant tests
- SQLite migration/import/export/backup and native core correctness suites
- Tauri capabilities/release configuration and original browser exporter

Paths under new native directories exist only after their introducing guide; do not assume future files are already implemented.

## 5. Files to create/modify

- Cross-feature native integration tests only where coverage is missing
- Frontend unit/integration tests only where coverage is missing
- README/bridge progress and explicit cutover gate evidence

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Audit the GameClient inventory: every supported standalone read/write has an authoritative native path. Manual creation/demo/editing paths are absent or reject direct calls, including retries. No TS gameplay fallback, arbitrary SQL or accidentally callable retired handler.
2. Audit existing Rust and frontend unit/integration coverage. Add meaningful missing cases using synthetic fixtures and temporary SQLite paths; no desktop automation or dedicated test binary is required.
3. Run source-export/import integration tests, same-file retry/collision/rollback, native core/world correctness and reproducibility, allowed management writes, retired-command refusal and source preservation checks. Historical manual rows remain inspectable/exportable without edits, regeneration or conversion. No previous-logic or manual-feature parity gate remains.
4. Close/reopen real SQLite stores in integration tests and verify imported/new careers, revisions/receipts and consistent backup/reopen. Frontend mocks do not replace these Rust integration tests.
5. Build the normal native artifact; record the actual build target without claiming installer interaction, other OS/signing/updater coverage. No packaged-app smoke, manual test or user sign-off is required.
6. Confirm game date remains July 1 and no Continue/fixtures/AI/growth/rollover was added while migrating.
7. Run full required checks; update README to verified native workflow coverage. Record all NM SHAs/results and gate PASS only when every required item actually passes.
8. Handoff to P07-G06; do not implement its progression here or skip straight to Phase 8.

## 7. Tests to add/change

- Rust application/storage integration for import/new career/read/write/store reopen with real temporary SQLite files.
- Consistent native backup/export, failed/colliding/repeated import and source preservation.
- Direct Rust rule/scope/mode guards and dependency/capability boundaries.
- Frontend unit/integration regression coverage plus native rule/world correctness and reproducibility; production configuration remains free of test instrumentation.

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
Unit/integration tests and the listed code/build checks are sufficient. Existing browser E2E is optional. Do not add a desktop automation setup, manual checklist or pending manual-testing gate (DEC-005).

## 9. Acceptance coverage

Use unit/integration results for the criteria above, including saved-row preservation, fixed-seed creation, permitted management, retired-command refusal, store/backup reopen and unchanged July 1. No actual desktop session or manual sign-off is required.

## 10. Definition of done

- [x] The narrow outcome is implemented and verified.
- [x] Source/browser data and completed guide history are preserved.
- [x] Standalone correctness, retired-command refusal, preservation and rollback checks pass.
- [x] No new gameplay or false native/release claim is introduced.
- [x] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
test(nm-g09): certify the native migration bridge
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

Only a committed passed NM-G09 gate authorizes P07-G06 Rust Continue. P07-G07 then certifies the complete foundation before Phase 8.

Completed on 2026-10-22. See the archived bridge progress log for the service audit, actual checks and PASS gate. This guide is implementation history; the next active task is P07-G06.
