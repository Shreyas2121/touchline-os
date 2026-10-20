# NM-G08 — Native legacy match/finance/market parity

## 1. Context and authority

Master 3.0.0 → [native migration plan](../native-migration.md) → this guide.
Predecessor: NM-G07; locate its subject in the bridge progress log and verify its commit is an ancestor.
Commit: `feat(nm-g08): preserve legacy workflows on sqlite`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Preserve all currently usable legacy match, finance, offer, transfer and contract workflows on Rust/SQLite.

## 3. Preconditions

Read master, DEC-002 and bridge plan. Inspect git status; preserve completed P07-G01–G05 and unrelated work. Verify predecessor evidence before code. Introduce only dependencies assigned to this guide, with verified versions/lockfiles. Missing future feature is an unavailable state, never permission to fall back to Dexie.

## 4. Files to inspect

- Current record-match.ts and matches/appearance repositories
- record-offer/accept-offer/reject-offer and record-transfer commands
- save-contract, post-ledger-entry, reverse-ledger-entry and finance previews
- Current record-match/offers/record-transfer/save-contract/ledger/finance invariant tests

Paths under new native directories exist only after their introducing guide; do not assume future files are already implemented.

## 5. Files to create/modify

- game-app legacy match/finance/market/contract services
- game-store related atomic mutations
- Tauri/GameClient legacy methods and existing native UI handlers
- Rust command-parity/fault/guard tests

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Port legacy manual journal/appearances with existing xG milli-units, missing minutes/rating semantics and duplicate/ownership checks. Do not create simulated fixtures.
2. Port opening/prize posts and reversals using current season/typed-ledger rules; keep transfer-linked entries and allocations protected.
3. Port existing recorded offers/accept/reject/completed moves/contracts with roster, ledger, contract, lineup and audit atomicity. Preserve current legacy scope; do not add autonomous AI or claim Phase 9 negotiation/two-club economics.
4. Re-evaluate rules/expected revision at commit; preserve required warning acknowledgement and qualifying-bid rejection behavior.
5. Standalone manual match/offer/transfer/contract/ledger commands still reject through direct Rust calls. Mode isolation is mandatory even when UI hides forms.
6. Connect remaining native legacy forms, retain existing result/error messages, and refresh persisted query state.
7. Add failure injection and meaningful parity cases. Do not weaken old tests or silently fix game behavior during port.

## 7. Tests to add/change

- Native manual match/appearance/xG and duplicate/cross-campaign cases.
- Sale-to-buy, rejected signing, prestige offer, free move, active contract and reversal parity.
- Atomic failure leaves no split roster/contract/ledger/audit state.
- Standalone/Challenge guards and actual revision consistency.
- All previously usable native legacy forms work after relaunch; no AI-generated bid/match/lifecycle data.

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

1. In imported legacy save record a match, post/reverse allowed finance, complete sale-to-buy and accept/reject offers with policy feedback.
2. Repeat forbidden manual paths in a standalone test career; verify no changes.

## 10. Definition of done

- [ ] The narrow outcome is implemented and verified.
- [ ] Source/browser data and completed guide history are preserved.
- [ ] Required parity, negative and rollback checks pass.
- [ ] No new gameplay or false native/release claim is introduced.
- [ ] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
feat(nm-g08): preserve legacy workflows on sqlite
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

All G05 capabilities should now be native. NM-G09 independently certifies cutover before any P07-G06 work.
