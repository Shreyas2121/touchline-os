# Phase 8 — Fixtures and instant match simulation

> **Authority:** `MASTER_PLAN.md` 3.0.4 / DEC-003 / DEC-004 / DEC-005 / DEC-006
> **Phase IDs:** `P08-G01` … `P08-G06`
> **Status:** Guides are written. Product code starts at [guide 1](phase8/guide1.md). Do not start a later guide before the earlier guide is committed.
> **Predecessor:** Phase 7 foundation. Kickoff is persisted and further simulation is refused. This file does not authorize market, lifecycle, analytics, dataset import, or release work.

## 1. Parent plan contract

Authority is `MASTER_PLAN.md` `3.0.4`. On conflict, the master plan wins. This phase plan wins over any `plans/phase8/guide<number>.md`.

Relevant master sections:

- **§1.5** — Instant results only. No live ticker, pause, in-match tactical changes, cups, or promotion.
- **§2** — Pure `game-core`, application services in `game-app`, SQLite in `game-store`, thin Tauri commands, `GameClient`. CPU work stays outside the short write transaction.
- **§4.1 invariants 7, 9, 11, 12** — Confirmation authorizes one bounded event. Seeds exclude remappable IDs and audit time. One result per fixture and one appearance per fixture/player. A matchday commits together or not at all.
- **§4.3** — `Fixture`, `SimulatedMatch`, and `SimulatedAppearance` begin here. xG is integer milli-units. Ratings stay 0–100.
- **§4.6** — Independent calendar and match-engine versions. A retry returns the stored outcome and does not reroll. Native correctness is the gate; previous TypeScript match code is not an authority.
- **§7.1** — After kickoff, this phase plays all 34 rounds and can show the final table. Rollover remains unavailable until Phase 10.
- **§7.3** — The same ability functions feed generation, selection, and simulation. Kickoff needs 11 eligible starters including a goalkeeper. AI selection is deterministic. Substitutions are automatic.
- **§7.5** — Registration, contracts, injuries, and bans gate the managed club. A straight red is a one-league-match ban from the next fixture. Serving a ban and receiving a new one are sequential, not a toggle.
- **§7.6** — 18-club double round-robin: 34 rounds, 9 fixtures per league per round, 306 per league, 1,224 in the world. One command simulates all 36 fixtures on that date. Scores equal goal events. Standings are 3/1, then goal difference, goals scored, and stable club simulation key.
- **§12.2 invariants 7 and 13–16** — Unique performances, 34 rounds, all-or-nothing round commits, reconciled score/xG/appearances, and no outcome change from transport IDs or audit time.
- **§12.5** — Keyboard users can resolve a blocker and read a result. Severity is a word, not a color alone.

Roadmap entries, in order:

| ID | Deliverable | Commit subject |
| --- | --- | --- |
| `P08-G01` | Rust fixture, result, and appearance contracts, plus the SQLite migration | `feat(p08-g01): add matchday storage contracts` |
| `P08-G02` | Pure double round-robin calendars and standings | `feat(p08-g02): schedule leagues and standings` |
| `P08-G03` | Shared role strength, legal selection, and the automatic substitution policy | `feat(p08-g03): select legal match squads` |
| `P08-G04` | Pure instant match engine | `feat(p08-g04): simulate instant match outcomes` |
| `P08-G05` | Atomic matchday command, reports, tables, and performance reads | `feat(p08-g05): commit matchday results` |
| `P08-G06` | Full-round and full-season native certification | `test(p08-g06): verify a full simulated season` |

One guide is one commit. Split a guide only by editing this phase file first.

## 2. Phase objective and user-visible outcome

At the end of Phase 8, a standalone career that has reached September 1 can:

1. See the next matchday instead of `Match simulation arrives in Phase 8.`
2. Save a legal managed lineup, then run **Sim Matchday** once. All four leagues on that date finish together.
3. Open Fixtures & Results and read the score, xG, event list, both teams' appearances, and all four tables.
4. Reload or reopen the save and find the same results once. Repeating the request does not roll the match again or move the date again.
5. Continue through 34 weekly rounds. After the last round the career enters review and stops with `Season rollover arrives in Phase 10.`
6. See managed-club minutes, goals, and assists that add up to the stored appearances. Players, contracts, money, and attributes are otherwise unchanged.

A loading message may say the matchday is being calculated. It must not present a live ticker or accept a tactical change during the match.

## 3. Prerequisites

Phase 7 exit behavior is the input. Required native commits, oldest first:

| Guide | Commit | Subject |
| --- | --- | --- |
| `P07-G06` | `3b190ba255ae8a56670c571b10bf235119fe4211` | `feat(p07-g06): advance native careers deterministically` |
| `P07-G07a` | `64758ae988d19352fbb784ada62f032960dc8a62` | `refactor(p07-g07a): remove non-standalone compatibility` |
| `P07-G07` | `364f4d333629efc4f24cd3a5c6b7359c06a0ff95` | `test(p07-g07): verify native standalone foundations` |

Inspect before `P08-G01`:

- `MASTER_PLAN.md` §§4.3, 4.6, 7.3, 7.5, 7.6, and 12.2
- `plans/phase7.md` handoff and `src-tauri/crates/game-core/src/calendar.rs`
- `src-tauri/crates/game-core/src/rows.rs`, `snapshot.rs`, `validate.rs`, `ability.rs`, `selection.rs`, `random.rs`, `progression.rs`
- `src-tauri/migrations/0002_standalone.sql` — frozen. Do not edit it.
- `src-tauri/crates/game-store/src/lib.rs`, `mapping.rs`, `snapshots.rs`, `mutations.rs`
- `src-tauri/crates/game-app/src/progression.rs`, `reads.rs`, and `src-tauri/src/lib.rs`
- `src/platform/game-client.ts`, `src/platform/native-client.ts`
- `src/app/native/NativeProgression.tsx`, `NativeScreenTables.tsx`, `NativeWorkspace.tsx`
- `src/domain/matches/xg.ts` — milli-unit parse/format convention only. Do not call the browser match journal from the desktop product.

`0002_standalone.sql` stays byte-for-byte unchanged. Schema 1 and other unsupported files stay rejected without a write. Desktop/browser E2E, manual acceptance, and user sign-off are not gates (DEC-005).

## 4. In scope / out of scope

### In scope

- Schema 3 tables for fixtures, simulated matches, and simulated appearances.
- Snapshot import of source schema 2 with empty match collections, and export of source schema 3.
- Pure 18-club calendars, dates, and standings.
- One strength function shared by selection and the match engine.
- Managed legal-lineup checks, AI selection, emergency selection, and a documented automatic substitution policy.
- A pure seeded instant engine with a coherent timeline, xG, ratings, fitness, injuries, and one-match bans.
- One atomic Sim Matchday for all 36 fixtures on the current round date, including the first-round calendar insert.
- Fixtures & Results, the command-center action, and squad performance totals.
- Rust/SQLite tests for one round and one full season.

### Out of scope

| Item | Phase |
| --- | --- |
| AI bids, negotiations, reservations, and AI-to-AI transfers | Phase 9 |
| Growth, contract expiry, retirement, academy, awards, prize money, and rollover | Phase 10 |
| Radar charts, archetypes, and insight sentences | Phase 11 |
| Remapped restore and CSV/JSON dataset import | Phase 12 |
| Installer signing, updater certification, and performance budgets | Phase 13 |
| Live ticker, pause, in-match changes, own goals, cups, extra time, and penalty shootouts | Deferred |

Also out of this phase: editing `0002_standalone.sql`, a second match engine in TypeScript, manual result entry, changing player attributes or contracts, posting ledger rows, generating offers, and skipping an unplayed round.

## 5. Architecture impact

```text
game-core     rows, validation, schedule, standings, strength, selection, engine
game-store    0003 migration, mappings, snapshot columns, atomic matchday write
game-app      preview/commit orchestration and matchday read model
src-tauri/src thin preview_matchday, sim_matchday, and matchday_view commands
src/platform  generated DTOs and GameClient methods
src/app/native  Sim Matchday, Fixtures & Results, squad totals
```

```text
preview_matchday
  → load authoritative snapshot
  → pure schedule/selection/engine outside the transaction
  → return the next action or a blocker; write nothing

sim_matchday
  → recheck revision, source date, cursor, and logical receipt
  → insert the season calendar on the first matchday only
  → write 36 results, appearances, availability, clock, receipt, and audit
  → increment the campaign revision once
```

React never supplies a score, xG, event, or appearance. Generated TypeScript types are not validation. `game-core` still imports neither SQLite nor Tauri.

### 5.1 Planning assumptions

These are the smallest readings that keep the master invariants implementable. A later phase may replace a heuristic only behind a new engine version.

1. **Engine version.** `MATCH_ENGINE_VERSION` is `"1"`. It is stored on each simulated match. Existing `simulationVersion` and `calendarVersion` remain `"1"`. `derive_event_seed` continues to receive stream version `"1"` and `EventKind::Fixture`.
2. **Schema.** Fresh databases run frozen `0002_standalone.sql`, then `0003_matchday.sql`. An existing schema 2 file receives only `0003`. User version becomes 3. Source schema 2 snapshots remain importable; missing match arrays mean empty arrays. New exports use source schema 3. Import never generates fixtures.
3. **League key.** Generated leagues already have unique tiers 1–4. The stable league key is `league-tier:{tier}`. Missing or duplicate tiers refuse scheduling. Club order inside a league is `simulationKey` in Unicode scalar order. Entity IDs are not part of fixture keys or seeds.
4. **Calendar.** Round 1 is September 1 of the season start year. Round `r` is that date plus `(r - 1) * 7` days, through `add_days`. The winter window does not pause the league. All four leagues share those dates. Round 34 stays on or before June 30.
5. **Fixture key.** `season:{year}:league-tier:{tier}:round:{rr}:home:{homeKey}:away:{awayKey}` with a two-digit round.
6. **Pairings.** Use the circle method in guide 2. The first half produces one meeting. Rounds 18–34 reverse home and away in the same pair order. Tests pin round 1 and the 306/1,224 counts.
7. **xG and goals.** xG is milli-units from 0 through 20,000. Goals per team are integers from 0 through 15. There is no own-goal event. Team xG is the sum of that team's chance milli-units. The score is the number of goal events.
8. **Ratings.** Stored 0–100. The UI labels the scale. It does not invent a second stored scale.
9. **Registration.** The managed club uses competition key `league`. Eligible means status `registered` or `ageExempt: true`, plus an active contract, active life, no current injury, and `suspensionMatches == 0`. AI clubs are not registration-gated in this phase. Generated AI squads have no registration rows.
10. **Managed lineup.** Use the active-season lineup with the latest `updatedAt`, then the lowest lineup id. A legal match lineup has 11 unique starters covering the formation, a goalkeeper in the goal slot, and at most 9 bench players. Extra saved bench players beyond 9 are ignored for the match and are not deleted.
11. **Blocker and emergency.** If the managed club can field 11 eligible players including a goalkeeper, an illegal or missing lineup blocks the whole matchday and writes nothing, including the first-round calendar. If fewer than 11 such players exist, that match uses the emergency picker and the report says `Emergency selection`. AI clubs always use the automatic picker. Emergency may include an injured player only when fewer than 11 non-injured candidates exist. A suspended player is included only when fewer than 11 non-suspended candidates exist. The saved lineup is not overwritten.
12. **Substitutions.** At most five per team. Planned swaps are deterministic from kickoff fitness and do not draw random numbers. An injury may consume a remaining slot. A sending-off has no replacement.
13. **Availability.** `injuryUntilDate` is the first date the player is available. A red card, including a second yellow, adds exactly one to `suspensionMatches` after bans already due for this fixture are decremented. Players who were suspended at kickoff decrement once for this club fixture even when emergency selection fielded them.
14. **Clock.** The first successful matchday on consumed September 1 kickoff inserts the calendar and plays round 1. The date then becomes the next round date. After round 34 the phase is `review`, the date stays the final match date, and the next action is the Phase 10 sentence. July and August Continue behavior stays as Phase 7 left it.
15. **Money and identity.** Matchday changes no ledger, contract, attribute, ownership, constitution, offer, or registration row. New row IDs come from the request boundary, never from the match PRNG.

### 5.2 Strength, selection, and engine

All arithmetic is checked integer arithmetic.

`role_ability` in `ability.rs` remains the base. Goalkeepers with a stored `goalkeeping` value use that value when it is inside 0–100. Otherwise the base is `role_ability` for the player's position group.

```text
slot_base = base                         when player group == slot group
slot_base = base * 3 / 4                 when both are outfield and the groups differ
slot_base = base / 2                     when one group is GK and the other is not
effective = slot_base * fitness / 100 * (50 + sharpness) / 150
```

Fitness and sharpness are 0–100. Home advantage adds 4 to each home outfield starter and 2 to the home goalkeeper after `effective`.

AI and emergency ranking for a slot, highest first: effective strength, fitness, sharpness, then `simulationKey` ascending. AI formation is `4-3-3`. Fill slots in `formation_slots` order. Prefer a true goalkeeper for the goal slot.

Attack strength is the sum of effective strengths of starters in forward and midfield slots. Defense strength is the defensive starters plus the goalkeeper. Before home-advantage additions are folded in, those sums already include them when the starter is home.

```text
home_chances = clamp(10 + (home_attack - away_defense) / 50, 4, 16)
away_chances = clamp(8 + (away_attack - home_defense) / 50, 3, 16)
```

Chances alternate home, away, home, away. The extra home chances come last. Minute for ordered chance `i` of `n` is `1 + (i * 88) / n`, with `i` starting at 0. The shooter rotates through the team's forward starters, then midfield starters. Chance xG milli-units are:

```text
clamp(40 + shooter_effective * 2 - opposing_defense / max(1, opposing_defender_count) / 2, 20, 800)
```

A goal occurs when `next_int(1000) < xg_milli`. The assist is the previous shooter for that team, if any.

After chances, each starter is considered in slot order. A player already sent off is skipped. A draw below 8 on `next_int(100)` is a yellow. A second yellow is also a red at that minute. A separate draw below 1 is a straight red. Planned substitutions happen at 60 when kickoff fitness is below 60, otherwise at 75 when it is below 80, only when a same-group bench player has higher fitness. Injury risk for a player who finished the chance phase still on the pitch is `next_int(1000) < 30 + (100 - kickoff_fitness)`. Duration is `7 + next_int(22)` days. The replacement uses the same bench ordering and must be unused.

```text
rating = clamp(60 + goals * 8 + assists * 4 + result_bonus + clean_sheet_bonus - conceded, 1, 99)
result_bonus = 8 / 0 / -6 for a win / draw / loss
clean_sheet_bonus = 6 for a goalkeeper who conceded zero, otherwise 0
```

`conceded` is goals conceded for a goalkeeper and 0 for everyone else.

Post-match club update, applied to every player still contracted to a club that played:

```text
played 90:     fitness = clamp(fitness - 12, 40, 100); sharpness = min(100, sharpness + 4)
played 1–89:   fitness = clamp(fitness - 6, 40, 100);  sharpness = min(100, sharpness + 2)
unused player: fitness = min(100, fitness + 8);        sharpness = max(0, sharpness - 3)
injured player: no sharpness or fitness gain
```

These formulas are gameplay heuristics. Tests pin the arithmetic, the draw order, and reconciliation. They do not pin a real-world score distribution.

### 5.3 Storage

`src-tauri/migrations/0003_matchday.sql` adds three campaign-scoped STRICT tables. IDs use the existing 1–64 URL-safe check. Money columns are not required.

`fixtures`: season, league, round 1–34, match date, home club, away club, stable `fixtureKey`, and `scheduled | played`. Unique on `(campaignId, id)`, `(campaignId, fixtureKey)`, and `(campaignId, seasonId, round, homeClubId)`.

`simulatedMatches`: unique `(campaignId, fixtureId)`; home and away goals 0–15; both xG milli-units 0–20,000; timeline JSON; input snapshot JSON; event seed; `engineVersion = '1'`.

`simulatedAppearances`: unique `(campaignId, fixtureId, playerId)`; historical `clubId`; started flag; minutes 0–90; goals and assists 0–15; rating 0–100; yellow cards 0–2; red cards 0–1.

Rebuild `auditEvents` in that migration so `simulation.matchday` is an allowed action, copying existing rows in the same transaction. Do not reuse `simulation.advance` for a matchday.

Snapshot vectors `fixtures`, `simulatedMatches`, and `simulatedAppearances` deserialize with `#[serde(default)]`. Limits: fixtures and matches up to 2,048 each; appearances up to 80,000. Timeline and input-snapshot JSON stay bounded: at most 80 timeline events, and no nested attribute blobs. A full-season export must remain at or below the existing 32 MiB snapshot ceiling.

`OutcomeRef` gains `fixture` and `match` variants. Old receipts stay valid.

### 5.4 Command identity

Operation key: `season:{seasonId}:matchday:{YYYY-MM-DD}`.

The fingerprint covers campaign id, expected revision, source date, source boundary, target date, engine version, root seed, ordered fixture keys, and ordered selection material (`simulationKey`, slot, strength, fitness, sharpness, suspension). It excludes action, audit, and receipt ids, row ids, and `now`.

A matching receipt returns the stored outcome and current revision with `replayed: true` and no new write. The same key with a different fingerprint is a conflict. A stale revision writes nothing.

Request IDs are supplied by the client for the new fixture, match, appearance, receipt, and audit rows. The pure engine returns stable slots in fixture-key order. The application assigns the supplied IDs onto those slots before the transaction. The PRNG is not an ID generator.

### 5.5 Reads and UI

`matchday_view` returns one round: 36 fixtures, played results when present, and four 18-row tables. The generic 50-row screen page is not the fixture list. The default round is the latest played round, or round 1 when none are played.

Before the calendar exists, squad minutes, goals, and assists render `Unknown`. After it exists, a player with no appearance renders `0`.

Standings text includes: `Order: points, goal difference, goals scored, then club simulation key.`

Command Center shows the game date, the next opponent, and **Sim Matchday**, or the lineup blocker and its remedy. After round 34 it shows the Phase 10 sentence and no simulate button. Continue remains the control for July 1 and August 31 only.

## 6. Work breakdown and dependency graph

```text
P08-G01 storage
  → P08-G02 pure calendar and standings
    → P08-G03 pure strength and selection
      → P08-G04 pure match engine
        → P08-G05 atomic command and UI
          → P08-G06 full-season certification
```

| Guide | Goal | Files | Tests | Blocked by |
| --- | --- | --- | --- | --- |
| G01 | Empty match schema and snapshot compatibility | migration, rows, mapping, store | schema 2 upgrade, schema 1 refusal, empty import | Phase 7 |
| G02 | Deterministic calendars and tables | new core schedule module | pair counts, pinned round 1, leap date, tie-break | G01 types may be absent; pure only |
| G03 | Legal XI, AI picker, sub policy | new core selection-strength module | blockers, emergency, fatigue order | G02 not required for pure tests |
| G04 | One pure match | new core engine module | reconciliation, seed stability, ban/injury arithmetic | G03 |
| G05 | Persist a round and show it | app, store, IPC, native UI | real SQLite round, retry, rollback, UI | G01–G04 |
| G06 | Season certification | integration tests, README, this progress log | 1,224 results, reopen, isolation | G05 |

G02 and G03 may land before G01's tables are queried. They must not write SQLite. G05 is the first guide allowed to change the kickoff stop.

## 7. Acceptance criteria

1. A schema 2 save opens as schema 3 with empty match tables, and a schema 1 file is unchanged.
2. A source schema 2 snapshot imports without inventing fixtures. A schema 3 export reloads the same rows.
3. Each league has 306 fixtures, 34 rounds of 9, and one home and one away meeting per pair. The world has 1,224 fixtures.
4. The same seed, lineup, and fitness produce the same events. A new transport id does not.
5. The managed club cannot simulate an illegal lineup while a legal XI is possible. The command writes nothing in that case.
6. One confirmed matchday stores 36 matches or none. Retry does not duplicate them or advance the date again.
7. Score, scorers, assists, minutes, cards, and team xG reconcile. Each player appears at most once per fixture.
8. A sending-off bans the next league match. Decrement and new ban do not erase each other.
9. Tables use the published tie-break, including the simulation-key order.
10. After 34 rounds the phase is review and rollover is refused. No ledger, contract, or attribute row changed because of results.
11. Keyboard users can read the blocker, run the matchday, and read both teams' events.

## 8. Verification

```bash
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

Run the focused Cargo and Vitest files named in the active guide before the full set. Unit and integration tests plus these checks are sufficient (DEC-005). Native tests use temporary SQLite files. A mocked `invoke` does not replace a store test. No desktop session or manual sign-off is required.

Failure cases that must be explicit tests by G06: stale revision, fingerprint conflict, injected commit failure, concurrent same-day calls, store close/reopen, a second campaign, unsupported schema, and the review stop.

## 9. Risks, mitigations, rollback

| Risk | Mitigation |
| --- | --- |
| A failed matchday leaves a partial calendar or clock | One transaction; fault injection must observe zero new rows |
| Retry rerolls results | Logical receipt and fingerprint; PRNG output is not stored separately from the match |
| ID order changes the score | Seeds use simulation keys; tests change only the supplied IDs |
| Schema 2 careers stop opening | Upgrade test from a real schema 2 file; do not edit `0002` |
| An unsupported file is migrated | Keep the existing byte-for-byte refusal |
| The managed club can deadlock | Emergency selection only when 11 eligible players do not exist; otherwise a blocker |
| Export exceeds 32 MiB | Compact timeline and one input snapshot per match; G06 measures the full-season export |
| UI shows a live match | Copy and disabled controls say the result is instant |
| Later lineup edits rewrite history | The match stores its own input snapshot |

Rollback is a forward schema fix or a restored backup. Do not downgrade user version 3 or delete match rows to recover a bug.

## 10. Exit criteria and handoff

- [ ] G01–G06 are committed with recorded checks in the progress log.
- [ ] Schema 3 is the native schema, and schema 2 snapshots still import.
- [ ] A fixed seed completes 34 rounds, reopens, and replays without a second set of results.
- [ ] Review refuses rollover with the Phase 10 sentence.
- [ ] README describes Sim Matchday and does not claim negotiations or a second season.

### Progress log

| Guide | Commit | Checks |
| --- | --- | --- |
| G01 | `20b0ae3` | Schema 3 storage and snapshot contracts implemented. All 69 Rust workspace tests pass (`cargo test --workspace --locked` from `src-tauri`), including 19 persistence tests; all 18 native UI tests also pass separately. All 699 frontend tests pass with `pnpm test --maxWorkers=1`; earlier concurrent runs hit timing failures. Bindings check, Rust formatting, lint, typecheck, production build, and Tauri MSI/NSIS build pass. `0002_standalone.sql` is unchanged and kickoff still stops at the Phase 8 sentence. `native:check` is blocked at Clippy by Windows Application Control (OS error 4551), including outside the sandbox; its workspace test portion passed separately. |
| G02 | `c6d11df` | Pure circle-method calendar produces 1,224 fixtures with stable keys and weekly dates; standings use points, goal difference, goals scored, then Unicode scalar key order. All 77 Rust workspace tests pass, including 8 schedule tests for pair/venue counts, pinned round 1, leap dates, ordering, invalid inputs, and arithmetic overflow. Rust formatting, lint, typecheck, and production build pass. All 699 frontend tests pass with `pnpm test --maxWorkers=1`. `native:check` remains blocked at Clippy by Windows Application Control (OS error 4551), including outside the sandbox; workspace tests passed separately. No persistence, IPC, UI, DTO, or dependency changes. |
| G03 | `82ce150` | Added pure shared strength, managed lineup eligibility/blockers, deterministic AI/emergency selection, and five-substitution planning, with 12 focused Rust tests and crate-boundary coverage. Kickoff fitness, sharpness, injury return date, and suspension count are retained in selected players. Rust formatting, lint, typecheck, production build, and all 699 frontend tests (`pnpm test --maxWorkers=1`) pass. Native verification remains incomplete: focused tests, workspace tests, and `native:check` are blocked before execution by Windows Application Control (OS error 4551) on the rebuilt `thiserror` dependency helper, including outside the sandbox; a release-profile attempt was similarly blocked on dependency helpers. An earlier Clippy test-only clone warning was fixed, but the final Rust suite has not run. No match events, persistence, IPC, UI, DTO exports, or dependency changes. |

### Handoff to Phase 9

Phase 9 may assume fixtures and results exist, appearances are unique, and the clock can sit on a match date inside a transfer window. It must not reinterpret stored results. Winter and summer windows still have no AI offers until Phase 9 adds them. Phase 10 owns awards, growth, contract expiry, and the next season's calendar.
