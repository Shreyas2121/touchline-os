# NM-G07 — Native campaign/squad/tactics/board writes

## 1. Context and authority

Master 3.0.0 → [native migration plan](../native-migration.md) → this guide.
Predecessor: NM-G06; locate its subject in the bridge progress log and verify its commit is an ancestor.
Commit: `feat(nm-g07): execute career management in rust`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Restore current campaign, squad, tactics, registration, board and shortlist writes natively with atomicity and guard parity.

## 3. Preconditions

Read master, DEC-002 and bridge plan. Inspect git status; preserve completed P07-G01–G05 and unrelated work. Verify predecessor evidence before code. Introduce only dependencies assigned to this guide, with verified versions/lockfiles. Missing future feature is an unavailable state, never permission to fall back to Dexie.

## 4. Files to inspect

- Current create/start/reset/rename/archive/delete campaign commands
- Current player add/update/note, lineup save/delete, registration, constitution and shortlist commands
- run-command/run-in-transaction and guard tests
- NM-G03 transaction/receipt support and NM-G04/G05 pure rules/preparation

Paths under new native directories exist only after their introducing guide; do not assume future files are already implemented.

## 5. Files to create/modify

- game-app campaign and management command services
- game-store narrow transactional mutations used by these services
- Thin Tauri command bindings and GameClient mutation methods
- Existing forms/handlers enabled for ported native operations
- Rust fault/retry/guard tests and component/native integration coverage

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Port campaign create/rename/archive/delete/reset with isolated scope and separate legacy/standalone demos. Newly prepared career insertion is one transaction over all required rows.
2. Implement initialization receipt/fingerprint retries without regeneration, duplicate allocation/audit or misleading revision. Different-content ID collision fails.
3. Port player add/update/notes, lineup save/delete, registration, board policy and shortlist operations with existing allowed-mode semantics.
4. Challenge policy changes and standalone manual player/club changes remain forbidden; Sandbox policy edits cannot mint a second opening allocation. Planning notes do not directly change attributes/ownership.
5. Recheck revision/ownership/policies inside commit, keep CPU generation outside, and return actual persisted revision. Rejection/fault writes nothing.
6. Connect forms to native commands, refresh authoritative queries after success and preserve existing keyboard/accessibility flow.
7. Do not enable legacy finance/match/deal operations until NM-G08, or add Continue during this bridge.

## 7. Tests to add/change

- Full native 72-club career insertion/retry/collision and injected partial-write rollback.
- Every management action's existing behavior/validation and one audit/revision per new action.
- Direct Rust Challenge/standalone/cross-campaign rejection with no side effects.
- Sandbox allocation, registration defaults/confirmation, lineup uniqueness and cleanup.
- Delete/reset removes only selected campaign including new stores; source browser remains unchanged.

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

1. Create native Challenge and Sandbox careers; save notes/lineup/registration/shortlist, reject a Challenge edit and edit Sandbox without extra money.
2. Close/relaunch, verify persistence, then reset one test demo without affecting another.

## 10. Definition of done

- [ ] The narrow outcome is implemented and verified.
- [ ] Source/browser data and completed guide history are preserved.
- [ ] Required parity, negative and rollback checks pass.
- [ ] No new gameplay or false native/release claim is introduced.
- [ ] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
feat(nm-g07): execute career management in rust
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

NM-G08 ports remaining legacy commands. Continue and simulated market/matches still do not exist.
