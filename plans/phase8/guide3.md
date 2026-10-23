# P08-G03 — Select legal match squads

## 1. Context and authority

- Master 3.0.4 §§5.5, 7.3, and 7.5; parent [Phase 8](../phase8.md) §§5.1.9–5.1.12 and 5.2.
- Predecessor: `feat(p08-g02): schedule leagues and standings`.
- Commit: `feat(p08-g03): select legal match squads`.

This guide adds pure strength, eligibility, lineup choice, AI/emergency picking, and the non-random substitution policy. It does not simulate chances or write a match.

## 2. Goal and user-observable result

No screen changes yet. Tests show the same strengths the match engine will use, a managed-club blocker when a legal XI is possible, and a labeled emergency XI only when it is not.

## 3. Preconditions

G02 is committed. Selection must not import `schedule.rs` results or SQLite. Reuse `role_ability`, `formation_slots`, and `lineup_problems`. Do not change generation weights.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/ability.rs` — six-attribute weights and `goalkeeper_rating`.
- `src-tauri/crates/game-core/src/selection.rs` — formations, bench cap of 12, `LineupProblem`.
- `src-tauri/crates/game-core/src/rows.rs` — `LineupRow`, `PlayerSimulationStateRow`, `RegistrationRow`.
- `src-tauri/crates/game-core/src/policy.rs` — competition key `league` and age-exempt registration behavior.
- Phase 8 §5.2 formulas through the planned substitution paragraph.

## 5. Files to create/modify

- Create `src-tauri/crates/game-core/src/match_selection.rs`.
- Export it from `lib.rs`.
- Add `src-tauri/crates/game-core/tests/match_selection.rs`.

```rust
pub enum SelectionMode { SavedLineup, Emergency }
pub struct SelectedPlayer {
    pub simulation_key: String,
    pub slot: String,
    pub started: bool,
    pub effective: i64,
}
pub enum ClubSelection {
    Ready { mode: SelectionMode, formation: Formation, players: Vec<SelectedPlayer> },
    Blocked { message: &'static str },
}
pub fn effective_strength(...) -> CoreResult<i64>;
pub fn select_managed_club(...) -> ClubSelection;
pub fn select_ai_club(...) -> CoreResult<ClubSelection>;
pub fn plan_substitutions(selection: &ClubSelection) -> CoreResult<Vec<PlannedSub>>;
```

`PlannedSub` contains minute, outgoing simulation key, and incoming simulation key. The function returns at most five.

Inputs are plain borrowed views: position group, attributes, optional goalkeeping, fitness, sharpness, life status, contract active flag, injury return date, suspension count, registration status, and the saved lineup. Do not take a database connection.

## 6. Implementation steps

1. Implement `effective_strength` exactly as Phase 8 §5.2. Missing attributes fail. Fitness or sharpness outside 0–100 fail. A missing goalkeeper rating falls back to `role_ability` for a goalkeeper and is ignored for an outfielder.
2. A player is eligible when life is active, the contract is active at that club, the match date is on or after `injuryUntilDate` when that date exists, and `suspensionMatches` is 0. The managed club also requires registration competition `league` with status `registered` or `ageExempt == Some(true)`.
3. Choose the managed lineup with the greatest `updatedAt`, breaking ties by lineup id ascending. Accept it only when `lineup_problems` is empty, all 11 slots are filled, the goal slot is a goalkeeper, every used player is eligible, and the bench has no duplicates. Pass only the first 9 bench ids to the match.
4. If that lineup is illegal and at least 11 eligible players include a goalkeeper, return `Blocked` with `Select a legal lineup before this matchday.`
5. Otherwise build an emergency `4-3-3`. Rank candidates by effective strength, fitness, sharpness, then simulation key. Prefer a goalkeeper in goal. Use an injured player only when fewer than 11 non-injured contracted players exist, and a suspended player only when fewer than 11 non-suspended contracted players exist. Label `Emergency`. If 11 contracted players still do not exist, return a blocker: `This club cannot field 11 contracted players.`
6. AI selection always uses the emergency picker's ranking path with fit, unsuspended players first, and never reads a saved lineup. AI does not use the managed registration rule.
7. `plan_substitutions` walks starters in slot order. At minute 60, a starter with kickoff fitness below 60 yields to the first unused same-group bench player with higher fitness. Otherwise minute 75 applies when fitness is below 80. Stop at five. This function draws no random numbers.
8. Home-advantage additions are not part of selection strength. G04 adds them after selection.

## 7. Tests to add/change

- In-position strength matches `role_ability`. A different outfield group is `base * 3 / 4`. A goalkeeper in an outfield slot is `base / 2`. Fitness 100 and sharpness 100 leave the base unchanged. Sharpness 0 multiplies by 50/150.
- A stored goalkeeping rating replaces the outfield-style goalkeeper base.
- Duplicate players, a missing goalkeeper, an unregistered managed player, an injured player, and a suspended player block when replacements exist.
- Two lineups with the same timestamp resolve by id. Bench player 10 is omitted and the saved row is not part of this pure result.
- Emergency is used only below 11 eligible players and is labeled. AI selection is stable when the input order changes.
- Planned substitutions: fitness 59 swaps at 60; fitness 79 swaps at 75; fitness 80 does not; the sixth candidate is not used.
- A club with 10 contracted players is blocked for both managed and AI paths.

## 8. Verification commands

```bash
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

No new IPC type is required. If a `TS` export forces binding regeneration, run `pnpm native:bindings:check` as well and include the generated files.

## 9. Acceptance coverage

Cover acceptance item 5 at the pure-function boundary. G05 repeats it at SQLite so a blocked preview still writes nothing.

## 10. Definition of done

- [ ] Strength, registration, injury, and suspension rules match §5.2 and §6.
- [ ] Emergency selection cannot hide an available legal managed lineup.
- [ ] Substitution planning is deterministic and capped at five.
- [ ] No match events, SQLite writes, or UI changes.

## 11. Commit instructions

```text
feat(p08-g03): select legal match squads
```

Stage the selection module, tests, and the progress row.

## 12. Handoff

G04 calls `effective_strength` and consumes `SelectedPlayer` plus `plan_substitutions`. It must not reimplement position weights. G05 maps stored rows into these borrowed views and persists `Emergency selection` in the match input snapshot.
