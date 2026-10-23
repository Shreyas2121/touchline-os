# P09-G02 — Plan bounded transfer bids

## 1. Context and authority

- Master 3.0.4 §§5.4, 7.4, and 12.2 invariant 17; parent [Phase 9](../phase9.md) §§5.1.7 and 5.2 through the qualifying-fee paragraph.
- Predecessor: `feat(p09-g01): add negotiation storage contracts`.
- Commit: `feat(p09-g02): plan bounded transfer bids`.

This guide plans who bids, for whom, and for how much. It does not decide seller or player acceptance, write SQLite, or move the clock.

## 2. Goal and user-observable result

No screen changes. Given clubs, contracts, balances, and appearances, the pure planner returns at most 12 opening proposals. The same inputs return the same proposals. A club that cannot reserve the fee and wage is absent from the result.

## 3. Preconditions

G01 is committed. Keep the negotiation table unused. Do not import this module from `game-store` or `game-app` yet. Do not change `preview_time` or matchday commands.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/ability.rs` — `role_ability`.
- `src-tauri/crates/game-core/src/generation_settings.rs` — `tier_for` and `wage`. Use them; do not copy their numbers into a second formula.
- `src-tauri/crates/game-core/src/random.rs` — `EventKind::Market`, `derive_event_seed`, `Mulberry32::next_int`.
- `src-tauri/crates/game-core/src/finance.rs` — `transfer_capacity` and `wage_commitment`. The planner receives already computed spendable cents and wage room. It does not read ledgers itself.
- `src-tauri/crates/game-core/src/policy.rs` — `offer_qualifies` and `QualificationRule`.
- `src-tauri/crates/game-core/src/rows.rs` — player, contract, club, and appearance fields.
- `src-tauri/crates/game-core/src/lib.rs` — module export list and the crate-boundary test.

## 5. Files to create/modify

- Create `src-tauri/crates/game-core/src/market.rs`.
- Export it from `lib.rs`.
- Add `src-tauri/crates/game-core/tests/market.rs`.
- No migration, IPC, DTO, or UI changes.

Public surface:

```rust
pub struct MarketClub { simulation_key, prestige, spendable_cents, wage_room_cents, open_buy_count }
pub struct MarketPlayer {
    simulation_key, position_group, age, ability, market_value_cents,
    seller_simulation_key, // None for a free agent
    seller_prestige, current_wage_cents, current_tier, season_minutes, rating_sum, appearance_count,
}
pub struct OpeningBid {
    buyer_key, player_key, seller_key, fee_cents, wage_cents, tier, noise, valuation_cents,
    raised_to_qualify,
}
pub fn plan_tick(clubs, players, managed_club_key, seed_inputs, qualifying_rule) -> CoreResult<Vec<OpeningBid>>
```

`managed_club_key` is the managed club's simulation key. The qualifying-fee raise applies only when the seller's key equals it. `seed_inputs` carries the root seed and the operation key `season:{seasonId}:market:{YYYY-MM-DD}`. The function derives one stream. It does not accept a caller-supplied RNG.

## 6. Implementation steps

1. Implement demand and valuation exactly as Phase 9 §5.2. A player with no market value, no age, no ability, age outside 16–38, or market value 0 is not a candidate.
2. Compute shortages from active contract counts against targets 1, 4, 3, and 3. Order needs by shortage descending, average `role_ability` ascending, then group order goalkeeper, defender, midfielder, forward.
3. Order clubs and players by `simulationKey` Unicode scalar order. Skip a club with no need or with `open_buy_count >= 3`. Stop after 12 bids.
4. Draw `next_int(11) - 5` once for each club that has a non-empty candidate list, in club order. Clubs skipped before that draw do not consume a number.
5. Compute the fee from §5.2, including the free-agent zero fee and the spendable reduction to 80 percent of valuation. Skip a candidate when the wage does not fit `wage_room_cents`. Try the next candidate in order. Do not draw again.
6. When `qualifying_rule` is `Some` and the seller's simulation key equals `managed_club_key`, compute `qualifying_fee` with the ceiling division in §5.2. Raise the fee only when prestige is strictly higher, the rule is enabled, and the raised fee still fits. Set `raised_to_qualify` only in that case. Otherwise leave the fee unraised and set the flag false.
7. Return bids in club-key order. Do not include rejected candidates, reservation rows, or offer rows.
8. Refuse an unsupported stream version, an empty operation key, a negative spendable value, and a prestige outside 0–100.

## 7. Tests to add/change

- Two clubs and four players pin shortage order: the larger shortage is filled first, and equal shortages use the lower average ability.
- A fixed seed pins the first `next_int(11)` noise and the resulting fee. A second call matches. Shuffling input vector order does not change the bids. Changing only a row id is impossible here because the API has no row ids; changing `simulationKey` does change order.
- The 13th club in key order is omitted when the first 12 each bid. A club with three open buys is omitted and does not consume a draw.
- A bid above spendable is lowered when spendable is at least 80 percent of valuation, and omitted when it is not. A wage that does not fit is omitted.
- A managed-club seller with higher bidder prestige and a 3/2 rule gets `qualifying_fee` when the buyer can reserve it. The same buyer without the funds keeps the lower fee and `raised_to_qualify` is false.
- Missing market value produces no bid. Form before any appearance leaves valuation equal to market value.
- `game-core` still does not depend on SQLite or Tauri.

## 8. Verification commands

```bash
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The focused market test comes first. `pnpm native:bindings:check` and `pnpm tauri build` are not required: no generated DTO or command changes. Unit and integration tests plus these checks are sufficient (DEC-005).

## 9. Acceptance coverage

Cover Phase 9 acceptance items 3 and 4 for the pure planner: stable proposals, the 12-bid cap, one new bid per club, and no bid without fee and wage room. Persistence and retries belong to later guides.

## 10. Definition of done

- [ ] Formulas match Phase 9 §5.2, including the qualifying-fee ceiling.
- [ ] `wage` and `tier_for` are the generation functions, not a parallel table.
- [ ] No SQLite, IPC, clock, or UI change.
- [ ] Tests cover order, noise, caps, and unaffordable buyers.

## 11. Commit instructions

```text
feat(p09-g02): plan bounded transfer bids
```

Stage the market module, its tests, and the Phase 9 progress row.

## 12. Handoff

G03 takes an `OpeningBid` plus the player's current wage and tier and returns an agreement. G03 must not call `plan_tick` a second time for the same response. G05 is the first caller allowed to persist the bids.
