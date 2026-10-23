# P09-G04 — Settle agreed transfers atomically

## 1. Context and authority

- Master 3.0.4 §§4.1, 5.3, 5.4, 7.4, and 12.2 invariants 4 and 5; parent [Phase 9](../phase9.md) §§5.1.10–5.1.12 and 5.4.
- Predecessors: G01 storage and G03 `resolve_terms`.
- Commit: `feat(p09-g04): settle agreed transfers atomically`.

This guide persists one already agreed move. It does not run a market tick, open the inbox, or change July 1 → August 31.

## 2. Goal and user-observable result

A confirmed settlement moves one player. The buyer's transfer balance falls by the fee, the seller's rises by the same fee, and the ledger gains one `incoming_fee` and one `player_sale`. The old contract is `ended` and one new active contract exists. A repeated request does not pay again. A failed audit leaves every table unchanged. The Transfers screen does not yet show Accept or Reject; this guide exposes the command and a service test, not the inbox.

## 3. Preconditions

G01 and G03 are committed. G02's planner is not required at runtime. Do not call `plan_tick` from the settle path. Do not change `foundation_clock`.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/rows.rs` — `NegotiationRow`, `TransferRow`, `ContractRow`, `LedgerEntryRow`, `LineupRow`, `RegistrationRow`.
- `src-tauri/crates/game-core/src/finance.rs` — `transfer_capacity`, `wage_commitment`.
- `src-tauri/crates/game-core/src/policy.rs` — `PolicyAction::IncomingTransfer` and `Registration`.
- `src-tauri/crates/game-store/src/mutations.rs` — the matchday transaction, receipt, and revision style.
- `src-tauri/crates/game-app/src/matchday.rs` — preview outside the transaction, recheck inside it.
- `src-tauri/src/lib.rs` — `generate_handler!`.
- `src/platform/game-client.ts` and `native-client.ts`.

## 5. Files to create/modify

- Add a pure `settlement_plan` in `game-core` that returns the row changes for one agreed negotiation.
- Add `settle_transfer` in `game-app` and the store mutation.
- Add a thin Tauri command and a `GameClient` method.
- Add a real SQLite integration test.
- No calendar or inbox UI in this commit.

The request carries `campaign_id`, `expected_revision`, `negotiation_id`, `source_date`, `source_boundary_key`, client IDs for the transfer, contract, ledger rows, optional registration, receipt, audit, and action, plus `now`. IDs are assigned to the plan's slots. The PRNG is not used.

## 6. Implementation steps

1. Load the negotiation. Require status `agreed`, engine version `"1"`, and `reserved_cents == fee_cents`. A legacy offer with a null negotiation id is refused. Write nothing.
2. Build the plan from Phase 9 §5.1.10–5.1.12. One `Transfer` row: kind `sale` when the fee is positive, kind `free` when it is zero. End the seller's active contract. Insert one active contract at the agreed wage, tier, start date, and season end. Move `player.clubId` to the buyer. Set the negotiation to `settled`, `reserved_cents` and `reserved_wage_cents` to 0, and `resolved_on` to the game date.
3. Debit the buyer balance and credit the seller balance by the fee. Append `incoming_fee` and `player_sale` for a positive fee. A free transfer appends neither ledger row and does not change balances. Do not emit a second transfer row.
4. When the managed club is the seller, strip the player from lineup starters and bench and set that player's `league` registration to `ineligible`. When the managed club is the buyer, evaluate `IncomingTransfer` and `Registration` against the post-move squad. A block returns the policy remedy and writes nothing. AI clubs are not registration-gated.
5. Other open negotiations and offers for that player become `superseded`, their reservations return to zero, and their `resolved_on` is the game date. This includes a non-chosen bid from another club.
6. Operation key and fingerprint follow Phase 9 §5.4. A matching receipt returns `replayed: true` and the current revision. A stale revision or a different fingerprint writes nothing.
7. Recheck revision, status, both balances, wage room, and the reservation inside the transaction after the plan is computed. Assign client IDs only after that recheck.
8. Audit action is `transfer.settle`. Outcome refs include the negotiation, transfer, player, and ledger ids, within the existing 32-ref limit. Do not update fixtures, matches, or appearances.
9. Add the Tauri command and client method. The native UI does not call it yet.

## 7. Tests to add/change

- A temporary schema 4 database with one agreed negotiation settles, reopens, and replays. The second call does not add a ledger row or change the revision.
- Buyer balance minus fee, seller balance plus fee, and the sum of all club balances stays the same. Reserved cents on that negotiation become 0.
- Exactly one active contract remains for the player. The ended contract is still stored. Attributes, market value, and appearance rows are unchanged.
- A managed seller is removed from the lineup and becomes `ineligible`. A managed buyer who would break the registration quota leaves every table unchanged.
- A second open bid for the same player becomes `superseded` and its reservation is released.
- An injected audit-insert failure rolls back the player, both balances, the contract, and the negotiation status.
- A stale revision and a fingerprint mismatch write nothing.
- July 1 progression still targets August 31.

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

The focused settle test comes first. Unit and integration tests plus these checks are sufficient (DEC-005).

## 9. Acceptance coverage

Cover Phase 9 acceptance items 5 and 6 for a single agreed negotiation: one atomic move, one replay, and no partial balances. Window close, the inbox, and full-tick conservation belong to G05 and G06.

## 10. Definition of done

- [ ] Settlement follows Phase 9 §5.1.10–5.1.12.
- [ ] Retry, stale revision, and audit failure leave a single outcome.
- [ ] Match rows and the July 1 clock are unchanged.
- [ ] The command exists and the inbox does not call it yet.
- [ ] Generated bindings match the Rust DTOs.

## 11. Commit instructions

```text
feat(p09-g04): settle agreed transfers atomically
```

Stage the settlement plan, store mutation, command, client method, tests, generated bindings, and the Phase 9 progress row.

## 12. Handoff

G05 may call `settle_transfer` for Accept and for AI-to-AI deals inside a tick. AI-to-AI can use the same plan inside `run_market`'s transaction. G05 must still recheck reservations there. Do not settle a `proposed` or `countered` row.
