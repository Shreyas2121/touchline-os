# P09-G05 — Run windows and incoming offers

## 1. Context and authority

- Master 3.0.4 §§3.3, 5.1, 5.4, 7.1, and 7.4; parent [Phase 9](../phase9.md) §§5.1.3–5.1.9, 5.4, and 5.5.
- Predecessors: G01 storage, G02 `plan_tick`, G03 `resolve_terms`, and G04 `settle_transfer`.
- Commit: `feat(p09-g05): run windows and incoming offers`.

This is the first guide that changes the July 1 continue target and shows the inbox.

## 2. Goal and user-observable result

On July 1, Command Center shows **Run Market**. Confirming it stores that date's bids and any AI-to-AI settlements, then Continue moves to July 8. Transfers lists incoming offers with Accept and Reject. A bid whose stored snapshot still qualifies cannot be rejected. August 31 does not advance while one is open, and the text is `Accept the qualifying offer before the window can close.` After Accept, Continue can reach September 1. On a January match date the market runs before Sim Matchday. The first later match date shows **Close Window** first. Review still names Phase 10.

## 3. Preconditions

G01–G04 are committed. Inspect the working tree and keep unrelated changes unstaged. Update progression tests that still expect July 1 to jump to August 31; that jump is this guide's intended change. Do not add growth, awards, or rollover.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/calendar.rs` — `foundation_clock`, `next`, `preview_time_advance`, `transfer_window_on`.
- `src-tauri/crates/game-core/src/market.rs` — `plan_tick` and `resolve_terms`.
- `src-tauri/crates/game-app/src/progression.rs` and `matchday.rs` — preview, recheck, and ID slots.
- `src-tauri/crates/game-store/src/mutations.rs` — G04 settlement and matchday transactions.
- `src-tauri/crates/game-core/src/policy.rs` — `RejectOffer`, `offer_qualifies`. Add `WindowClose` here. Do not call `SeasonRollover` for a window.
- `src-tauri/src/lib.rs`, `src/platform/game-client.ts`, `native-client.ts`.
- `src/app/native/NativeProgression.tsx`, `NativeWorkspace.tsx`, `NativeScreenTables.tsx`.
- `src/app/routes.ts` — Transfers already has a route.
- `src/test/native-progression.test.tsx` — the current August 31 expectation.

## 5. Files to create/modify

- Extend the clock with summer tick keys, January market keys, and the winter-close key.
- Add `preview_market`, `run_market`, `preview_proposal`, `propose_transfer`, `respond_negotiation`, `respond_offer`, `close_window`, and `transfer_board`.
- Wire thin commands, generated DTOs, and `GameClient`.
- Replace the native Transfers body with the board: incoming, outgoing, and completed. Keep the route.
- Command Center uses the primary-action table in Phase 9 §5.5.

`PolicyAction` gains `WindowClose { unresolved_qualifying_offers }`. Qualification for that count uses the offer's stored fee, stored value, stored prestige pair, and the current constitution. It does not read `player.market_value_cents`.

## 6. Implementation steps

1. Extend `foundation_clock` with the legal states in Phase 9 §5.1.13. Summer tick dates are July 1 plus 0, 7, 14, 21, 28, 35, 42, 49, and 56 days. August 31 stays the summer deadline.
2. On an unconsumed summer tick date, `preview_time` is not the primary action. `preview_market` returns the tick plan and ID counts and writes nothing. `run_market` recomputes the plan, checks the fingerprint, assigns client IDs, and commits negotiations, incoming offers, and AI-to-AI settlements in one transaction.
3. For each opening bid, call `resolve_terms` once. Persist `Agreed` AI-to-AI deals through the G04 plan in that same transaction. Persist a managed-seller `Agreed` result as an offer linked to the negotiation, with the qualification snapshot and reservation. A `Rejected` result stores nothing and reserves nothing. User counters belong to `propose_transfer`, not to the tick.
4. Incoming offer fields copy the stored snapshot from §5.3. `origin` is `ai`. Deadline is the earlier of the open date plus 14 days and August 31 or January 31. Compulsory is the result of `offer_qualifies` on that snapshot.
5. `propose_transfer` is allowed on an open window date other than August 31. It stores one negotiation, reserves the fee and wage, and stores the G03 response. The same proposal key replays. A different fee is a different key. `respond_negotiation` accepts a counter, submits one user counter when `counter_count < 2`, or withdraws. Withdraw releases the reservation.
6. `respond_offer` Accept calls the G04 settlement. Reject evaluates `RejectOffer` on the stored snapshot. A qualifying bid writes nothing and returns the existing prestige remedy. Non-qualifying reject sets `rejected`, releases the reservation, and writes `offer.respond`.
7. August 31 → September 1 expires leftover non-compulsory rows only when the advance commits. If any stored snapshot still qualifies, the advance writes nothing, including no expiry, and the reason is `Accept the qualifying offer before the window can close.`
8. January match dates require a consumed market key before `sim_matchday`. The preview reason is `Run the transfer market before this matchday.` The first fixture date after January 31 requires `close_window` first, with `Close the winter window before this matchday.` Close uses audit action `market.close`. It does not create bids and does not change the date.
9. `transfer_board` returns the three lists in §5.5. The 50-row screen page is not the inbox. Buttons are **Run Market**, **Close Window**, **Accept**, **Reject**, **Withdraw**, and **Settle**. Disable the clicked control while its request is in flight. Loading copy is `Calculating the transfer market.`
10. Approach outside the window returns `The transfer window is closed.` Review copy stays `Season rollover arrives in Phase 10.` Sim Matchday formulas and stored results stay unchanged.

## 7. Tests to add/change

- A new career on July 1 previews Run Market and does not preview August 31 as the next date. After the tick, Continue targets July 8. After the August 26 tick, Continue targets August 31.
- One tick on a temporary database stores at most 12 negotiations, replays without new rows, and rolls back on an injected audit failure.
- An incoming qualifying offer refuses Reject, blocks the August 31 advance with no writes, and after Accept allows that advance. A non-qualifying offer can be rejected and does not block.
- Two commands cannot create two compulsory offers for one player. The second bid is absent.
- A January date refuses Sim Matchday until Run Market. The following close date refuses Sim Matchday until Close Window. A match row written before the tick is unchanged after it.
- Proposal replay does not create a second negotiation. Withdraw restores spendable reservation once.
- UI tests cover the primary action, the compulsory word, Reject remaining unavailable, and double-click protection. No desktop session is required.

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

Focused clock, market-command, and `native-progression` tests come first. Unit and integration tests plus these checks are sufficient (DEC-005).

## 9. Acceptance coverage

Cover Phase 9 acceptance items 5 and 7–11 for the wired commands and the inbox. Full summer conservation across every tick, concurrent calls, and the played winter path belong to G06.

## 10. Definition of done

- [ ] July 1 starts with Run Market, and the nine summer dates match §5.1.4.
- [ ] Qualifying bids block close and cannot be rejected, expired, or withdrawn.
- [ ] January order is market, then match. Winter close is before the next match.
- [ ] AI-to-AI settlement and Accept share the G04 plan.
- [ ] Review and stored match rows stay as Phase 8 left them.
- [ ] Generated bindings match the Rust DTOs.

## 11. Commit instructions

```text
feat(p09-g05): run windows and incoming offers
```

Stage the clock, commands, UI, tests, generated bindings, and the Phase 9 progress row.

## 12. Handoff

G06 certifies a fixed seed from July 1 through the winter close. It should not retune §5.2. If a tick can create an unaffordable compulsory bid, fix creation so the bid is skipped; do not weaken Accept.
