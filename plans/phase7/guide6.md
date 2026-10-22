# P07-G06 — Advance native careers deterministically

## 1. Context and authority

- Master 3.0.3 / DEC-003 / DEC-004 / DEC-005 §§4.6, 7.1, 8 and 9; parent [Phase 7](../phase7.md).
- Historical predecessor: completed P07-G05 at `df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3`.
- **Mandatory prerequisite:** [native migration bridge](../native-migration.md) through committed NM-G09 with passed cutover gate.
- Commit: `feat(p07-g06): advance native careers deterministically`.

This guide remains Continue. It cannot start on the web/Dexie stack or perform the migration itself.

## 2. Goal and user-observable result

In the migrated native application, Continue advances July 1 → August 31 summer deadline → September 1 kickoff exactly once. State survives close/relaunch. At kickoff the app states `Match simulation arrives in Phase 8.`

## 3. Preconditions

Read bridge §10 and verify actual NM-G09 SHA/checks/gate PASS. Confirm native standalone correctness, manual-workflow retirement, SQLite import/backup/reopen and generated DTOs. A pending/missing gate means do not execute this guide.

Inspect working tree; preserve completed G01–G05 files and browser source data. No new dependency, TS progression engine, Dexie schema, fixture engine or migration redesign.

## 4. Files to inspect

- Rust game-core calendar/random and native correctness/reproducibility tests from NM-G04; JS vectors are optional references under DEC-003.
- game-app current command/retry/guard use cases.
- game-store simulation-state/receipt and optimistic transaction APIs.
- Thin Tauri command registration and GameClient/generated DTOs.
- Native Command Center and existing structured error/loading behavior.
- Bridge Rust/SQLite integration suites, source snapshots and cutover evidence.

These native paths are created by the bridge, not present at the initial G05 code checkpoint.

## 5. Files to create/modify

- game-core progression preview/operation identity helpers.
- game-app preview-time/advance-time services.
- game-store narrow state/receipt atomic commit.
- Thin Tauri preview/advance commands and generated DTO/GameClient methods.
- Command Center: Game date, Next event, Continue and kickoff stop.
- Rust calendar/advance fault/retry and store-reopen integration tests, plus frontend unit/integration tests.
- README and phase progress evidence.

Request includes campaign ID, expected revision, source date/cursor and target boundary identity. It cannot supply an arbitrary future date or precomputed result.

## 6. Implementation steps

1. Load authoritative standalone campaign, active season and clock; validate supported versions and current ownership/mode.
2. Use the ported pure preview. July 1/no cursor targets summer deadline; consumed August 31 targets kickoff; consumed September 1 league state is blocked.
3. Define a stable operation key from logical season/boundary. Fingerprint critical source date/cursor, target and input revision; exclude fresh request/action/audit IDs and timestamps.
4. Matching logical receipt returns the existing operation reference and actual persisted revision without changing state. On retry after later progress, refresh/read current clock; never present the old target as a rollback. A different fingerprint for the same operation is not a harmless retry.
5. For a new event, compare expected source/target with the authoritative next boundary. Stale/conflicting/unsupported/backwards input fails.
6. Recheck source/revision/receipt in the short DB-worker transaction. Write clock date/cursor/phase, receipt, audit and one revision increment together. Returning a prior receipt must not report a fictitious increment.
7. No match/player/contract/registration/money changes occur. At kickoff UI and direct service both stop with the exact Phase 8 message.
8. Wire GameClient native preview/advance, disable duplicate submission, show structured failure/stale-state remedy and refresh after persisted success.
9. Never advance on mount, polling, focus, relaunch or wall-clock time. Preserve standalone guards and read-only historical manual saves; no retired workflow is restored.

## 7. Tests to add/change

- Both transitions, cursor/phase, stable keys/seeds and one audit/receipt/revision per new event.
- Replay the first request after the second: original receipt, no state regression or extra event.
- Altered fresh transport IDs do not produce another operation; altered critical fingerprint/stale source fails.
- Concurrent same-event calls produce one effect, whether another call returns a replay or conflict.
- Inject transaction failure: no partial clock/cursor/revision/audit/receipt.
- UI remount and real SQLite store close/reopen preserve time. Different audit time has no gameplay effect.
- Kickoff direct service refuses; other entity/finance/history rows stay unchanged.
- Historical manual saves refuse progression and editing without changing rows/revision; campaign isolation remains intact.

## 8. Verification commands

The bridge must already have introduced these scripts:

```bash
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

Run focused Rust/UI progression unit/integration tests first. No mocked invoke test can replace real SQLite integration checks. Unit/integration tests and the listed code/build checks are sufficient; desktop/browser E2E and manual sign-off are not required (DEC-005).

## 9. Acceptance coverage

Unit/integration tests cover July 1 creation, both transitions, consumed deadlines, persisted clock after store reopen, kickoff refusal, replay after later progress and historical-save preservation. No desktop session, manual checklist or user sign-off is required.

## 10. Definition of done

- [ ] NM-G09 gate verified before implementation.
- [ ] Rust preview/command/UI agree; no TS/Dexie authority.
- [ ] Retry/concurrency/rollback/SQLite store-reopen integration checks pass.
- [ ] Kickoff is a guarded hard stop.
- [ ] No new match/market/lifecycle or migration work concealed here.
- [ ] README and Phase 7 evidence match actual implementation.

## 11. Commit instructions

```text
feat(p07-g06): advance native careers deterministically
```

Stage only this guide's files and progress row. Record actual SHA/checks; do not overwrite bridge evidence or completed guide files.

## 12. Handoff

P07-G07 certifies the whole native foundation with progression. Phase 8 still requires its own plan/guides and Rust fixture/result engine; do not bypass the kickoff stop.
