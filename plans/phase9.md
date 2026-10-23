# Phase 9 — Autonomous market and club/player negotiation

> **Authority:** `MASTER_PLAN.md` 3.0.4 / DEC-003 / DEC-004 / DEC-005 / DEC-006
> **Phase IDs:** `P09-G01` … `P09-G06`
> **Status:** In progress. G01 through G05 are implemented. Phase 8 matchdays stay closed.
> **Predecessor:** Phase 8 full-season certification, `test(p08-g06): verify a full simulated season` at `e673d15ffc486d51790c1beaa26de3dec8d745c7`. This file does not authorize lifecycle, analytics, dataset import, or release work.

## 1. Parent plan contract

Authority is `MASTER_PLAN.md` `3.0.4`. On conflict, the master plan wins. This phase plan wins over any `plans/phase9/guide<number>.md`.

Relevant master sections:

- **§1.5** — Offline sporting-director play. No live auction, cups, or promotion.
- **§2** — Pure `game-core`, application services in `game-app`, SQLite in `game-store`, thin Tauri commands, `GameClient`. CPU work stays outside the short write transaction.
- **§3.1 and §3.3** — Transfers shows shortlist context, negotiations, incoming offers, and completed deals. The command center names the next action: Continue, Resolve offer, Run Market, Close Window, Sim Matchday, or review.
- **§4.1 invariants 3, 7, 8, 9, and 12** — Integer cents. Confirmation authorizes one bounded action and its autonomous consequences. Receipts and audits persist. Seeds exclude remappable IDs and audit time. A settlement commits together or not at all.
- **§4.2** — `Offer` is an AI incoming bid. `Transfer` is a completed move. Exactly one active contract per owned active player.
- **§4.3** — `Negotiation` begins here: club fee, player terms, deterministic response, reserved funds, expiry, and bounded counters.
- **§4.6** — Independent market-engine version. A retry returns the stored outcome and does not reroll. `EventKind::Market` already exists.
- **§5.2–§5.4** — Sell-to-buy, age, wage tier, and prestige rules govern the managed club. Reservations reduce availability once and are released or consumed once. A compulsory offer stays actionable until resolved and must be affordable at creation.
- **§7.1** — Summer window July 1–August 31. Winter window January 1–31. Same-day order: user decisions and deadline guards, then window transitions, then kickoff or results.
- **§7.4** — AI bids and AI-to-AI deals during windows. Incoming purchases need board approval, selling-club agreement, and player agreement. One settlement updates both clubs. Manual transfer commands are not a substitute.
- **§12.2 invariants 4, 5, 17, and 20** — Stale work cannot spend the same funds twice. Ownership, contracts, money, receipt, and audit commit together. AI offers stay affordable. Compulsory sales stay completable. Challenge protections stay in Rust.

Roadmap entries, in order:

| ID | Deliverable | Commit subject |
| --- | --- | --- |
| `P09-G01` | Negotiation and offer snapshots, deadlines, reservations, and the SQLite migration | `feat(p09-g01): add negotiation storage contracts` |
| `P09-G02` | AI squad needs, bounded market ticks, and valuation formulas | `feat(p09-g02): plan bounded transfer bids` |
| `P09-G03` | Selling-club fee and player wage, role, and term agreement | `feat(p09-g03): resolve club and player terms` |
| `P09-G04` | Atomic settlement for both clubs, with contracts, finance, and selection cleanup | `feat(p09-g04): settle agreed transfers atomically` |
| `P09-G05` | Incoming inbox, deadline progression, and actionable compulsory sales | `feat(p09-g05): run windows and incoming offers` |
| `P09-G06` | Budget conservation, reservation release, duplicate and stale responses, and deadlock tests | `test(p09-g06): verify transfer budgets and deadlines` |

One guide is one commit. Split a guide only by editing this phase file first.

## 2. Phase objective and user-visible outcome

At the end of Phase 9, a standalone career can:

1. On July 1, run **Run Market** instead of jumping straight to August 31. Each summer tick is one confirmed command. Continue then moves to the next market date.
2. See AI-to-AI moves already completed after a tick, with both clubs' money, contracts, and the player's club changed once.
3. Open Transfers and read incoming bids: fee, wage, tier, term, deadline, and the word `Compulsory` when the stored snapshot qualifies. **Accept** settles. **Reject** is refused while the bid still qualifies.
4. Approach a player the managed club does not own, while the window is open, and receive a deterministic seller and player response. Repeating the same proposal does not open a second negotiation or draw again.
5. Leave August 31 for September 1 only when no stored qualifying bid is still open. The blocker says `Accept the qualifying offer before the window can close.`
6. On a January match date, run the market before **Sim Matchday**. On the first league date after January 31, close the winter window before the match. Stored results are not rewritten.
7. Reload, retry, or reopen and find the same bids, balances, and transfers. Review still says `Season rollover arrives in Phase 10.`

A loading message may say `Calculating the transfer market.` It must not present a live auction.

## 3. Prerequisites

Phase 8 exit behavior is the input. Required native commit:

| Guide | Commit | Subject |
| --- | --- | --- |
| `P08-G06` | `e673d15ffc486d51790c1beaa26de3dec8d745c7` | `test(p08-g06): verify a full simulated season` |

Inspect before `P09-G01`:

- `MASTER_PLAN.md` §§4.3, 5.2, 5.3, 5.4, 7.1, and 7.4
- `plans/phase8.md` handoff and `src-tauri/crates/game-core/src/calendar.rs`
- `src-tauri/crates/game-core/src/rows.rs`, `policy.rs`, `finance.rs`, `validate.rs`, `random.rs`, `ability.rs`, `generation_settings.rs`
- `src-tauri/migrations/0002_standalone.sql` and `0003_matchday.sql` — frozen. Do not edit them.
- `src-tauri/crates/game-store/src/lib.rs`, `mapping.rs`, `snapshots.rs`, `mutations.rs`
- `src-tauri/crates/game-app/src/progression.rs`, `matchday.rs`, and `src-tauri/src/lib.rs`
- `src/platform/game-client.ts`, `src/platform/native-client.ts`
- `src/app/native/NativeProgression.tsx`, `NativeWorkspace.tsx`, `NativeScreenTables.tsx`
- `src/app/routes.ts` — the Transfers section already exists

`0002_standalone.sql` and `0003_matchday.sql` stay byte-for-byte unchanged. Schema 1 and other unsupported files stay rejected without a write. Desktop/browser E2E, manual acceptance, and user sign-off are not gates (DEC-005).

## 4. In scope / out of scope

### In scope

- Schema 4 negotiations, extended offers, reservation fields, and snapshot compatibility with source schemas 2 and 3.
- Pure squad needs, valuation, a bounded tick, and deterministic fee and wage responses.
- User approaches, counters, withdraw, and settlement confirmation.
- AI-to-AI settlement inside the market tick.
- Incoming inbox, accept, and reject, including compulsory qualification from the stored snapshot.
- Summer weekly market dates, August 31 close, January matchday ticks, and the first post-January close.
- Ledger entries, transfer-balance updates, contract replacement, lineup and registration cleanup, receipts, and audits.
- Rust/SQLite tests for conservation, retries, stale revisions, and the window-close block.

### Out of scope

| Item | Phase |
| --- | --- |
| Growth, contract expiry, retirement, academy, awards, prize money, and rollover | Phase 10 |
| Radar charts, archetypes, and insight sentences | Phase 11 |
| Remapped restore and CSV/JSON dataset import | Phase 12 |
| Installer signing, updater certification, and performance budgets | Phase 13 |
| Loans, clauses, installments, multi-club auctions, and staff negotiation | Deferred |

Also out of this phase: editing `0002` or `0003`, a second market engine in TypeScript, manual "record a transfer" commands, changing attributes or stored match rows, weekly payroll leaving the transfer balance, and skipping an unplayed round.

## 5. Architecture impact

```text
game-core     negotiation rows, valuation, needs, agreement, settlement plan
game-store    0004 migration, mappings, snapshot columns, atomic market writes
game-app      preview/commit orchestration and transfer-board read model
src-tauri/src thin market, proposal, response, settlement, and board commands
src/platform  generated DTOs and GameClient methods
src/app/native  Run Market, Transfers inbox, approach, and window-close copy
```

```text
preview_market
  → load authoritative snapshot
  → pure tick outside the transaction
  → return proposals or a blocker; write nothing

run_market
  → recheck revision, source date, cursor, and logical receipt
  → expire due non-compulsory rows, insert the tick's negotiations and AI settlements
  → write receipt and audit, then increment the campaign revision once

settle_transfer / respond_offer
  → recheck the same way
  → one player, both clubs, contracts, ledger, reservations, lineups, registrations
```

React never supplies a fee outcome, a qualification flag, or a balance delta. Generated TypeScript types are not validation. `game-core` still imports neither SQLite nor Tauri.

### 5.1 Planning assumptions

These are the smallest readings that keep the master invariants implementable. A later phase may replace a heuristic only behind a new engine version.

1. **Engine version.** `MARKET_ENGINE_VERSION` is `"1"`. Store it on each negotiation. Match engine `"1"`, `simulationVersion`, and `calendarVersion` stay `"1"`. Market streams use `derive_event_seed` with stream version `"1"` and `EventKind::Market`.
2. **Schema.** Fresh databases run frozen `0002`, frozen `0003`, then `0004_market.sql`. An existing schema 3 file receives only `0004`. User version becomes 4. Source schema 2 and 3 snapshots remain importable. Missing `negotiations` means an empty array. New offer fields default to empty. New exports use source schema 4. Import never generates bids.
3. **Windows.** Summer is July 1 through August 31. Winter is January 1 through January 31, using `transfer_window_on`. The league calendar from Phase 8 is unchanged. Winter does not insert extra dates between matchdays.
4. **Summer ticks.** Nine dates: July 1, 8, 15, 22, and 29, then August 5, 12, 19, and 26. Build them with `add_days` from July 1. August 31 is the existing summer deadline and has no new AI tick. The first action on July 1 is **Run Market**, not Continue to August 31. After a consumed tick, Continue moves to the next date in that list, and from August 26 to August 31.
5. **Winter ticks.** On each stored fixture date that falls inside January, **Run Market** is required before **Sim Matchday**. The winter close is the first stored fixture date after January 31, before that match. For a September 1 season those January dates are rounds 19–22 (January 5, 12, 19, and 26) and the close date is round 23 (February 2). Derive them from fixtures. Do not hardcode the civil dates in the engine.
6. **Same-day order.** Expire due non-compulsory rows, then the market tick or window close, then the match. An open non-compulsory bid does not block Continue or Sim Matchday. An open bid whose stored snapshot still qualifies blocks August 31 → September 1 and blocks the winter close. It does not block a January match after that date's tick.
7. **Who bids.** AI clubs bid. The managed club bids only through an explicit approach. AI-to-AI negotiations are proposed, answered, and settled inside the same tick. Managed-club selling creates an incoming offer and does not settle until Accept. Managed-club buying persists the negotiation until Settle, Withdraw, or window close.
8. **Compulsory.** At most one open compulsory bid per player. Creation reserves the buyer's fee and weekly wage, so Accept can complete on that snapshot. The bid cannot expire or be withdrawn. Reject stays blocked while `offer_qualifies` is true for the stored fee, stored value, stored prestige pair, and the current constitution. A sandbox constitution save may make it stop qualifying. Challenge has no hidden command that clears it.
9. **Deadlines.** Non-compulsory negotiations and offers expire on `deadlineOn`, which is the earlier of the open date plus 14 days and the window end (August 31 or January 31). `agreed` user purchases stay open until Settle or the window close. Expiry is written only inside a successful tick, close, or advance. A refused command writes nothing, including no expiry.
10. **Money.** Reservation is the sum of `reservedCents` on that club's open negotiations. It is not a second stored balance and it is not a ledger row. Spendable balance is `transfer_balance_cents` minus other clubs' open reservations. Settlement debits the buyer and credits the seller once, appends `incoming_fee` and `player_sale`, and sets the reservation to zero. Release on reject, expire, withdraw, or supersede also happens once. Sum of all club transfer balances is unchanged by a fee moving between clubs.
11. **Identity.** Completed transfers use one `Transfer` row. Fee above zero uses kind `sale` with both clubs. Fee zero uses kind `free`. Do not also write a purchase row. The old contract becomes `ended`. The new contract is the only active contract. Attributes, market value, fitness, sharpness, injury, suspension, and simulated appearances stay as they were. Appearance `clubId` remains historical.
12. **Selection cleanup.** When a player leaves the managed club, remove that player from lineup starters and bench. Leave the lineup row in place. Set that player's managed `league` registration to `ineligible`. When the managed club buys, insert one `registered` row only when the current registration policy allows it. A quota block rolls the whole settlement back.
13. **Clock legality.** Extend `foundation_clock` only in G05. New legal states are a consumed summer market key on that tick's date, a consumed January market key before the match, and a consumed winter-close key on the close date before the match. G01–G04 leave July 1 → August 31 → September 1 as Phase 8 left it.
14. **Results.** No market command updates fixtures, matches, appearances, or standings. Review copy stays the Phase 10 sentence.

### 5.2 Needs, valuation, and agreement

All arithmetic is checked integer arithmetic on nonnegative cents and ratings. Division truncates toward zero. A missing market value, age, or attribute excludes the player. Unknown is not zero.

Age is the completed year from `birthDate` to the game date. If `birthDate` is absent, use `reportedAge`. Age outside 16–38 excludes the player. AI clubs also skip ages above 34.

`role_ability` is the ability input. `generation_settings::tier_for` and `wage` are the wage inputs. Do not copy a second wage formula. Term for every v1 contract opened here is the active season's June 30 end date.

Season minutes are the sum of that player's simulated appearance minutes. Form is 100 when there is no appearance. Otherwise form is the integer average of stored ratings, clamped to 1–99.

```text
demand = clamp(100 + (form - 70) / 2 + min(minutes, 900) / 90, 80, 130)
valuation = market_value_cents * demand / 100
```

Before any match, demand is 100 and valuation equals the stored market value. Do not write the result back onto the player.

Squad targets are the 4-3-3 starter counts: goalkeeper 1, defender 4, midfielder 3, forward 3. Shortage is `max(0, target - active contracted count)` for that position group. Need priority is higher shortage, then lower average `role_ability` in the group, then group order goalkeeper, defender, midfielder, forward.

Tick selection:

- Clubs are ordered by `simulationKey` ascending, Unicode scalar order.
- A club with no shortage, or with 3 open buy-side negotiations, is skipped.
- One new negotiation per club per tick. At most 12 new negotiations per tick.
- Candidates for the chosen group are other clubs' active players and free agents, ordered by valuation ascending, then player `simulationKey`.
- Skip a player already in an open negotiation with this buyer, or already the subject of an open compulsory bid.
- The tick stream is `EventKind::Market` keyed by `season:{seasonId}:market:{YYYY-MM-DD}`. A club that reaches candidate selection draws once: `noise = next_int(11) - 5`, so noise is -5 through 5. Skipped clubs do not draw.

```text
prestige_delta = clamp(buyer_prestige - seller_prestige, -10, 20)
fee = valuation * (100 + prestige_delta + noise) / 100
```

Free agents use fee 0 and do not use prestige delta. If `fee` is above the buyer's spendable balance, lower it to spendable when spendable is at least `valuation * 80 / 100`. Otherwise skip that candidate and try the next one. Do not draw again.

Opening wage is `wage(age, ability, tier_for(age, ability))`. The buyer's active wages, plus open reserved wages, plus this wage, must fit `wage_budget_weekly_cents`. A managed buyer also has to pass the constitution wage-tier cap at settlement. AI buyers are not gated by the managed club's tier caps.

When the seller is the managed club, the buyer has higher prestige, and `PRESTIGE_BID_SALE` is enabled, raise the fee to the qualifying fee when the buyer can reserve it:

```text
qualifying_fee = (valuation * numerator + denominator - 1) / denominator
fee = max(fee, qualifying_fee)
```

If the raised fee does not fit, keep the unraised fee and do not mark it compulsory. A second compulsory bid for the same player is not created.

AI seller response, with no extra draw:

```text
minimum = valuation * 90 / 100
accept when fee >= minimum
counter once to minimum when fee >= minimum * 80 / 100
otherwise reject
```

The AI buyer accepts that single counter when the new fee still fits spendable balance. Otherwise the negotiation rejects. AI-to-AI uses at most one counter.

Player response, with no extra draw. Tier rank is key 3, rotation 2, youth 1. A missing current tier is not a demotion. `current` is the active weekly wage, or the opening wage for a free agent.

```text
accept when the tier is not a demotion and offered wage >= current
counter once to current wage, same tier and term, when offered wage >= current * 90 / 100
accept a demotion when offered wage >= current * 120 / 100
otherwise reject
```

Apply a seller counter before a player counter. Either rejection ends the negotiation and leaves no reservation.

Managed seller: do not auto-accept the fee. Run the player response. If the player would reject, create nothing. If the player would counter, use the countered wage and tier, when the buyer can still afford them, and then create the incoming offer. The offer's terms are already agreed. Compulsory is true only when the stored snapshot qualifies and the reservation covers that fee and wage.

These formulas are gameplay heuristics. Tests pin the arithmetic, the draw order, and the reservation identity. They do not pin a real-world transfer distribution.

### 5.3 Storage

`src-tauri/migrations/0004_market.sql` adds one campaign-scoped STRICT table and rebuilds `offers` and `auditEvents` in that same migration. IDs use the existing 1–64 URL-safe check. Money columns are integer cents from 0 through the JavaScript safe integer maximum.

`negotiations`: season, player, buyer club, nullable seller club, status, fee, reserved fee, wage, reserved wage, squad tier, contract end date, counter count 0–2, opened date, deadline, nullable resolved date, engine version `"1"`, event seed, and qualification JSON. Status is `proposed | countered | agreed | settled | rejected | expired | withdrawn | superseded`. Unique on `(campaignId, id)` and on the open identity `(campaignId, buyerClubId, playerId)` where status is `proposed`, `countered`, or `agreed`.

Qualification JSON holds fee cents, valuation cents, buyer prestige, seller prestige, constitution version, and compulsory 0/1. It is an object, not a nested player blob.

Rebuild `offers` so existing rows are copied. New columns: nullable `negotiationId`, nullable `sellerClubId`, nullable `deadlineOn`, nullable `origin` (`ai` for new rows), nullable snapshot cents and prestige, nullable constitution version, and `compulsory` integer 0/1 default 0. Status check becomes `open | accepted | rejected | expired | withdrawn | superseded`. Old rows keep their old status and null snapshot. They are not compulsory and cannot be accepted by the new command.

Rebuild `auditEvents` with the existing action list plus `market.tick`, `market.close`, `transfer.propose`, `transfer.settle`, and `offer.respond`. Copy every existing row. Do not reuse `simulation.matchday` or `simulation.advance` for a transfer.

`SnapshotTables` gains `negotiations` with `#[serde(default)]`. New `OfferRow` fields also default, so a source schema 3 payload still parses. Limits: negotiations up to 4,000; offers stay at 8,000. Qualification JSON is bounded to the fields above. A career that contains Phase 8's full season plus these rows must remain at or below the existing 32 MiB snapshot ceiling. Do not store per-tick candidate lists.

`OutcomeRef` gains `negotiation`, `offer`, and `transfer`. Old receipts stay valid. One receipt still holds at most 32 refs.

`ClubSimulationState.transfer_balance_cents` remains the cash balance. Do not add a reserved-balance column.

### 5.4 Command identity

Operation keys:

| Action | Key |
| --- | --- |
| Market tick | `season:{seasonId}:market:{YYYY-MM-DD}` |
| Summer close inside August 31 → September 1 | existing `season:{year}:summer-deadline` advance |
| Winter close | `season:{seasonId}:window-close:winter` |
| User approach or counter | `season:{seasonId}:proposal:{buyerKey}:player:{playerKey}:fee:{cents}:wage:{cents}:tier:{tier}:opened:{date}` |
| Settlement or offer response | `season:{seasonId}:transfer:{buyerKey}:player:{playerKey}:opened:{date}` |

Keys use simulation keys and the game date. They do not use row IDs.

The fingerprint covers campaign id, expected revision, source date, source boundary, market version `"1"`, root seed, and the ordered proposal identities. It excludes action, audit, and receipt ids, row ids, and `now`.

A matching receipt returns the stored outcome and current revision with `replayed: true` and no new write. The same key with a different fingerprint is a conflict. A stale revision writes nothing.

Request IDs are supplied by the client for new negotiation, offer, transfer, contract, ledger, registration, receipt, and audit rows. The pure tick returns stable slots in club-key order. The application assigns the supplied IDs onto those slots before the transaction. The PRNG is not an ID generator. Preview returns the required ID counts. A vector length that does not match the recomputed plan writes nothing.

Per tick the counts fit in 12 negotiations, 12 offers, 12 transfers, 12 new contracts, 24 ledger rows, 1 receipt, and 1 audit. User settlement uses one transfer, one contract, up to two ledger rows, one optional registration, one receipt, and one audit.

### 5.5 Reads and UI

`transfer_board` returns three lists for the managed club: open incoming offers, the managed club's open buy negotiations, and completed transfers for the active season. The generic 50-row screen page is not the inbox.

Each incoming row shows player name, bidder, fee, weekly wage, tier, term, deadline, and `Compulsory` or `Ordinary` as a word. Accept and Reject are buttons. Reject of a still-qualifying bid shows `This bid qualifies and cannot be rejected while the rule is on.`

Command Center shows the game date and exactly one primary action:

| State | Primary action |
| --- | --- |
| Summer tick date, tick not consumed | **Run Market** |
| Next summer date or August 31, no qualifying bid open | **Continue** |
| August 31 or winter close, qualifying bid still open | no advance button; `Accept the qualifying offer before the window can close.` |
| January match date, tick not consumed | **Run Market**, with `Run the transfer market before this matchday.` |
| First post-January match date, close not consumed | **Close Window**, with `Close the winter window before this matchday.` |
| Match date, market and close already consumed | **Sim Matchday** |
| Review | `Season rollover arrives in Phase 10.` |

Outside an open window, approach is unavailable and the reason is `The transfer window is closed.` August 31 accepts responses and does not accept new AI bids or new approaches.

Continue remains the control that moves the date. Run Market, Close Window, Accept, Reject, Withdraw, and Settle each require an explicit click and ignore a second click while the first request is in flight.

## 6. Work breakdown and dependency graph

```text
P09-G01 storage
  → P09-G02 pure needs, valuation, and tick proposals
    → P09-G03 pure seller and player responses
      → P09-G04 atomic settlement
        → P09-G05 windows, inbox, and commands
          → P09-G06 conservation and deadlock certification
```

| Guide | Goal | Files | Tests | Blocked by |
| --- | --- | --- | --- | --- |
| G01 | Empty negotiation schema and snapshot compatibility | migration, rows, mapping, store | schema 3 upgrade, schema 1 refusal, empty import | Phase 8 |
| G02 | Deterministic needs, fees, and tick slots | new core market module | shortage order, pinned noise, affordability, caps | G01 types may be absent; pure only |
| G03 | Seller and player agreement | core agreement module | accept, one counter, reject, managed seller | G02 |
| G04 | Persist one agreed move | app, store, IPC | real SQLite settlement, rollback, retry | G01 and G03 |
| G05 | Run windows and show the inbox | calendar, app, IPC, native UI | summer dates, compulsory block, January order | G01–G04 |
| G06 | Market certification | integration tests, README, this progress log | conservation, release, stale response, close | G05 |

G02 and G03 may land before G01's table is queried. They must not write SQLite. G04 is the first guide allowed to settle a row. G05 is the first guide allowed to change the July 1 continue target.

## 7. Acceptance criteria

1. A schema 3 save opens as schema 4 with an empty negotiation table, and a schema 1 file is unchanged.
2. A source schema 3 snapshot imports without inventing bids. A schema 4 export reloads the same negotiations and offer snapshots.
3. The same seed, squads, and appearances produce the same proposals. A new transport id does not.
4. A tick creates at most 12 negotiations, at most one new buy per club, and at most three open buys per club. A club that cannot reserve the fee and wage creates no binding bid.
5. Repeating an identical approach or tick returns the stored response and does not move money again.
6. One confirmed settlement updates both clubs' balances, one ledger pair, both contracts, ownership, reservations, lineups, and registrations, or it updates none of them.
7. A qualifying stored bid cannot be rejected, expired, or withdrawn. Accept completes it. A second compulsory bid for that player is not created.
8. August 31 does not reach September 1 while such a bid is open. After Accept, Continue can. Non-compulsory bids can expire and then do not block.
9. January runs the market before the match. The winter close runs before the first later match. Stored scores stay byte-for-byte the same.
10. The sum of transfer balances is conserved across a fee settlement. Releasing a reservation restores spendable money once.
11. Keyboard users can run the market, read a compulsory bid, accept or reject, and read the window-close blocker.

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

Failure cases that must be explicit tests by G06: stale revision, fingerprint conflict, injected commit failure, concurrent same-tick calls, store close/reopen, a second campaign, unsupported schema, a qualifying bid blocking close, and a released reservation.

G06 does not need another 34-round match certification. Phase 8 already recorded that. The market certification plays the summer window through public commands and continues through the first January tick and the winter close.

## 9. Risks, mitigations, rollback

| Risk | Mitigation |
| --- | --- |
| A failed tick leaves a bid without a reservation, or a reservation without a bid | One transaction; fault injection must observe zero new rows |
| Retry redraws noise or doubles a fee | Logical receipt and fingerprint; PRNG output is not stored separately from the negotiation |
| ID order changes who is bid for | Seeds and sort keys use simulation keys; tests change only the supplied IDs |
| Schema 3 careers stop opening | Upgrade test from a real schema 3 file; do not edit `0003` |
| An unsupported file is migrated | Keep the existing byte-for-byte refusal |
| A compulsory bid cannot be accepted | Reserve fee and wage at creation; skip the bid when they do not fit |
| Live valuation clears a compulsory bid | Close and reject read the stored snapshot and the current rule only |
| Two commands spend the same balance | Recheck reservations and revision inside the transaction |
| Export exceeds 32 MiB | Compact negotiation rows, no candidate dumps; G06 measures the played window |
| UI looks like a live auction | Copy says the tick is calculated, then the inbox is static |
| Settlement rewrites a played match | Tests compare appearance and match rows before and after |

Rollback is a forward schema fix or a restored backup. Do not downgrade user version 4 or delete negotiation rows to recover a bug.

## 10. Exit criteria and handoff

- [ ] G01–G06 are committed with recorded checks in the progress log.
- [ ] Schema 4 is the native schema, and schema 3 snapshots still import.
- [ ] A fixed seed completes the summer ticks, reopens, and replays without a second set of bids.
- [ ] A qualifying bid blocks window close until one Accept, and the balances stay conserved.
- [ ] Review still refuses rollover with the Phase 10 sentence.
- [ ] README describes Run Market and the inbox and does not claim a second season.

### Progress log

| Guide | Commit | Checks |
| --- | --- | --- |
| G01 | `e9ab101` | Schema 4 negotiation and offer-snapshot storage. Frozen `0002_standalone.sql` and `0003_matchday.sql`. A schema 3 file opens as user version 4 with an empty `negotiations` table; schema 1 and other unsupported user versions are refused without a write. Source schemas 2–4 import, exports write schema 4, and import does not invent bids. July 1 still continues to August 31. `pnpm native:bindings:check`, `pnpm native:check` (fmt, Clippy `-D warnings`, 107 workspace tests), `pnpm lint`, `pnpm typecheck`, `pnpm test` (704), `pnpm build`, and `pnpm tauri build` (MSI and NSIS) pass. |
| G02 | `0410ff1` | Pure opening bids: at most 12 per tick, one per club, stable for a fixed seed. Shortage order, pinned market noise, the spendable 80 percent rule, wage room, and the qualifying-fee ceiling are covered. No SQLite, IPC, clock, or UI change. `pnpm native:check` (fmt, Clippy `-D warnings`, 116 workspace tests), `pnpm lint`, `pnpm typecheck`, `pnpm test` (704), and `pnpm build` pass. |
| G03 | `63a945a` | Pure term agreement: seller and player bands, at most two counters, and an AI buyer finishes inside the call. A managed seller does not accept the fee. No SQLite, IPC, clock, or UI change. `pnpm native:check` (fmt, Clippy `-D warnings`, 121 workspace tests), `pnpm lint`, `pnpm typecheck`, `pnpm test` (704), and `pnpm build` pass. |
| G04 | `6e888c6` | One agreed negotiation settles in a single transaction: balances, one ledger pair, both contracts, ownership, lineup, and registration. A replay does not pay again. A quota block, stale revision, fingerprint mismatch, and injected audit failure leave every table unchanged. July 1 still continues to August 31. `pnpm native:bindings:check`, `pnpm native:check` (fmt, Clippy `-D warnings`, 122 workspace tests), `pnpm lint`, `pnpm typecheck`, `pnpm test` (704), `pnpm build`, and `pnpm tauri build` (MSI and NSIS) pass. |
| G05 | | July 1 runs the market, then Continue targets July 8. After the August 26 tick, Continue targets August 31. A qualifying offer refuses Reject and blocks the August 31 advance until Accept. January refuses Sim Matchday until Run Market, and the next fixture refuses it until Close Window. The Transfers board lists incoming, outgoing, and completed rows with Accept, Reject, Withdraw, and Settle. `pnpm native:bindings:check`, `pnpm native:check` (fmt, Clippy `-D warnings`, 126 workspace tests), `pnpm lint`, `pnpm typecheck`, `pnpm test` (708), `pnpm build`, and `pnpm tauri build` (MSI and NSIS) pass. |
| G06 | | Not started. |

### Handoff to Phase 10

Phase 10 may assume negotiations and offers exist, reservations are either released or consumed, and a season can be reviewed with no open compulsory bid. It must not reinterpret stored results or stored qualification snapshots. Contract expiry, renewal, retirement, growth, awards, and the next season's calendar remain Phase 10 work. Open non-compulsory bids left at review are that phase's problem to close during settlement; this phase does not invent that close.
