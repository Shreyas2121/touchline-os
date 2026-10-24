# P10-G04 — Settle a season atomically

## 1. Context and authority

- Master 3.0.4 §§4.1, 5.3, 7.6, and 12.2 invariants 5, 8, and 18; parent [Phase 10](../phase10.md) §§5.5–5.7.
- Predecessors: G01 storage, G02 `plan_development`, and G03 `plan_roster`.
- Commit: `feat(p10-g04): settle a season atomically`.

This guide persists one midseason development and one season rollover. It does not change `sim_matchday` and does not replace the review sentence in the UI.

## 2. Goal and user-observable result

A review save can be settled through the service. Afterward the clock is the next July 1, the new season is active, prize rows sit on that season, and the closing season has no new prize row. Repeating the call replays. A prepared round-17 save can apply development once. Command Center still shows `Season rollover arrives in Phase 10.` until G05, because this guide does not change the screen.

## 3. Preconditions

G01–G03 are committed. Inspect the working tree and keep unrelated changes unstaged. Do not edit `0002`, `0003`, or `0004`. Do not advance a live matchday differently. The Phase 8 full-season test must still reach review by calling Sim Matchday 34 times.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/lifecycle.rs` — `plan_development` and `plan_roster`.
- `src-tauri/crates/game-core/src/finance.rs` — `transfer_capacity`.
- `src-tauri/crates/game-core/src/schedule.rs` — `schedule_season` and `standings`.
- `src-tauri/crates/game-core/src/policy.rs` — `PolicyAction::SeasonRollover`.
- `src-tauri/crates/game-core/src/calendar.rs` — review detection and the July 1 cursor.
- `src-tauri/crates/game-app/src/matchday.rs` and `settlement.rs` — recheck, ID slots, and the transfer transaction pattern. Season code does not go in `settlement.rs`.
- `src-tauri/crates/game-store/src/mutations.rs` — one-transaction writes and injected audit failure.
- `src-tauri/src/lib.rs` — thin command wrappers.
- `src/platform/game-client.ts` and `native-client.ts`.

## 5. Files to create/modify

- Add `preview_development`, `apply_development`, `preview_season`, and `settle_season` in `game-app/src/lifecycle.rs`.
- Add the pure award and ID-count helpers next to the G02 planner in `game-core/src/lifecycle.rs`.
- Persist through `game-store` in one transaction per command.
- Add thin Tauri commands and `GameClient` methods. Rebuild bindings.
- Leave `NativeProgression.tsx` on the Phase 9 review sentence.

Preview DTOs use the caps in Phase 10 §5.8: 80 managed roster rows, 40 managed attribute rows, and counts for every club. `idCounts` names each collection the client must fill. Confirm rejects a length mismatch.

## 6. Implementation steps

1. `preview_development` loads the campaign, finds the round-17 fixture date from stored fixtures, and allows the command only for the §5.7 cursor. It sums minutes, reads `already_applied` from an existing midseason snapshot when one exists, and calls `plan_development`. It writes nothing.
2. `apply_development` recomputes that plan inside the worker, then rechecks revision, date, cursor, and fingerprint in the transaction. It updates changed players and goalkeeping, inserts snapshots, writes the `development.apply` audit and the midseason receipt, and increments the revision once. It does not move the date.
3. `preview_season` allows only `review`. It checks every fixture in the active season is `played`, counts open qualifying offers with the stored snapshot and the current constitution, and calls `evaluate_action` with `SeasonRollover`. It builds prizes from `standings`, objectives from §5.2, carryover from closing-season `transfer_capacity` before any new prize, and the roster plan from post-growth attributes. It writes nothing.
4. `settle_season` follows the order in §5.5. Expire non-compulsory open negotiations and offers before inserting players. Do not settle a transfer. A qualifying offer, an incomplete fixture list, a bad year, a roster-floor error, or a cap overflow writes nothing, including no expiry.
5. Insert the next season, 1,224 fixtures from `schedule_season(next_start_year, ...)`, the settlement, objectives, ledger rows, and managed registrations as §5.4 and §5.5 specify. Fixture keys already include the start year. Do not copy matches, appearances, or lineups.
6. Add prize and objective cents to `transfer_balance_cents` once. Do not add allocation or carryover to that balance. Put those on the managed club's new-season ledger only when the amount is greater than zero.
7. Set the clock to next July 1, `preseason`, and a null cursor. Keep `simulationVersion` and `calendarVersion` at `"1"`.
8. A matching receipt returns `replayed: true` and the current revision. A fingerprint mismatch or a stale revision writes nothing. An injected audit failure rolls back players, ledger rows, fixtures, and the clock together.
9. Update the `SeasonRollover` verdict sentence to `Accept the qualifying offer before the season can roll over.` Window-close copy stays on its own sentence.
10. Do not call these commands from React yet.

## 7. Tests to add/change

- `development_applies_once_from_a_round_17_cursor`: a prepared save on the round-17 matchday key changes a known player, reopens with the same attributes, and replays without a second snapshot.
- `settlement_pays_the_new_season_once`: from review, one settle creates the next July 1, one settlement, 1,224 scheduled fixtures, and prize rows only on the new season. The closing season's prize count is unchanged. Replay does not move the balance.
- `qualifying_offer_blocks_settlement`: an open reserved qualifying offer leaves every table unchanged, including negotiations. A non-compulsory open offer in a second save expires once and its reservation returns once.
- `audit_failure_rolls_back_the_season`: injected failure leaves the review clock, attributes, and balances unchanged.
- `stale_revision_and_id_mismatch_write_nothing`.
- `historical_matches_stay_byte_for_byte`: compare match and appearance rows from before the call.

Build the review and round-17 saves through the public services or a schema 5 import. Do not add a test-only SQL insert command. The 34-call season test stays green without a development call.

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

Run the new lifecycle service tests before the full set. Unit and integration tests plus these checks are sufficient (DEC-005). No desktop session is required.

## 9. Acceptance coverage

| Item | Evidence |
| --- | --- |
| 4 — Immutable matches | Historical row comparison. |
| 5 — Replay | Development replay and settlement replay. |
| 6 — Atomic settlement | Audit-failure rollback. |
| 7 — Award season and carryover base | New-season prize query and the pre-insert capacity use. |
| 8 — Qualifying block and expiry | The offer tests. |
| 9 — Next calendar | 1,224 scheduled fixtures and the July 1 preseason cursor. |
| 1–3, 10, 11 | G01, G02, and G05. The UI sentence is still the Phase 9 string. |

## 10. Definition of done

- [ ] Both commands commit once or not at all.
- [ ] Prize cash and prize ledger rows belong to the new season.
- [ ] `sim_matchday` still advances through round 17 without a development stop.
- [ ] The review sentence in the UI is unchanged.
- [ ] Bindings and `GameClient` expose the four operations.
- [ ] The Phase 10 progress log records this commit.

## 11. Commit instructions

```text
feat(p10-g04): settle a season atomically
```

Stage the lifecycle service, store writes, generated bindings, service tests, and the Phase 10 progress row. Do not stage unrelated dirty files.

## 12. Handoff

G05 may call `preview_season`, `settle_season`, `preview_development`, and `apply_development`. It owns the round-17 clock stop and the Seasons screen. It must not open a second way to post the allocation.
