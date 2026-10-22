# NM-G03 — SQLite persistence, import and consistent backups

## 1. Context and authority

Master 3.0.0 → [native migration plan](../native-migration.md) → this guide.
Predecessor: NM-G02; locate its subject in the bridge progress log and verify its commit is an ancestor.
Commit: `feat(nm-g03): persist migrated campaigns in sqlite`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Implement real SQLite persistence, transactional source import and consistent export/backup before connecting native gameplay screens.

## 3. Preconditions

Read master, DEC-002 and bridge plan. Inspect git status; preserve completed P07-G01–G05 and unrelated work. Verify predecessor evidence before code. Introduce only dependencies assigned to this guide, with verified versions/lockfiles. Missing future feature is an unavailable state, never permission to fall back to Dexie.

## 4. Files to inspect

- NM-G01 snapshots/limits and NM-G02 serde models/crate boundaries
- Frozen Dexie indexes and all existing repository invariants
- Current campaign/season references and valid incomplete legacy shapes
- rusqlite bundled/backup APIs and SQLite FK/migration behavior

Paths under new native directories exist only after their introducing guide; do not assume future files are already implemented.

## 5. Files to create/modify

- src-tauri/migrations/0001_initial.sql and migration metadata
- game-store repositories, DTO mappings and dedicated connection worker
- game-store snapshot import/export and consistent backup services
- Transport import-receipt table separate from gameplay receipts
- Temporary-file SQLite migration/import/backup integration tests

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Introduce verified/pinned rusqlite bundled SQLite and backup support. SQLite starts independent schema 1; never edit or increment source Dexie schemas.
2. Map all 23 game stores with typed IDs/money/date/status/indexed fields and appropriate JSON nested columns. Preserve valid legacy incomplete records; no whole-campaign blob.
3. Enforce scoped FK/unique constraints, active season/ordinal, registration/profile/receipt/audit identity. Test actual campaign↔season insertion ordering/deferred constraints; do not disable validation.
4. One worker owns the connection. Reads/writes compose through bounded transactions; no heavy compute or asynchronous UI wait while holding connection/transaction.
5. Parse/validate source indexeddb 1/2 and native sqlite 1 envelopes before one atomic import. Preserve gameplay IDs/revisions/audits/seeds/fingerprints exactly; normalize only allowed v1 metadata.
6. Record source-byte SHA-256 in a separate transport receipt. Same-file retry returns the existing import outcome without overwriting later changes; different-content campaign-ID collision refuses.
7. Add complete native snapshot export from a consistent read and online-backup to a separate file. Validate/reopen backup and preserve the previous good target on failure.
8. Use injected test paths; integrate stable native app-local path providers without writing into install assets. Unsupported future schemas refuse cleanly. IPC/dialog exposure arrives in NM-G06.

## 7. Tests to add/change

- Real fresh schema and forward-upgrade fixture, FK/unique/index enforcement and invalid relationship rejection.
- All source snapshots round-trip all 23 store arrays and null/optional/money/mode/revision semantics.
- Injected import/transaction failure leaves no partial campaign or receipt; another save unchanged.
- Same-file retry after subsequent campaign modification cannot restore older rows.
- Collision/oversized/unsafe-number/future-version files fail before promotion.
- Native export/online backup can reopen and reproduce consistent data, including with journaling enabled.

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

1. Use an isolated Rust test harness to import each synthetic source fixture, close/reopen and compare counts/values.
2. Create/reopen a backup; verify source browser/export files remain unchanged.

## 10. Definition of done

- [x] The narrow outcome is implemented and verified.
- [x] Source/browser data and completed guide history are preserved.
- [x] Required parity, negative and rollback checks pass.
- [x] No new gameplay or false native/release claim is introduced.
- [x] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
feat(nm-g03): persist migrated campaigns in sqlite
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

NM-G04 can use validated persisted models but must not couple pure rules to SQLite. Native UI import/read services are still pending.
