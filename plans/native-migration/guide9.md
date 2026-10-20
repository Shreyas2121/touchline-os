# NM-G09 — Native cutover and compatibility certification

## 1. Context and authority

Master 3.0.0 → [native migration plan](../native-migration.md) → this guide.
Predecessor: NM-G08; locate its subject in the bridge progress log and verify its commit is an ancestor.
Commit: `test(nm-g09): certify the native migration bridge`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Certify that the existing G05 application has migrated successfully, then release the explicit gate for Phase 7 Guide 6.

## 3. Preconditions

Read master, DEC-002 and bridge plan. Inspect git status; preserve completed P07-G01–G05 and unrelated work. Verify predecessor evidence before code. Introduce only dependencies assigned to this guide, with verified versions/lockfiles. Missing future feature is an unavailable state, never permission to fall back to Dexie.

## 4. Files to inspect

- Every NM guide and bridge acceptance/progress log
- Native service inventory and all current G05 feature tests
- SQLite migration/import/export/backup and core parity suites
- Tauri capabilities/release configuration and original browser exporter

Paths under new native directories exist only after their introducing guide; do not assume future files are already implemented.

## 5. Files to create/modify

- desktop-e2e/ native migration/current-workflow journeys
- Test-only native automation configuration and pnpm test:desktop
- Cross-feature native integration tests only where coverage is missing
- README/bridge progress and explicit cutover gate evidence

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Audit the GameClient inventory: every previously usable G05 read/write has an authoritative native path; no TS gameplay fallback, arbitrary SQL or forgotten manual handler.
2. Add real native desktop automation using current official Tauri/WebdriverIO service. Use isolated paths/test-only instrumentation; exclude automation from normal release builds.
3. Run source-export/import, same-file retry/collision/rollback, exact core/world parity, current writes, direct-call guards and source preservation checks.
4. Close/relaunch actual app and verify imported/new careers, revisions/receipts and backup/reopen. Browser/mocked tests are labeled as compatibility only.
5. Build/smoke the normal native artifact as well as the dedicated E2E test binary; record Windows support honestly and do not claim other OS/signing/updater release coverage.
6. Confirm game date remains July 1 and no Continue/fixtures/AI/growth/rollover was added while migrating.
7. Run full required checks; update README to verified native G05 parity. Record all NM SHAs/results and gate PASS only when every required item actually passes.
8. Handoff to P07-G06; do not implement its progression here or skip straight to Phase 8.

## 7. Tests to add/change

- Actual Tauri/SQLite import/new career/read/write/relaunch journey.
- Consistent native backup/export, failed/colliding/repeated import and source preservation.
- Direct Rust rule/scope/mode guards and dependency/capability boundaries.
- Current browser compatibility plus Rust golden parity, with no test instrumentation in normal build.

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
pnpm test:desktop
```

The native scripts are introduced by NM-G02. Missing prerequisites or failed native checks must be resolved; a frontend/mock pass is not a substitute.
Run relevant browser compatibility/E2E when its flows are touched; NM-G09 records the complete cutover evidence.

## 9. Manual acceptance check

1. Export from original browser, import native, run existing workflows, create fixed-seed career and relaunch.
2. Inspect preserved browser data, native backup and normal release artifact; verify July 1 is unchanged and no Continue yet.

## 10. Definition of done

- [ ] The narrow outcome is implemented and verified.
- [ ] Source/browser data and completed guide history are preserved.
- [ ] Required parity, negative and rollback checks pass.
- [ ] No new gameplay or false native/release claim is introduced.
- [ ] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
test(nm-g09): certify the native migration bridge
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

Only a committed passed NM-G09 gate authorizes P07-G06 Rust Continue. P07-G07 then certifies the complete foundation before Phase 8.
