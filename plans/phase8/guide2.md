# P08-G02 — Schedule leagues and standings

## 1. Context and authority

- Master 3.0.4 §§7.1, 7.6, and 12.2 invariants 13–14; parent [Phase 8](../phase8.md) §§5.1.3–5.1.6 and 5.5.
- Predecessor: `feat(p08-g01): add matchday storage contracts`.
- Commit: `feat(p08-g02): schedule leagues and standings`.

This guide is pure. It does not insert fixtures or change Continue.

## 2. Goal and user-observable result

No screen changes. Core tests prove a four-league season has 1,224 dated fixtures and that standings follow the published tie-break. The same club simulation keys always produce the same pairings.

## 3. Preconditions

G01 is committed. If its tables are absent, stop and finish G01. Do not persist schedules in this guide. Do not add a dependency.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/dates.rs` — `add_days` and `DateOnly`.
- `src-tauri/crates/game-core/src/calendar.rs` — September 1 is the day after August 31. Do not widen the clock states here.
- `src-tauri/crates/game-core/src/generation.rs` — `club_key`, league `tier`, 18 clubs per league.
- `src-tauri/crates/game-core/src/lib.rs` — module exports.
- Phase 8 §5.1 items 3–6.

`LeagueRow` has no simulation key. Use `tier`.

## 5. Files to create/modify

- Create `src-tauri/crates/game-core/src/schedule.rs`.
- Export it from `lib.rs`.
- Add `src-tauri/crates/game-core/tests/schedule.rs`.

```rust
pub struct ScheduleClub<'a> { pub simulation_key: &'a str, pub league_tier: i64 }
pub struct ScheduledFixture {
    pub fixture_key: String,
    pub league_tier: i64,
    pub round: u8,
    pub match_date: DateOnly,
    pub home_simulation_key: String,
    pub away_simulation_key: String,
}
pub struct StandingRow {
    pub simulation_key: String,
    pub played: u16, pub won: u16, pub drawn: u16, pub lost: u16,
    pub goals_for: u16, pub goals_against: u16,
    pub goal_difference: i32, pub points: u16,
}

pub fn schedule_season(start_year: i64, clubs: &[ScheduleClub<'_>]) -> CoreResult<Vec<ScheduledFixture>>;
pub fn standings(clubs: &[&str], results: &[MatchScore]) -> CoreResult<Vec<StandingRow>>;
```

`MatchScore` carries home key, away key, and both goal totals. It is not a database row.

## 6. Implementation steps

1. Reject a start year outside the existing `season_dates` bounds. Round 1 is `{year}-09-01`. Round `r` is `add_days` of `(r - 1) * 7`. Reject a round 34 date after `{year+1}-06-30`.
2. Group clubs by `league_tier`. Require exactly four tiers, 1–4, and exactly 18 clubs in each. Sort each group by `simulation_key` ascending, compared as Unicode scalars.
3. Build rounds with the circle method. For `n = 18`, keep index 0 fixed and start `rotating` at `[1, 2, …, 17]`.
   - For zero-based round `q` in `0..17`, form `row = [0] + rotating`.
   - For `k` in `0..9`, pair `row[k]` with `row[17 - k]`. When `(q + k)` is even, the first index is home. Otherwise swap.
   - Then move the last rotating entry to the front.
   - Rounds `17..34` repeat those pairs with home and away swapped.
4. One-based round numbers are `q + 1`. The fixture key is `season:{year}:league-tier:{tier}:round:{rr}:home:{home}:away:{away}` with a two-digit round.
5. `standings` gives 3 points for a win and 1 for a draw. Sort by points descending, goal difference descending, goals scored descending, then simulation key ascending. Include clubs with no results. Reject a negative goal count or a club missing from the supplied key list.
6. Do not read entity IDs, SQLite, or the clock. Do not call the match PRNG.

## 7. Tests to add/change

- 72 generated-style keys (`club:01` through `club:72`, tiers from `(index / 18) + 1`) produce 1,224 fixtures: 306 per tier, 34 rounds, 9 per round.
- Every unordered pair in a league meets once at home and once away. No club plays twice on the same round. No club plays itself.
- Pinned round 1 for `club:01`–`club:18`: `01-18`, `17-02`, `03-16`, `15-04`, `05-14`, `13-06`, `07-12`, `11-08`, `09-10`, listed home-away.
- Season 2026 round 34 is 2027-04-20. A season whose span includes 2028-02-29 still finishes on or before June 30.
- Reversing the input club order does not change fixture keys.
- Standings fixtures: a draw is 1 point; a win is 3; equal points and goal difference fall through to goals scored and then `club:02` before `club:10`; an unplayed club is included with zeros.
- A 17-club league, a duplicate tier, and a missing tier fail.

## 8. Verification commands

```bash
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm native:check` includes the focused schedule tests via the workspace suite. Bindings and `tauri build` are unchanged unless a DTO was exported; do not export a DTO in this guide. If a public `TS` type was added, also run `pnpm native:bindings:check` and `pnpm tauri build`.

## 9. Acceptance coverage

Cover acceptance item 3 and the tie-break in item 9 with pure tests. Persistence of the calendar waits for G05.

## 10. Definition of done

- [ ] Pair counts, venues, round size, and the pinned round are tested.
- [ ] Dates use `add_days` and stay inside July–June.
- [ ] Standings order matches the published rule, including the simulation key.
- [ ] No database, IPC, or UI file changes.
- [ ] Fixture keys contain no entity IDs.

## 11. Commit instructions

```text
feat(p08-g02): schedule leagues and standings
```

Stage the core module, its tests, and the progress row.

## 12. Handoff

G05 calls `schedule_season` once, on the first matchday, and stores the returned keys. Later matchdays must reload stored fixtures rather than pair again. G03 does not need the calendar module to test selection.
