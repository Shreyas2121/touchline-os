# P08-G05 — Commit matchday results

## 1. Context and authority

- Master 3.0.4 §§4.1, 4.6, 7.1, 7.6, and 8; parent [Phase 8](../phase8.md) §§5.1.14–5.1.15, 5.4, and 5.5.
- Predecessors: G01 storage, G02 `schedule_season`, G03 selection, and G04 `simulate_fixture`.
- Commit: `feat(p08-g05): commit matchday results`.

This is the first guide that replaces the kickoff stop and shows results.

## 2. Goal and user-observable result

On September 1, Command Center shows the next opponent and **Sim Matchday**. Confirming it stores all 36 results, moves the date to September 8, and survives reopen. A repeated request does not create more matches. An illegal managed lineup, while a legal XI exists, leaves the save unchanged and explains how to fix Tactics or Registration. After a played round, Fixtures & Results shows the score, xG, events, both squads, and four tables.

## 3. Preconditions

G01–G04 are committed. Inspect the working tree and keep unrelated changes unstaged. Do not implement negotiations, growth, or rollover. The full 34-round certification belongs to G06; this guide still has to persist rounds generally, not only round 1.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/calendar.rs` and `progression.rs` — foundation states and `AdvanceRequest` shape.
- `src-tauri/crates/game-core/src/schedule.rs`, `match_selection.rs`, `match_engine.rs`.
- `src-tauri/crates/game-app/src/progression.rs` — preview outside the transaction, store recheck inside it.
- `src-tauri/crates/game-store/src/mutations.rs` — receipt and revision transaction style.
- `src-tauri/src/lib.rs` — `generate_handler!`.
- `src/platform/game-client.ts`, `native-client.ts`, `src/app/native/NativeProgression.tsx`.
- `src/app/native/NativeScreenTables.tsx` and `NativeWorkspace.tsx` — Fixtures & Results currently has no rows.
- `src/domain/matches/xg.ts` — `formatXg` for display only.
- `src/test/native-progression.test.tsx` — the current Phase 8 stop.

## 5. Files to create/modify

- Core clock: matchday and review states in `calendar.rs`.
- `game-app` preview/commit and a matchday read model.
- `game-store` transactional insert/update for fixtures, matches, appearances, player availability, clock, receipt, and audit.
- Thin commands `preview_matchday`, `sim_matchday`, and `matchday_view`.
- Generated DTOs and `GameClient`.
- Command Center, Fixtures & Results, and squad performance cells.
- Rust integration tests and frontend unit tests.

```rust
struct MatchdayPreview {
    campaign_id, revision, from_date, allowed, target_date, round,
    next_event, blocker, emergency, event_seed,
}
struct SimMatchdayRequest {
    campaign_id, expected_revision, source_date, source_boundary_key,
    target_date, action_id, audit_id, receipt_id, now,
    fixture_ids, match_ids, appearance_ids,
}
```

The request has no score or timeline field. ID vectors cover one round: 1,224 fixture ids only on the first matchday, otherwise empty; 36 match ids; appearance ids for every player with minutes, in fixture-key order. The server rejects a short or surplus vector before writing.

## 6. Implementation steps

1. Extend the clock. Consumed September 1 kickoff with no played round previews target round 1. A played round date previews the next weekly date while a scheduled round remains. After round 34, phase `review` previews `allowed: false` and `Season rollover arrives in Phase 10.` July 1 and August 31 still use Continue and `advance_time`.
2. `preview_matchday` loads the authoritative snapshot, builds or reads the pure calendar, runs selection and the engine outside a transaction, and returns the next opponent, blocker, or emergency label. It writes nothing.
3. On an allowed preview, fingerprint the material in Phase 8 §5.4. A matching `simulationReceipts.operationKey` returns the stored outcome and current revision without a new audit.
4. `sim_matchday` rechecks revision, source date, source boundary, target date, and receipt inside the store transaction. The first matchday inserts all 1,224 scheduled fixtures. That same transaction marks the 36 current fixtures played and inserts their matches and appearances. Later matchdays insert only that date's 36 results.
5. Update fitness, sharpness, injury dates, and suspension counts for the played clubs. Copy ratings and historical club ids from the engine output. Set the input snapshot to the pre-advantage selection, engine version, and seed. Audit action is `simulation.matchday`. Increment the campaign revision once.
6. Advance `currentDate` to the next round date, or set phase `review` and keep the final date. `lastBoundaryKey` becomes `season:{seasonId}:matchday:{date}`.
7. A blocker, stale revision, fingerprint conflict, or failed insert rolls back every fixture, match, appearance, availability change, clock change, receipt, and revision.
8. Add `matchday_view(campaignId, round)`. Default the round to the latest played, or 1. Return 36 fixtures, results, timelines, appearances, and four standings computed by `standings`. Do not route this through the 50-row screen page.
9. Command Center: at kickoff and later matchdays, show **Sim Matchday**, the opponent, and a calculating state while the command runs. Disable a second click. A blocker names Tactics or Registration. Review shows the Phase 10 sentence and no button. Loading, focus, and relaunch do not simulate.
10. Fixtures & Results: a round select, both team names, score, xG via `formatXg`, an accessible event list, and both appearance tables. Include the tie-break sentence from Phase 8 §5.5. Squad cells use `Unknown` before the calendar exists and `0` when it exists but the player has no appearance.
11. Keep Challenge and Sandbox protections. This command does not edit the constitution, ledger, contracts, or attributes.

## 7. Tests to add/change

- Real SQLite: September 1 plays 36 matches, inserts 1,224 fixtures, and reopens on September 8 with the same scores.
- Retry of that request returns `replayed: true`, the original receipt, and no extra rows. A different fingerprint conflicts. A stale revision writes nothing.
- An illegal managed lineup with 11 eligible players leaves the database unchanged, including zero fixtures.
- Inject a failure on the audit insert and prove rollback.
- Two overlapping same-day calls leave one matchday.
- Score, appearance totals, and standings from the read model match the stored events.
- Schema 2 import still has no fixtures until Sim Matchday. A second campaign is unchanged.
- UI tests: the kickoff message is gone, the blocker does not call simulate, a success refreshes the persisted date, and review has no simulate control.

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

Run the new matchday integration test and `src/test/native-progression.test.tsx` first. Mocked invoke tests do not replace the SQLite test. DEC-005 applies.

## 9. Acceptance coverage

Cover items 4–7 and 9–11 for a committed round: seed stability through replay, the blocker, atomic commit, reconciliation, tables, and the labelled controls. G06 runs all 34 rounds and the export measurement.

## 10. Definition of done

- [ ] Preview writes nothing and commit is atomic.
- [ ] The first matchday stores the calendar and round 1 together.
- [ ] Retry cannot reroll or double appearances.
- [ ] The UI reads persisted native data and formats xG in milli-units.
- [ ] Review copy is the Phase 10 sentence.
- [ ] No Phase 9 or Phase 10 behavior is added.

## 11. Commit instructions

```text
feat(p08-g05): commit matchday results
```

Stage application, store, IPC, generated bindings, UI, tests, README text that describes the new control, and the progress row.

## 12. Handoff

G06 runs all 34 rounds and the export-size check. It should not retune formulas. Any engine change after a stored match exists requires a new `MATCH_ENGINE_VERSION`, not a silent reroll.
