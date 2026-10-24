# Phase 10 — Player lifecycle and sustainable seasons

> **Authority:** `MASTER_PLAN.md` 3.0.4 / DEC-003 / DEC-004 / DEC-005 / DEC-006
> **Phase IDs:** `P10-G01` … `P10-G06`
> **Status:** Not started. Phase 9 is complete through G06. These documents authorize the lifecycle plan only. They do not implement it, and they do not claim a new native-check run.
> **Predecessor:** Phase 9 market certification, `test(p09-g06): verify transfer budgets and deadlines` at `6611732fd234655395b874e05238ef70a6151c9c`. This file does not authorize scouting charts, dataset import, or release work.

## 1. Parent plan contract

Authority is `MASTER_PLAN.md` `3.0.4`. On conflict, the master plan wins. This phase plan wins over any `plans/phase10/guide<number>.md`.

Relevant master sections:

- **§1.3 and §1.5** — Finish a season, settle prizes and objectives once, develop players, and open the next season with an explicit budget. No dismissal, cups, promotion, or weekly payroll cash.
- **§2** — Pure `game-core`, application services in `game-app`, SQLite in `game-store`, thin Tauri commands, `GameClient`. CPU work stays outside the short write transaction.
- **§3.1 and §3.3** — Seasons shows review, objectives, settlement, and the next-season preview. The command center names the next action.
- **§4.1 invariants 3, 7, 8, 9, and 12** — Integer cents. Confirmation authorizes one bounded action and its autonomous consequences. Receipts and audits persist. Seeds exclude remappable IDs and audit time. A settlement commits together or not at all.
- **§4.2** — `DevelopmentPlan.target_role` can direct growth. Notes alone do not. Exactly one active contract per owned active player.
- **§4.3** — `BoardObjective` and `SeasonSettlement` / `DevelopmentSnapshot` begin here. A settlement is unique per period. Historical appearances keep their club and rating.
- **§4.6** — Independent development-engine version. A retry returns the stored outcome and does not reroll. `EventKind::Development` already exists.
- **§5.2 and §5.3** — `PRESTIGE_BID_SALE` still blocks rollover while a qualifying offer is unresolved. Prize cash and objective bonuses are credited to the new season. Carryover excludes those awards. `prizeReinvestmentPct` applies once, on the new season.
- **§6.3** — Academy intakes are fictional participants for every club. Growth is bounded, split across midseason and season end, and is not a second full 1–4 addition. Decline is position-aware. Retirement and intake keep every club playable.
- **§7.1 and §7.2** — Contract expiry and year-end settlement run before the next season is initialized. Challenge cannot manufacture attributes, values, or money. First-season contracts already reach at least June 30.
- **§7.6** — Rollover requires every fixture resolved, obligations cleared, and an explicit review, preview, and confirm. Awards, contracts, growth, academy, and the next calendar are written once.
- **§12.2 invariants 8, 18, and 21** — Each period applies once. Awards land on the opening season and stay out of closing carryover. Multi-season squads stay viable.

Roadmap entries, in order:

| ID | Deliverable | Commit subject |
| --- | --- | --- |
| `P10-G01` | Objectives, award tables, settlement and development receipts, and the SQLite migration | `feat(p10-g01): add lifecycle storage contracts` |
| `P10-G02` | Bounded midseason and season-end growth, decline, and value recalculation | `feat(p10-g02): plan bounded player development` |
| `P10-G03` | Renewal, expiry, retirement, and academy replenishment for every club | `feat(p10-g03): plan renewals retirements and intake` |
| `P10-G04` | Atomic season settlement, next-season allocation, prizes, carryover, and fixtures | `feat(p10-g04): settle a season atomically` |
| `P10-G05` | Review, preview, and confirm UI, objective outcomes, and development history | `feat(p10-g05): review and confirm the next season` |
| `P10-G06` | Multi-season deterministic, financial-boundary, and roster-sustainability tests | `test(p10-g06): verify multi-season squads and awards` |

One guide is one commit. Split a guide only by editing this phase file first.

## 2. Phase objective and user-visible outcome

At the end of Phase 10, a standalone career that has played its season can:

1. After the halfway matchday, run **Apply Development** once. Changed players keep the new attributes and market value after reload. Repeating the command does not grow them again.
2. Open Seasons from review and read the final position, three objective outcomes, the prize, the carryover, and the next board allocation before anything is written.
3. Confirm **Start Next Season** once. The clock is July 1 of the next year, Command Center shows **Run Market**, and the new league fixtures exist with no results.
4. See prize and objective cash on the new season only. The closing season's ledger does not gain a second copy. A repeated confirm does not pay again.
5. See renewals, releases, retirements, and academy intakes in that same confirm. Every club still has a goalkeeper pair and enough contracted players to name a side. Retired players remain in old match rows.
6. Reload, retry, or reopen and find one settlement, one set of snapshots, and the same balances. An open qualifying bid still blocks the confirm.
7. Read a player's development history as before-and-after ratings. The screen does not draw a radar chart.

A loading message may say `Calculating the new season.` or `Calculating player development.` It must not play the next season by itself.

## 3. Prerequisites

Phase 9 exit behavior is the input. Required native commit:

| Guide | Commit | Subject |
| --- | --- | --- |
| `P09-G06` | `6611732fd234655395b874e05238ef70a6151c9c` | `test(p09-g06): verify transfer budgets and deadlines` |

Inspect before `P10-G01`:

- `MASTER_PLAN.md` §§4.3, 5.2, 5.3, 6.3, 7.1, 7.2, and 7.6
- `plans/phase9.md` handoff, `src-tauri/crates/game-core/src/calendar.rs`, and `matchday.rs` (`ROLLOVER_UNAVAILABLE`)
- `src-tauri/crates/game-core/src/rows.rs`, `enums.rs`, `policy.rs`, `finance.rs`, `schedule.rs`, `ability.rs`, `generation_settings.rs`, `random.rs`
- `src-tauri/crates/game-core/src/settlement.rs` — transfer settlement. Do not put season logic in this file.
- `src-tauri/migrations/0002_standalone.sql`, `0003_matchday.sql`, and `0004_market.sql` — frozen. Do not edit them.
- `src-tauri/crates/game-store/src/lib.rs`, `mapping.rs`, `snapshots.rs`, `mutations.rs`
- `src-tauri/crates/game-app/src/progression.rs`, `matchday.rs`, `market.rs`, `settlement.rs`, and `src-tauri/src/lib.rs`
- `src/platform/game-client.ts`, `src/platform/native-client.ts`
- `src/app/native/NativeProgression.tsx`, `NativeScreen.tsx`, `NativeScreenTables.tsx`, `NativePlanningEditor.tsx`
- `src/app/routes.ts` — the Seasons section already exists

`0002_standalone.sql`, `0003_matchday.sql`, and `0004_market.sql` stay byte-for-byte unchanged. Schema 1 and other unsupported files stay rejected without a write. Desktop/browser E2E, manual acceptance, and user sign-off are not gates (DEC-005).

## 4. In scope / out of scope

### In scope

- Schema 5 objectives, season settlements, development snapshots, ledger award metadata, and snapshot compatibility with source schemas 2, 3, and 4.
- Pure growth, decline, value, renewal, retirement, and academy plans.
- One midseason development command and one season-settlement command.
- Closing open non-compulsory negotiations and offers inside settlement, releasing each reservation once.
- Next-season board allocation, prize cash, objective cash, carryover, fixtures, and July 1 clock.
- Seasons review UI, development history, and the command-center actions.
- Rust/SQLite tests for one-time awards, replay, squad viability, and the qualifying-offer block.

### Out of scope

| Item | Phase |
| --- | --- |
| Radar charts, archetypes, insight sentences, and the age/minutes matrix | Phase 11 |
| Remapped restore, CSV/JSON dataset import, and a larger export format | Phase 12 |
| Installer signing, updater certification, performance budgets, `ARCHITECTURE.md`, and PWA/service-worker work | Phase 13 |
| Loans, clauses, installments, staff, morale, and manager dismissal | Deferred |

Also out of this phase: editing `0002`, `0003`, or `0004`; a second lifecycle engine in TypeScript; manual attribute or money edits; deleting retired players; rewriting stored matches or appearances; debiting weekly wages from transfer cash; and copying historical lineups into the next season.

Older Phase 1–6 documents that point `ARCHITECTURE.md` or the PWA at Phase 10 are historical. Master 3.0.4 assigns that work to Phase 13.

## 5. Architecture impact

```text
game-core     lifecycle rows, awards, growth, roster plan, settlement plan
game-store    0005 migration, mappings, snapshot columns, atomic lifecycle writes
game-app      preview/commit orchestration and season-review read model
src-tauri/src thin development, season-preview, and settle commands
src/platform  generated DTOs and GameClient methods
src/app/native  Apply Development, Review Season, Seasons confirm, history
```

```text
preview_development / preview_season
  → load authoritative snapshot
  → pure plan outside the transaction
  → return the plan or a blocker; write nothing

apply_development
  → recheck revision, round-17 cursor, and logical receipt
  → write changed attributes, values, snapshots, receipt, and audit

settle_season
  → recheck the same way, plus fixture completion and qualifying offers
  → growth, contracts, intake, awards, next season, fixtures, clock
  → one revision
```

React never supplies an attribute delta, a prize, or a budget figure. Generated TypeScript types are not validation. `game-core` still imports neither SQLite nor Tauri. Season logic does not go into `settlement.rs` or `game-app/src/settlement.rs`; those files remain the transfer path. New modules are `lifecycle.rs` in `game-core` and `game-app`.

### 5.1 Planning assumptions

These are the smallest readings that keep the master invariants implementable. A later phase may replace a heuristic only behind a new engine version.

1. **Engine version.** `DEVELOPMENT_ENGINE_VERSION` is `"1"`. Store it on each objective, settlement, and development snapshot. Match engine `"1"`, market engine `"1"`, `simulationVersion`, and `calendarVersion` stay `"1"`. Development streams use `derive_event_seed` with stream version `"1"` and `EventKind::Development`.
2. **Schema.** Fresh databases run frozen `0002`, frozen `0003`, frozen `0004`, then `0005_lifecycle.sql`. An existing schema 4 file receives only `0005`. A schema 3 file receives `0004` and then `0005`. User version becomes 5. Source schema 2, 3, and 4 snapshots remain importable. Missing new tables mean empty arrays. New ledger columns default to null. New exports use source schema 5. Import never generates objectives, settlements, or growth.
3. **Two periods.** Midseason is the stored round-17 fixture date, after that matchday is consumed and before the date moves on. Season end is the existing review state after round 34. Each period has its own operation key. Season-end growth is part of settlement, not a second button.
4. **Missed midseason.** A review with no midseason receipt receives only the season-end half of that season's growth budget. The skipped half is not paid later.
5. **Who changes.** Every active player with six attributes, a potential, and an age can be planned. Retired players are skipped. Free agents are included. Notes on a development plan do not add points. A `target_role` that parses as `GK`, `DEF`, `MID`, `FWD`, or a known position selects that group's `role_ability` weights. Any other text leaves the player's own position group in charge.
6. **Age.** Completed years from `birthDate` to `state.current_date`. If `birthDate` is absent, use `reportedAge`. A missing age skips growth, decline, renewal wage maths, and retirement for that player, and leaves the player unchanged.
7. **Obligations.** Settlement requires review, all of that season's fixtures played, and zero open offers whose stored snapshot still qualifies. `PolicyAction::SeasonRollover` is the existing gate. Open non-compulsory negotiations and offers expire inside the successful settlement and release reservations once. Settlement does not complete a transfer and does not rerun a market tick.
8. **Next clock.** After a successful settlement the date is the next July 1, the phase is `preseason`, the cursor is null, and the active season is the new row. That is the Phase 9 state in which **Run Market** is the next action. `schedule_season` builds the new 1,224 fixtures from the next start year. Results are not copied.
9. **History.** Appearances, matches, fixture rows, and old-season registrations stay as stored. Player attribute and value changes do not rewrite a match input snapshot. Old-season lineups stay on the old season. The new season starts without a copied lineup.
10. **Money split.** League prize cash and met objective cash are added to `transfer_balance_cents` and to `prize_income` rows on the new season. The closing season gets neither. Board allocation and carryover are ledger capacity for the managed club. They do not add cash on top of the prize. Weekly wages are not debited from transfer cash.
11. **Identity.** One `SeasonSettlement` per closing season. One development snapshot per player per period, and only when that player changes. Receipts reference the settlement or the development boundary, not every player or fixture. The 32-reference limit stays.
12. **World size.** `schedule_season` still requires four leagues of 18 clubs. Settlement of any other shape is refused with `The calendar requires four leagues of 18 clubs.` Player rows stay at or below 8,000. A plan past that limit returns `The squad list cannot grow past 8000 players.` Development snapshots stay at or below 16,000. A plan past that limit returns `Development history cannot grow past 16000 rows.` Either refusal writes nothing.
13. **Years.** The next start year must satisfy `season_dates`. A next July 1 outside 1900–2198 writes nothing.
14. **Challenge.** No command in this phase edits an attribute, a wage, a prize, or a squad by a client-supplied number. Sandbox may still edit the constitution through the existing audited save. That save does not post a second opening allocation.

### 5.2 Awards and objectives

Standings are `schedule::standings`. Position 1 is the first row. Prize and objectives use that order. The published tie-break already makes positions unique.

League prize, in cents, for every club in every league:

```text
prize_cents = (19 - position) * 10_000_000
```

Position 1 is €1,800,000. Position 18 is €100,000. This is a gameplay heuristic.

The managed club has three immutable objectives. AI clubs do not.

| Kind | Met when | Reward cents |
| --- | --- | --- |
| `league_title` | position is 1 | 50_000_000 |
| `top_half` | position is 1 through 9 | 20_000_000 |
| `avoid_last` | position is 1 through 17 | 10_000_000 |

A champion can meet all three. The objective bonus is the sum of the met rewards. Missing an objective stores `missed` and pays nothing. There is no dismissal and no fine.

`BoardObjectiveRow` fields: campaign, season, managed club, kind, target position (`1`, `9`, or `17`), reward cents, outcome `pending | met | missed`, engine version `"1"`. Unique on `(campaignId, seasonId, kind)`.

Settlement writes the closing season's three rows with `met` or `missed`, and the next season's three rows as `pending`, using the constitution in force at confirm. A later constitution save does not rewrite stored rows.

Until the first settlement, no objective rows exist. The preview computes the same three definitions in memory. Seasons, before that confirm, can show the same unpaid definitions labeled `Pending` without writing.

### 5.3 Growth, decline, and value

All arithmetic is checked integer arithmetic. Division truncates toward zero. Unknown is not zero. A player missing an attribute, potential, or age is omitted from the plan.

`role_ability` is the ability input. `generation::market_value_cents` is the value input. Do not copy a second value formula and do not use the Phase 9 bid-demand formula.

Season minutes are simulated appearance minutes for fixtures in the active season. Midseason counts minutes on fixtures dated on or before the round-17 date. Season end counts the whole season.

```text
headroom = max(0, potential - role_ability)
participation = min(minutes, 1530) * 100 / 1530
age_pct = 100 when age <= 21
        = 75 when age <= 24
        = 40 when age <= 27
        = 0 when age >= 28
annual = min(4, headroom) * participation / 100 * age_pct / 100
```

1530 is 17 matches of 90 minutes. `annual` is an attribute-point budget from 0 through 4.

Midseason applies `annual / 2` and stores that count. Season end recomputes `annual` from the post-midseason player and the full minutes, then applies:

```text
end_points = min(annual / 2, 4 - already_applied)
```

`already_applied` is 0 when no midseason snapshot or receipt exists. The two applications together stay at or below 4. They are never both a fresh 1–4 roll.

Spend points one at a time on the group's six weights, highest weight first. Equal weights break by the fixed order pace, finishing, passing, dribbling, defending, physical. Skip an attribute that is already 100, or that would push `role_ability` above potential. Drop a point that no attribute can take.

Decline replaces growth at season end when `end_points` is 0 and age is at least 33. It does not run at midseason.

```text
goalkeeper: 36–37 → 1, 38 or older → 2, otherwise 0
outfield:   33–34 → 1, 35–36 → 2, 37 or older → 3
```

Remove points from the highest-weight attributes first. No attribute drops below 1. Decline is position-aware because the weights are. Store decline as a negative point count.

After a change, set `market_value_cents` from `market_value_cents(age, role_ability, potential)`. When the player is a goalkeeper, set `goalkeeping` from `goalkeeper_rating`. Leave fitness, sharpness, injury, and suspension unchanged. Leave potential unchanged.

A snapshot stores the six before and after attributes, both values, both life statuses, the signed points, the period `midseason | season_end`, and engine version `"1"`. Unchanged players get no row.

### 5.4 Contracts, retirement, and academy

Evaluate retirement on the review date, after season-end development and before renewal.

```text
goalkeeper retires at age >= 38
every other known position group retires at age >= 36
```

Retirement sets `PlayerLife::Retired`, `club_id` to null, and the active contract to `ended`. The player stays in the database. Appearances stay.

A contract with `expires_on` on or before the closing season's June 30 end date expires. Later contracts stay. An expired player who did not retire is renewed onto the same club when the wage fits:

```text
tier = tier_for(age, role_ability)
wage = weekly_wage_cents(age, role_ability, tier)
starts_on = next July 1
expires_on = June 30 of (next start year + 2)
```

The managed club also has to pass the constitution wage-tier cap. AI clubs are not gated by that cap. They are gated by `wage_budget_weekly_cents`. If the tier wage does not fit the budget or the managed cap, retry once at youth tier. If that still does not fit, release the player: contract `ended`, `club_id` null, life status stays `active`.

Do not release a player whose contract is still in force. If non-expiring wages already exceed the budget, renew nobody and add no intake at that club.

Academy intake is part of the same plan, for every club, ordered by `simulationKey`.

```text
base_count = academy_tier + 1
```

`academy_tier` is already 1 through 5, so the base is 2 through 6. Add further players, up to 10 new players for that club, until the club has at least two contracted goalkeepers, one defender, one midfielder, one forward, and 16 contracted active players. If 10 new players cannot reach that floor, the whole settlement is refused with `A club cannot field a legal squad next season.`

Each new player:

- Age 16 on the next July 1. `birthDate` is `{nextStartYear - 16}-07-01`. `reportedAge` is 16. `is_newgen` is true. `source` is `generated`.
- `simulationKey` is `newgen:{closingStartYear}:{clubSimulationKey}:{index}` with index starting at 0.
- One position: `GK`, `CB`, `CM`, or `ST`, chosen to fill the shortages above and then rotating GK, DEF, MID, FWD.
- All six attributes are set so `role_ability` equals `35 + academy_tier * 5`. Potential is `min(100, ability + 15)`.
- Name and nationality come from one `EventKind::Development` draw per club, keyed by `season:{closingSeasonId}:academy:{clubSimulationKey}`, using the existing fictional given-name, family-name, and nationality lists. Attributes do not use a draw.
- Youth contract, wage from `weekly_wage_cents`, start next July 1, expire June 30 of `nextStartYear + 3`.
- Simulation profile: fitness 100, sharpness 80, no injury, no ban, homegrown club and nation true, goalkeeping filled only for goalkeepers.

After renewals and intake, active wages must fit `wage_budget_weekly_cents`. Drop intake from the end of that club's list until they fit. A dropped intake player is not created.

Managed-club registrations for the new season: copy a `registered` row forward only when the player is still contracted to the managed club, then add each created newgen. Set `age_exempt` from the current registration rule's under-21 threshold. Homegrown flags on a newgen are true and provenance is `generated`. If the non-exempt quota would reject the set, keep the age-exempt newgens and drop the forwarding rows that do not fit, rather than failing the season. AI clubs do not receive registration rows.

The user's confirm is the acceptance of this whole intake. There is no per-player academy inbox in this phase.

### 5.5 Settlement order and money

Inside one successful `settle_season` transaction, in this order:

1. Recheck revision, review cursor, played-fixture count, qualifying-offer count, year, roster limits, and fingerprint.
2. Expire open non-compulsory negotiations and offers. Set status `expired`, `resolved_on` to the closing June 30, and both reservation fields to 0.
3. Apply season-end development and write snapshots.
4. Retire, then renew or release, then create the intake that still fits.
5. Read the closing managed-club capacity with `finance::transfer_capacity` before any new prize row exists. `approvedCarryover = floor(max(0, remaining_cents) * carryover_pct / 100)`. A disabled or missing sell-to-buy rule yields carryover 0 and allocation 0.
6. Close the season (`closed`, `closed_at` set) and insert the next active season. Move `campaign.active_season_id` and the clock's active season. Label format stays `{year}/{(year + 1) % 100:02}`.
7. Insert the settlement, the objective rows, the prize and allocation ledger rows, the next fixtures, and the managed registrations.
8. Add prize cash and objective cash to each club's `transfer_balance_cents`. Add allocation and carryover only as ledger rows on the managed club.
9. Set the clock to next July 1, `preseason`, cursor null. Write one receipt and one `season.settle` audit. Increment the campaign revision once.

Ledger rows use the new season id, `effective_on` of that July 1, and the settlement id as `source_action_id`. New columns `earningSeasonId`, `settlementId`, and `awardKind` are set on award rows and null on every other kind.

| Row | Club | Kind | Amount | `awardKind` |
| --- | --- | --- | --- | --- |
| League prize | every club | `prize_income` | that club's `prize_cents` | `league_prize` |
| Each met objective | managed club | `prize_income` | that objective's reward | the objective kind |
| Board allocation | managed club, when amount > 0 | `initial_allocation` | constitution `initial_allocation_cents` | null |
| Carryover | managed club, when amount > 0 | `approved_carryover` | `approvedCarryover` | null |

`earningSeasonId` on a prize or objective row is the closing season. Allocation and carryover leave `earningSeasonId` null. A zero allocation or zero carryover does not insert a row; the settlement record still stores the zero. Prize rows are inserted even when a later rule percentage is zero, because the cash and the ledger are the award. `prizeReinvestmentPct` is applied by the existing capacity function when a later transfer reads the new season. It is not a second cash credit.

Closing capacity used for carryover is computed before these inserts, so the new prizes are outside it. No award is both carryover and prize cash.

The managed club's new-season capacity is then `initial allocation + floor(prize_income * prizeReinvestmentPct / 100) + carryover`. Sales on the new season start at zero.

Operation keys:

| Action | Key |
| --- | --- |
| Midseason development | `season:{seasonId}:development:midseason` |
| Season settlement | `season:{closingSeasonId}:rollover` |

The fingerprint covers campaign id, expected revision, source date, source boundary, development version `"1"`, root seed, played fixture count, and open qualifying-offer count. It excludes action, audit, and receipt ids, row ids, and `now`.

A matching receipt returns the stored outcome and current revision with `replayed: true` and no new write. The same key with a different fingerprint is a conflict. A stale revision writes nothing.

Request IDs are supplied by the client for new player, contract, registration, ledger, fixture, season, settlement, objective, snapshot, receipt, and audit rows. The pure plan returns stable slots. The application assigns the supplied IDs onto those slots before the transaction. The PRNG is not an ID generator. Preview returns the required ID counts. A vector length that does not match the recomputed plan writes nothing.

Per settlement the counts fit in 1 season, 1 settlement, 6 objectives, 1,224 fixtures, 16,000 cumulative snapshots, 8,000 cumulative players, 77-plus ledger rows (72 prizes, up to 3 objectives, allocation, carryover), one receipt, and one audit. Midseason uses snapshot rows, one receipt, and one audit. No midseason command creates a player or a ledger row.

### 5.6 Storage

`src-tauri/migrations/0005_lifecycle.sql` adds three campaign-scoped STRICT tables, adds three nullable ledger columns, and rebuilds `auditEvents` in that same migration. IDs use the existing 1–64 URL-safe check. Money columns are integer cents from 0 through the JavaScript safe integer maximum.

`boardObjectives`: season, club, kind, target position, reward cents, outcome, engine version `"1"`. Kind is `league_title | top_half | avoid_last`. Outcome is `pending | met | missed`. Unique on `(campaignId, id)` and `(campaignId, seasonId, kind)`.

`seasonSettlements`: closing season, next season, engine version `"1"`, `settledOn`, managed position, prize cents, objective bonus cents, carryover cents, allocation cents, and compact table JSON. The JSON is an array of 72 objects: `clubKey`, `leagueTier`, `position`, `points`, `goalDifference`, `goalsFor`, `prizeCents`. Unique on `(campaignId, id)` and `(campaignId, seasonId)`.

`developmentSnapshots`: season, player, period, six before attributes, six after attributes, before value, after value, before status, after status, signed points from -3 through 4, engine version `"1"`. Unique on `(campaignId, id)` and `(campaignId, seasonId, playerId, period)`.

`ALTER TABLE ledgerEntries` adds nullable `earningSeasonId`, `settlementId`, and `awardKind`. Do not rebuild `ledgerEntries`. Award kind, when present, is `league_prize | league_title | top_half | avoid_last`. Prize rows require all three new fields. Other kinds require all three null.

Rebuild `auditEvents` with the existing action list plus `development.apply` and `season.settle`. Copy every existing row. Do not reuse `simulation.matchday`, `simulation.advance`, or `market.tick`.

`SnapshotTables` gains `board_objectives`, `season_settlements`, and `development_snapshots`, each with `#[serde(default)]`. New `LedgerEntryRow` fields also default, so a source schema 4 payload still parses. Limits: objectives up to 256, settlements up to 64, snapshots up to 16,000. Table JSON is bounded to the 72-object shape above. A career that contains one played season, its market rows, and one rollover must remain at or below the existing 32 MiB snapshot ceiling. Do not store per-player blobs on the settlement.

`OutcomeRef` gains `settlement`, `objective`, and `development`. Old receipts stay valid. One receipt still holds at most 32 refs.

`PlayerRow`, `ContractRow`, and `PlayerSimulationStateRow` keep their current columns. Retirement uses the existing `retired` life status.

### 5.7 Command identity

`preview_development` and `apply_development` succeed only when the phase is `league`, the date is the stored round-17 fixture date, and the cursor is that matchday key. Any other clock returns `Development is applied after the halfway matchday.` and writes nothing.

`preview_season` and `settle_season` succeed only in `review`. Otherwise they return `Finish every league fixture before the season can roll over.` A qualifying offer returns `Accept the qualifying offer before the season can roll over.` Update the existing `SeasonRollover` verdict to that sentence. An unsupported next year returns `The next season is outside the supported years.` A roster or snapshot limit returns the sentence in §5.1.12 or §5.4. A refused command writes nothing, including no expiry and no snapshot.

G01 through G03 leave the review copy and the matchday clock unchanged. G04 is the first guide allowed to persist a settlement, and it may be called on a review save that already exists. G04 does not change `sim_matchday`, so a live round 17 still advances until G05. G04's development command is tested from a prepared round-17 cursor. G05 is the first guide that leaves the clock on that cursor after Sim Matchday, and the first that replaces the review sentence with a button.

### 5.8 Reads and UI

`season_review` returns the preview in §5.5 plus the stored settlement when one exists. The generic 50-row screen page is not the review.

The preview's managed-club lists are capped at 80 roster changes and, for development, 40 attribute changes. Each roster row has the player name and one of `renewed`, `released`, `retired`, or `intake`. AI clubs contribute counts only. Attribute rows show the player name, the six before and after ratings, and the value pair.

Command Center shows the game date and exactly one primary action:

| State | Primary action |
| --- | --- |
| Summer tick date, tick not consumed | **Run Market** |
| Next summer date or August 31, no qualifying bid open | **Continue** |
| August 31 or winter close, qualifying bid still open | no advance button; `Accept the qualifying offer before the window can close.` |
| January match date, tick not consumed | **Run Market** |
| First post-January match date, close not consumed | **Close Window** |
| Round 17 just played, development not consumed | **Apply Development** |
| Match date, market, close, and development already consumed | **Sim Matchday** |
| Review, settlement not consumed | **Review Season** |
| Review, qualifying bid still open | no settle button; `Accept the qualifying offer before the season can roll over.` |

Seasons, while the preview is allowed, shows the closing label, managed position, the three objectives as `Met` or `Missed`, the prize, the objective bonus, the carryover, the next allocation, and the four counts. **Start Next Season** confirms. After settlement, the same screen reads the stored settlement and does not offer a second confirm.

Before any development snapshot, Seasons and the squad profile say `Development is applied after the halfway matchday and at season review.` A snapshot list shows the period, the six ratings, and the value change in EUR. Planning notes stay editable and still do not change attributes.

Apply Development, Review Season, and Start Next Season each require an explicit click and ignore a second click while the first request is in flight. Continue, Run Market, Close Window, and Sim Matchday keep their Phase 9 behavior.

## 6. Work breakdown and dependency graph

```text
P10-G01 storage
  → P10-G02 pure growth, decline, and value
    → P10-G03 pure renewal, retirement, and intake
      → P10-G04 atomic midseason apply and season settlement
        → P10-G05 review UI and the round-17 clock stop
          → P10-G06 award, replay, and squad certification
```

| Guide | Goal | Files | Tests | Blocked by |
| --- | --- | --- | --- | --- |
| G01 | Empty lifecycle schema and snapshot compatibility | migration, rows, mapping, store | schema 4 upgrade, schema 3 upgrade, schema 1 refusal, empty import | Phase 9 |
| G02 | Deterministic growth and decline | new core lifecycle module | split budget, decline weights, value, omitted players | G01 types may be absent; pure only |
| G03 | Deterministic roster plan | core roster planner | retire, renew, release, intake floor, wage cap | G02 |
| G04 | Persist one development period and one rollover | app, store, IPC | real SQLite settlement, rollback, replay | G01 and G03 |
| G05 | Show review and stop after round 17 | calendar, app, IPC, native UI | halfway action, confirm, history, qualifying block | G04 |
| G06 | Lifecycle certification | integration tests, README, this progress log | one-time prizes, reopen, viable squads, export | G05 |

G02 and G03 may land before G01's tables are queried. They must not write SQLite. G04 is the first guide allowed to change a player, a contract, or the clock through these commands. G05 is the first guide allowed to change round-17 advancement or the review sentence.

## 7. Acceptance criteria

1. A schema 4 save opens as schema 5 with empty lifecycle tables, a schema 3 save does too, and a schema 1 file is unchanged.
2. A source schema 4 snapshot imports without inventing objectives or growth. A schema 5 export reloads the same settlements and snapshots.
3. The same seed, minutes, and plans produce the same attribute changes. A new transport id does not. Two checkpoints together add at most 4 growth points.
4. A goalkeeper and an outfielder of the same age decline on different attributes. Value follows `market_value_cents` after the change. Stored matches stay byte-for-byte the same.
5. Repeating midseason development or settlement returns the stored result and does not pay, grow, or create players again.
6. One confirmed settlement updates contracts, ownership, registrations, balances, ledger, fixtures, clock, receipt, and audit together, or it updates none of them.
7. Prize and objective ledger rows belong to the new season and name the closing season. Closing capacity used for carryover does not include them. A second rollover cannot insert them again.
8. An unresolved qualifying offer blocks settlement. After that offer is accepted, confirm can proceed. Open non-compulsory rows expire once and release their reservations once.
9. The next July 1 has 1,224 scheduled fixtures, no new results, and **Run Market** as the next action. Season-1 appearances still reconcile.
10. After settlement every club has two contracted goalkeepers, a defender, a midfielder, a forward, and at least 16 contracted players, without passing 8,000 players or its wage budget.
11. Keyboard users can apply development, read a met or missed objective, and confirm the next season.

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

Failure cases that must be explicit tests by G06: stale revision, fingerprint conflict, injected commit failure, concurrent settlement calls, store close/reopen, a second campaign, unsupported schema, a qualifying bid blocking rollover, a released reservation, and a replay that does not pay twice.

G06 does not replay three full 34-round seasons. It settles one played season through the public commands, checks the next July 1, and uses the pure roster planner for two further years of aging. Phase 8 already certified a full match season.

## 9. Risks, mitigations, rollback

| Risk | Mitigation |
| --- | --- |
| A failed settlement expires a bid or grows a player and then rolls the money back | One transaction; fault injection must observe zero new rows and unchanged attributes |
| Retry pays the prize or the allocation twice | Logical receipt and fingerprint; the settlement unique key is the second guard |
| Growth runs as a full budget at both checkpoints | Store points applied; season end uses `min(annual / 2, 4 - already_applied)` |
| ID order changes who develops or who is generated | Seeds and sort keys use simulation keys; tests change only the supplied IDs |
| Schema 4 careers stop opening | Upgrade test from a real schema 4 file; also upgrade a schema 3 file through `0004` then `0005`; do not edit `0004` |
| An unsupported file is migrated | Keep the existing byte-for-byte refusal |
| Carryover includes the prize about to be paid | Compute remaining capacity before inserting new-season prize rows |
| Prize cash is posted on the closing season and again on the next one | Ledger season id is the new season; tests query the closing season for zero new prize rows |
| Intake or retirement leaves a club unable to name a side | Planner floor and a no-write refusal; G06 checks every club |
| Player or snapshot caps are passed by a partial insert | Refuse before the transaction when the planned counts exceed 8,000 or 16,000 |
| Export exceeds 32 MiB | Compact 72-row table JSON and changed-player snapshots only; G06 measures the rolled career |
| Round-17 stop breaks the 34-round certification | G05 updates that test to call Apply Development once; it still expects 1,224 results |
| Settlement rewrites a played match | Tests compare appearance and match rows before and after |
| UI confirms a second season from a stale preview | Recheck revision and fingerprint inside the transaction; the button ignores a second click |

Rollback is a forward schema fix or a restored backup. Do not downgrade user version 5 or delete settlement rows to recover a bug.

## 10. Exit criteria and handoff

- [ ] G01–G06 are committed with recorded checks in the progress log.
- [ ] Schema 5 is the native schema, and schema 4 snapshots still import.
- [ ] A fixed seed settles once, reopens, and replays without a second prize or a second intake.
- [ ] Closing-season ledger rows gain no prize, and the next July 1 is playable.
- [ ] Every club still has a legal contracted core, inside the wage budget and the player cap.
- [ ] README describes Review Season and Apply Development and does not claim scouting charts or dataset import.

### Progress log

Record the commit and the checks in this table only after that guide's commit exists.

| Guide | Commit | Checks |
| --- | --- | --- |
| G01 | `599093f` | Schema 5 lifecycle storage contracts, nullable ledger award columns, scoped references, and regenerated bindings. Schema 3 and 4 upgrades preserve existing campaign, match, and negotiation rows; unsupported versions leave file bytes unchanged. Source schemas 2–4 import with empty lifecycle arrays; schema 5 rows survive export, reopen, and reimport. Frozen migrations `0002`–`0004` and review copy are unchanged. Focused persistence tests and the 72-row settlement JSON boundary test pass. `pnpm native:bindings:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test --maxWorkers=2` (885), `pnpm build`, and `pnpm tauri build` (MSI and NSIS) pass. The initial unrestricted Vitest run had seven timing failures; the complete two-worker retry passed without code changes. Full `pnpm native:check` verification is still running. |

### Handoff to Phase 11

Phase 11 may assume a settled season can exist, development snapshots are immutable, and objective rows are either pending or already judged. It must not recompute growth to draw a chart, invent a rating for a missing attribute, or move prize money. Radar charts, archetypes, and insight sentences remain Phase 11 work. Remapped restore remains Phase 12 work.
