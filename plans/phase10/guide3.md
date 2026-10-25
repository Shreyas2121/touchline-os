# P10-G03 — Plan renewals, retirements, and intake

## 1. Context and authority

- Master 3.0.4 §§5.5, 6.3, 7.2, and 12.2 invariant 21; parent [Phase 10](../phase10.md) §5.4.
- Predecessor: `feat(p10-g02): plan bounded player development`.
- Commit: `feat(p10-g03): plan renewals retirements and intake`.

This guide plans who retires, who is re-signed, who is released, and which academy players are created. It does not write SQLite or change a live squad.

## 2. Goal and user-observable result

No screen changes. A fixed squad, wage budget, and academy tier produce the same roster plan on every call. A club that would be left without a goalkeeper pair is a refusal, not a partial plan. Intake names come from the development stream and do not change if only the transport ids change.

## 3. Preconditions

G02's `plan_development` is available. Use it for season-end attributes before retirement and renewal. Do not add a command, a migration, or a UI list. Do not import `rusqlite` or Tauri into `game-core`.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/lifecycle.rs` — `plan_development`.
- `src-tauri/crates/game-core/src/generation.rs` — `weekly_wage_cents`, `draw_name`, and the private name helper.
- `src-tauri/crates/game-core/src/generation_settings.rs` — `tier_for` and `wage`.
- `src-tauri/crates/game-core/src/fictional_names.rs` — `GIVEN`, `FAMILY`, and `NATIONALITIES`.
- `src-tauri/crates/game-core/src/random.rs` — `derive_event_seed` and `EventKind::Development`.
- `src-tauri/crates/game-core/src/policy.rs` — wage-tier caps and the under-21 registration exemption.
- Phase 10 §5.4 — retirement ages, contract dates, and the intake floor.

## 5. Files to create/modify

- Extend `lifecycle.rs` with the roster planner.
- Expose a `pub(crate)` name draw that uses the existing syllable lists. Do not copy those lists into the new module.
- Add tests beside the G02 tests.

```rust
pub struct ClubRosterInput {
    pub simulation_key: String,
    pub academy_tier: i64,
    pub wage_budget_weekly_cents: i64,
    pub managed: bool,
    pub players: Vec<RosterPlayer>,
}

pub struct RosterPlayer {
    pub simulation_key: String,
    pub age: Option<i64>,
    pub position_group: PositionGroup,
    pub attributes: PlayerAttributes,
    pub potential: Option<i64>,
    pub weekly_wage_cents: Option<i64>,
    pub expires_on: Option<String>,
    pub status: PlayerLife,
}

pub struct RosterPlan {
    pub retired: Vec<String>,       // player simulation keys
    pub renewed: Vec<Renewal>,
    pub released: Vec<String>,
    pub intake: Vec<IntakePlayer>,
}

pub struct Renewal {
    pub simulation_key: String,
    pub weekly_wage_cents: i64,
    pub squad_tier: SquadTier,
    pub starts_on: String,
    pub expires_on: String,
}

pub struct IntakePlayer {
    pub simulation_key: String,
    pub name: String,
    pub nationality_code: String,
    pub position_group: PositionGroup,
    pub position: Position,
    pub attributes: PlayerAttributes,
    pub potential: i64,
    pub weekly_wage_cents: i64,
    pub starts_on: String,
    pub expires_on: String,
}

pub fn plan_roster(
    clubs: &[ClubRosterInput],
    season_end: &str,
    next_start_year: i64,
    root_seed: &str,
    closing_season_id: &str,
    managed_tier_caps: Option<TierCaps>,
) -> CoreResult<Vec<RosterPlan>>;
```

The returned vector follows `clubs`, which the caller has already ordered by simulation key. `plan_roster` sorts a copy by simulation key before planning and returns plans in that same order, so a shuffled input cannot change who is generated.

## 6. Implementation steps

1. Retirement and wages use the attributes the caller supplies. `plan_roster` does not call `plan_development`. G04 passes the post-growth attributes.
2. Retire goalkeepers at 38 and every other known group at 36. Leave unknown ages and unknown groups unchanged and out of renewal.
3. Expire contracts whose `expires_on` is on or before `season_end`. Build the renewal with `tier_for` and `weekly_wage_cents`, starting the next July 1 and ending June 30 of `next_start_year + 2`.
4. For the managed club, reject a wage above the matching tier cap and retry youth once. For every club, reject a renewal that would push active wages over `wage_budget_weekly_cents`, and retry youth once. A second failure releases that player.
5. Build the base intake of `academy_tier + 1`, then fill toward two goalkeepers, one defender, one midfielder, one forward, and 16 contracted players, with a cap of 10 new players. Positions are `GK`, `CB`, `CM`, and `ST` as §5.4 describes.
6. Set attributes so `role_ability` equals `35 + academy_tier * 5`, and potential to `min(100, ability + 15)`. Youth wage uses `weekly_wage_cents`. The contract ends June 30 of `next_start_year + 3`.
7. Draw names and nationalities from `EventKind::Development` and `season:{closing_season_id}:academy:{clubSimulationKey}`. Draw after the position list is fixed. A club that creates no player draws nothing.
8. Drop intake from the end until the club's wages fit. If non-expiring wages are already over the budget, renew nobody and create no intake at that club.
9. If the floor in step 5 is still unmet at 10 new players, return `CoreError::Invalid` with `A club cannot field a legal squad next season.` Return no partial plan.
10. Keys use `newgen:{closingStartYear}:{clubSimulationKey}:{index}`. `closingStartYear` is `next_start_year - 1`.

## 7. Tests to add/change

- `retirement_ages_differ_for_goalkeepers`: a 36-year-old goalkeeper stays; a 36-year-old forward retires; a 38-year-old goalkeeper retires.
- `renewal_uses_generator_wage_and_two_year_term`: the wage equals `weekly_wage_cents`, and the dates are next July 1 through June 30 two years on.
- `unaffordable_renewal_releases_once`: a wage over the budget, including the youth retry, is one release and not a second contract.
- `intake_restores_the_floor_and_is_stable`: removing the only goalkeeper produces a goalkeeper newgen. Shuffling club order and replacing a caller id while keeping simulation keys keeps the same names and keys.
- `intake_stops_at_the_wage_budget`: a budget that fits the existing squad and one youth wage creates one intake player, not the full base count.
- `impossible_squad_is_an_error`: a club with no players and a budget of 0 returns the §5.4 sentence and an empty `Ok` is not used.
- `managed_cap_does_not_bind_an_ai_club`: the same over-cap wage renews for an AI club and releases for the managed club.

## 8. Verification commands

```bash
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The routine native check excludes opt-in season certification. A pure roster planner change needs its focused/core tests, not another 34-round replay. Run `pnpm native:test:season` if shared generation/ability, persistence, progression, market, or match behavior also changes; see the parent plan's verification scope.

Bindings and `pnpm tauri build` are not required when no DTO or command changes. No desktop session is required.

## 9. Acceptance coverage

| Item | Evidence |
| --- | --- |
| 10 — Legal core and wage budget | Floor, wage-drop, and impossible-squad tests. |
| 3 — Identity ignores transport ids | The shuffled-order intake test. |
| 4–9, 11 | Not this guide. G04 persists the plan. |

## 10. Definition of done

- [ ] `plan_roster` is deterministic for a fixed seed and simulation keys.
- [ ] Name draws use the existing fictional lists and `EventKind::Development`.
- [ ] No SQLite, IPC, clock, or UI change.
- [ ] A refused squad returns an error and no plan to apply.

## 11. Commit instructions

```text
feat(p10-g03): plan renewals retirements and intake
```

Stage the planner, the shared name helper, and the tests. Include the Phase 10 progress row in this commit after the checks pass.

## 12. Handoff

G04 calls `plan_development` and then `plan_roster` outside the transaction, and is the first guide allowed to insert the resulting players, contracts, and snapshots. G03 does not define ledger rows; those stay in §5.5 and G04.
