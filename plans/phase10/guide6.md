# P10-G06 — Verify multi-season squads and awards

## 1. Context and authority

- Master 3.0.4 / DEC-005 §§5.3, 6.3, 12.1, and 12.2 invariants 8, 18, and 21; parent [Phase 10](../phase10.md) §§7–10.
- Predecessor: `feat(p10-g05): review and confirm the next season`.
- Commit: `test(p10-g06): verify multi-season squads and awards`.

This guide certifies lifecycle settlement. It does not add a formula, a chart, or a third season of stored matches.

## 2. Goal and user-observable result

A fixed-seed career can play a season, apply the halfway development, reopen, and start the next season once. Prize cash and the board allocation appear once on the new season. Repeating the confirm does not pay again. Every club can still name a side. The product does not claim scouting charts or dataset import.

## 3. Preconditions

G05 is committed and one real SQLite settlement already passes. Use certification to close gaps in coverage, not to redesign §§5.2–5.5. If a test exposes a broken invariant, fix the implementation without weakening the assertion or the stored development version. Do not simulate three full 34-round seasons.

## 4. Files to inspect

- `src-tauri/crates/game-app/tests/full_season.rs` — career creation, the G05 development stop, reopen, and the export ceiling.
- `src-tauri/crates/game-app/src/lifecycle.rs` — `apply_development` and `settle_season`.
- `src-tauri/crates/game-core/src/lifecycle.rs` — `plan_development` and `plan_roster`.
- `src-tauri/crates/game-store/tests/persistence.rs` — backup, reopen, and schema refusal.
- `src-tauri/crates/game-core/src/snapshot.rs` — `MAX_UTF8_BYTES`.
- README desktop and local-database sections.
- Phase 10 acceptance list and progress log.

## 5. Files to create/modify

- A Rust application integration test that plays one season and settles it on a temporary database.
- A pure test that runs `plan_roster` across two further aged years on the post-settlement squad.
- Extra cases only where G05 left a gap: concurrent settles, campaign isolation, and export size.
- README and the Phase 10 progress log.

Do not add a new command unless a certification fix requires it. Do not duplicate every pure unit test.

## 6. Implementation steps

1. Create a fixed-seed standalone career through the public service. Play all 34 rounds through `sim_matchday`, calling `apply_development` when round 17 has just been stored. Reopen after that development command and after review.
2. Settle once through `settle_season`. Assert one settlement, six objectives for the two seasons, 1,224 new scheduled fixtures, and no matches on the new season. Assert the sum of new-season `prize_income` equals the 72 league prizes plus the managed club's met objectives. Assert the closing season gained no `prize_income`, `initial_allocation`, or `approved_carryover` row from this command.
3. Assert carryover equals `floor(max(0, closing remaining capacity) * carryover_pct / 100)` computed from the closing ledger before those new rows. Assert allocation equals the constitution's `initial_allocation_cents` and was not added again to `transfer_balance_cents`. Prize cash was added to that balance once.
4. Replay the settlement from July 1. The receipt is `replayed`, the revision is unchanged, and the balance sum is unchanged. A second campaign can settle while the first campaign's rows stay unchanged.
5. Overlap two settlement calls and assert one effect. A stale revision and a fingerprint conflict write nothing. An injected audit failure leaves the review clock and zero new seasons.
6. Assert every club has at least two contracted goalkeepers, one defender, one midfielder, one forward, and 16 contracted players, and that active wages fit `wage_budget_weekly_cents`. Feed the resulting ages and contracts through `plan_roster` for two more June 30 dates without simulating those seasons. The same floor holds, and the player count stays at or below 8,000.
7. Compare season-1 match and appearance rows from before settlement with the rows after it. They match. Development snapshots for one known changed player reload after reopen.
8. Expire or release coverage: a prepared non-compulsory reservation returns once inside the played career or a second imported save. A qualifying offer still blocks `settle_season` until Accept, using the G04 case if it already covers that save.
9. Export the rolled career and assert the UTF-8 size is at or below 32 MiB, then reimport it. Schema 1 refusal from the existing store test still passes.
10. Record the focused command, the release or debug runtime, and the export size in the Phase 10 progress log. Update README so Apply Development and Review Season are described as implemented, and scouting charts and dataset import stay later work.

## 7. Tests to add/change

- `season_settlement_pays_once_and_reopens`
- `roster_floor_holds_after_rollover_and_two_planned_years`
- `settlement_replay_isolation_and_rollback`
- `rolled_career_exports_within_32_mib`

Names may match the module style. The behaviors above are the requirement. Keep the Phase 8 and Phase 9 certification tests in the suite.

## 8. Verification commands

```bash
pnpm native:bindings:check
pnpm native:check
pnpm native:test:season
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

Run the new season certification in release mode first when the 34-round path is slow, and record the observed time. Unit and integration tests plus these checks are sufficient (DEC-005). No desktop session is required.

## 9. Acceptance coverage

| Item | Evidence |
| --- | --- |
| 1 — Schema upgrade and refusal | Existing store upgrade and schema-1 refusal, plus this career opening as schema 5. |
| 2 — Snapshot import and export | G06 export and reimport under 32 MiB. |
| 3 — Stable development | Round-17 reopen compares attributes, not a second plan. |
| 4 — Immutable matches | Season-1 row comparison around settlement. |
| 5 — Replay | Settlement replay leaves revision and balances unchanged. |
| 6 — Atomic settlement | Injected audit failure and the overlapping-call test. |
| 7 — Award timing | New-season prize sum, closing-season prize count, and the carryover identity. |
| 8 — Qualifying block and release | G04 qualifying case plus one reservation returning once. |
| 9 — Next calendar | 1,224 scheduled fixtures, no new matches, July 1 market action. |
| 10 — Viable squads | Post-settlement floor and two further pure years under 8,000 players. |
| 11 — Review controls | G05 UI tests for `Met` / `Missed`, Apply Development, and Start Next Season. |

## 10. Definition of done

- [ ] One played season settles, reopens, and replays without a second prize.
- [ ] Carryover excludes the new awards, and allocation is not added as cash.
- [ ] Every club still has a legal contracted core after the rollover and two planned years.
- [ ] README matches the implemented lifecycle and leaves charts and import to later phases.
- [ ] Phase 10 progress log contains the commands, export size, and runtime.
- [ ] No development-engine version change and no Phase 11 feature.

## 11. Commit instructions

```text
test(p10-g06): verify multi-season squads and awards
```

Stage the certification test, any invariant fix it required, README, and the Phase 10 progress row. Do not stage unrelated dirty files.

## 12. Handoff

Phase 11 may treat stored snapshots, judged objectives, and the next season's fixtures as inputs. It owns charts and insight text. It must not rerun development to explain a rating or post a prize that this phase already stored.
