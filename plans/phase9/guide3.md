# P09-G03 — Resolve club and player terms

## 1. Context and authority

- Master 3.0.4 §§5.4 and 7.4; parent [Phase 9](../phase9.md) §5.2 from the AI seller response through the managed-seller paragraph.
- Predecessor: `feat(p09-g02): plan bounded transfer bids`.
- Commit: `feat(p09-g03): resolve club and player terms`.

This guide turns an opening bid, or a user proposal, into a deterministic agreement. It does not write SQLite, reserve money, or create an offer row.

## 2. Goal and user-observable result

No screen changes. The same proposal always gets the same accept, counter, or reject. An AI buyer answers one seller counter inside the same call. A managed seller does not auto-accept the fee. A player rejection produces no terms.

## 3. Preconditions

G02 is committed and `OpeningBid` exists. Do not persist negotiations. Do not change Continue or Sim Matchday.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/market.rs` — `OpeningBid` and valuation fields.
- `src-tauri/crates/game-core/src/enums.rs` — `SquadTier`.
- `src-tauri/crates/game-core/tests/market.rs` — the G02 fixtures, so G03 tests can reuse their numbers.
- Parent Phase 9 §5.1.7 and §5.2 response rules.

## 5. Files to create/modify

- Add agreement types and `resolve_terms` to `src-tauri/crates/game-core/src/market.rs`, or to `negotiation.rs` if that keeps `market.rs` to planning. Export the public types from `lib.rs`.
- Extend `src-tauri/crates/game-core/tests/market.rs`.
- No migration, IPC, or UI changes.

```rust
pub enum Agreement {
    Agreed { fee_cents, wage_cents, tier, counter_count },
    Countered { fee_cents, wage_cents, tier, counter_count },
    Rejected,
}
pub struct TermProposal { fee_cents, wage_cents, tier, valuation_cents, current_wage_cents, current_tier, seller_is_managed, buyer_is_ai, spendable_cents, wage_room_cents }
pub fn resolve_terms(proposal: TermProposal) -> CoreResult<Agreement>
```

`Countered` is only for a user buyer who must answer. An AI buyer returns `Agreed` or `Rejected`, never an open counter.

## 6. Implementation steps

1. Implement the AI seller bands from Phase 9 §5.2: accept at or above 90 percent of valuation, one counter at the minimum when the fee is at or above 80 percent of that minimum, otherwise reject.
2. Implement the player bands: accept a non-demotion at or above the current wage, one counter to the current wage when the offer is at or above 90 percent, accept a demotion at or above 120 percent, otherwise reject. Rank key above rotation above youth. A missing current tier is not a demotion. A free agent uses the opening wage as `current`.
3. Apply the seller counter before the player counter. Stop at the first rejection. `counter_count` is the number of counters applied and is at most 2.
4. When `buyer_is_ai` and the seller counters, accept that fee if it is at or below `spendable_cents` and the wage still fits `wage_room_cents`. Otherwise return `Rejected`. Do not emit a second counter.
5. When `seller_is_managed`, skip the seller fee response. Run the player response. On player rejection, return `Rejected`. On a player counter, adopt that wage and tier when they still fit `wage_room_cents`, and return `Agreed` with the original fee. When they do not fit, return `Rejected`. The managed club's fee decision is not this function's result.
6. A user buyer (`buyer_is_ai == false`) receives `Countered` when a counter remains for them to accept. Do not auto-agree a user purchase.
7. Reject negative money, a tier that is not key, rotation, or youth, and a valuation of zero. Do not draw random numbers in this function.
8. Calling `resolve_terms` twice with the same proposal returns the same agreement. It must not call `plan_tick`.

## 7. Tests to add/change

- Fee at the minimum is accepted. Fee between 80 and 90 percent of valuation produces one seller counter. Fee below that is rejected.
- Wage at the current wage is accepted. Wage at 90 percent counters once to the current wage. A demotion below 120 percent is rejected. A demotion at 120 percent is accepted.
- Seller counter then player counter yields `counter_count == 2`. A third band is not applied.
- AI buyer with enough money returns `Agreed` at the countered fee. The same buyer over budget returns `Rejected` and no reserved amount is implied.
- Managed seller with a player counter returns `Agreed` terms and the original fee. Managed seller with a player rejection returns `Rejected` and would create no offer.
- Equal inputs match. No test depends on `Math.random`, the clock, or SQLite.

## 8. Verification commands

```bash
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The focused market test comes first. Bindings and Tauri build are not required. Unit and integration tests plus these checks are sufficient (DEC-005).

## 9. Acceptance coverage

Cover the agreement half of acceptance items 3 and 7's preconditions: identical proposals agree identically, and a managed seller does not become a completed sale inside this function. Affordability of a later compulsory Accept is G04 and G05.

## 10. Definition of done

- [ ] Response bands match Phase 9 §5.2.
- [ ] AI-to-AI ends in `Agreed` or `Rejected` inside one call.
- [ ] Managed selling does not auto-accept the fee.
- [ ] No persistence, IPC, clock, or UI change.

## 11. Commit instructions

```text
feat(p09-g03): resolve club and player terms
```

Stage the agreement code, tests, and the Phase 9 progress row.

## 12. Handoff

G04 may settle only an `Agreed` result. It must store the fee, wage, tier, counter count, and valuation used here on the negotiation. G05 creates the incoming offer only after this function returns `Agreed` for a managed seller.
