# P08-G04 — Simulate instant match outcomes

## 1. Context and authority

- Master 3.0.4 §§4.6, 7.5, and 7.6; parent [Phase 8](../phase8.md) §§5.1.7–5.1.8, 5.1.12–5.1.13, and 5.2.
- Predecessor: `feat(p08-g03): select legal match squads`.
- Commit: `feat(p08-g04): simulate instant match outcomes`.

This guide adds the pure engine for one fixture. It does not persist a round or change the UI.

## 2. Goal and user-observable result

No screen changes. Given both selections, fitness, and a fixture key, the engine returns one score, xG, timeline, appearances, and availability deltas. Repeating the call with the same logical inputs returns the same events.

## 3. Preconditions

G03 is committed and `effective_strength` is the only strength function used. Use `derive_event_seed` and `EventKind::Fixture`. Do not add a random crate. Do not write SQLite.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/random.rs` — `derive_event_seed`, `Mulberry32::next_int`, stream version `"1"`.
- `src-tauri/crates/game-core/src/match_selection.rs` — selections and `plan_substitutions`.
- `src-tauri/crates/game-core/src/dates.rs` — adding the injury duration to the match date.
- `src/domain/matches/xg.ts` — milli-units only. Do not port the browser journal.
- Phase 8 §5.2 from home advantage through the post-match fitness rules.

## 5. Files to create/modify

- Create `src-tauri/crates/game-core/src/match_engine.rs`.
- Export it from `lib.rs`.
- Add `src-tauri/crates/game-core/tests/match_engine.rs`.

```rust
pub struct EngineInput<'a> {
    pub root_seed: &'a str,
    pub fixture_key: &'a str,
    pub match_date: DateOnly,
    pub home: &'a ReadySelection,
    pub away: &'a ReadySelection,
}
pub struct EngineMatch {
    pub event_seed: u32,
    pub home_goals: u8,
    pub away_goals: u8,
    pub home_xg_milli: i64,
    pub away_xg_milli: i64,
    pub timeline: Vec<MatchEvent>,
    pub appearances: Vec<EngineAppearance>,
    pub availability: Vec<AvailabilityDelta>,
}
pub fn simulate_fixture(input: &EngineInput<'_>) -> CoreResult<EngineMatch>;
```

`MatchEvent` is a closed set: `goal`, `yellow`, `red`, `substitution`, `injury`. Each event has minute, club side, player simulation key, and optional assist key or xG milli-units. `AvailabilityDelta` carries the simulation key, the next fitness, sharpness, injury return date, and suspension count. There is no own-goal variant.

## 6. Implementation steps

1. Derive the event seed from `root_seed`, version `"1"`, `EventKind::Fixture`, and `&[fixture_key]`. Create one `Mulberry32` from that seed. Document the draw order in code comments and follow it exactly.
2. Copy selections and add home advantage: `+4` for each home outfield starter and `+2` for the home goalkeeper. Selection order does not change.
3. Compute chance counts from Phase 8 §5.2. Alternate home and away. Emit leftover home chances after the pairs. Assign minutes with `1 + (i * 88) / n`.
4. Rotate shooters through forwards, then midfielders, in slot order. Convert each chance with `next_int(1000) < xg_milli`. Record the chance xG even when the shot misses. Team xG is the sum of that team's chance values.
5. Apply cards in starter slot order using the yellow and straight-red draws in §5.2. A second yellow emits a red at the same minute and stops further cards for that player. Resolve cards after chances, so the chance list does not depend on card minutes. Sort the timeline by minute, then home before away, then insertion order.
6. Apply `plan_substitutions` unless the outgoing player was already sent off before that minute. Each substitution counts toward five.
7. Then roll injuries for players still on the pitch at the end of chances, in slot order. On an injury, emit the event and substitute with the unused same-group bench player who ranks highest, while a substitution slot remains. Duration is `7 + next_int(22)`. `injuryUntilDate = add_days(match_date, duration)`.
8. Build appearances only for players with minutes above 0. Starters begin at 90 and lose minutes after a substitution or sending-off. Substitutes gain the remaining minutes. Minutes cannot exceed 90. Rating uses the §5.2 formula. Goals and assists on an appearance equal that player's timeline events.
9. Availability starts from the kickoff values. Apply the fitness and sharpness table in §5.2. For each player who began the match suspended, set the post-match suspension to the kickoff value minus 1, then add 1 if this match produced a sending-off. For everyone else, add 1 only when this match sent them off. Never subtract and add as a single cancel.
10. Refuse an input that is not `Ready`, a fixture key outside the existing stream-key limits, or arithmetic that leaves the safe integer range. Do not clamp a failed checked operation into a fake score.

## 7. Tests to add/change

- Score equals goal events. Each goal's assist, when present, belongs to the same team. Team xG equals the sum of that team's chance events. No event kind is an own goal.
- Every appearance is unique per simulation key. Minutes are 1–90 for participants. Starters and substitutes account for the players who left.
- A pinned tiny selection and seed records the first three draws and the resulting first event, so draw-order regressions fail.
- The same input twice is equal. A different fixture key changes the seed. Entity ids are not inputs.
- A second yellow sets yellow cards to 2, red cards to 1, and suspension to 1. A player who started suspended at 1 and is not sent off finishes at 0. A player who started at 1 and is sent off finishes at 1, not 0.
- Injury duration stays inside 7–28 and the return date uses `add_days`.
- Home advantage changes strength before the chance formula and does not mutate the caller's selection.
- A sixth planned substitution is absent even when fitness is low.

## 8. Verification commands

```bash
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

This guide does not add a Tauri command. Run bindings generation only if a generated DTO changed.

## 9. Acceptance coverage

Cover acceptance items 4, 7, and 8 at the pure boundary: seed stability, reconciliation, and sequential bans. G05 proves the same properties after SQLite commit and retry.

## 10. Definition of done

- [ ] One PRNG per fixture, seeded from the fixture key and root seed.
- [ ] Score, xG, appearances, minutes, and cards reconcile.
- [ ] Ban decrement and a new sending-off do not cancel.
- [ ] Formulas match Phase 8 §5.2, including no own goals.
- [ ] No persistence, IPC, or UI.

## 11. Commit instructions

```text
feat(p08-g04): simulate instant match outcomes
```

Stage the engine, tests, and the progress row.

## 12. Handoff

G05 runs `simulate_fixture` for all 36 fixtures outside the write transaction. It copies the engine output into stored rows and must not reroll inside the transaction. The input snapshot stores the pre-advantage selection, engine version `"1"`, and the seed.
