# P08-G06 — Verify a full simulated season

## 1. Context and authority

- Master 3.0.4 / DEC-005 §§7.6, 12.1, and 12.2 invariants 7 and 13–16; parent [Phase 8](../phase8.md) §§7–10.
- Predecessor: `feat(p08-g05): commit matchday results`.
- Commit: `test(p08-g06): verify a full simulated season`.

This guide certifies the matchday season. It does not add a formula, a market, or rollover.

## 2. Goal and user-observable result

A fixed-seed career can finish all 34 rounds, reopen with 1,224 unique results, and stop in review. Repeating an earlier matchday cannot rewrite it. The product still refuses season rollover.

## 3. Preconditions

G05 is committed and one real SQLite round already passes. Use certification to close gaps in coverage, not to redesign the engine. If a test exposes a broken invariant, fix the implementation without weakening the assertion or the stored engine version.

## 4. Files to inspect

- `src-tauri/crates/game-app/tests/progression.rs` and the G05 matchday integration test.
- `src-tauri/crates/game-store/tests/persistence.rs` — backup, reopen, and schema refusal.
- `src-tauri/crates/game-core/src/snapshot.rs` — `MAX_UTF8_BYTES`.
- README desktop and local-database sections.
- Phase 8 acceptance list and progress log.

## 5. Files to create/modify

- A Rust application integration test that plays 34 rounds on a temporary database.
- Extra cases only where G05 left a gap: export size, campaign isolation, review refusal, and unchanged finance/contract/attribute rows.
- Frontend tests only if a review or round-select regression lacks coverage.
- README and the Phase 8 progress log.

Do not add a new command unless a certification fix requires it. Do not duplicate every pure unit test.

## 6. Implementation steps

1. Create a fixed-seed standalone career, advance July 1 to kickoff, and confirm Sim Matchday is the next action.
2. Simulate rounds 1 through 34 through the public application service, reopening the store after round 1 and after round 34.
3. Assert 1,224 played fixtures, 306 per league, both venues for every pair, 36 results per date, and no duplicate appearance key.
4. For every match, assert the score equals goal events, team xG equals recorded chances, and minutes and cards fit the Phase 8 bounds.
5. Replay the round 1 request after round 34. Expect the original receipt, original score, and no revision change.
6. Assert ledger, contract, attribute, constitution, and offer rows are unchanged from kickoff, apart from matchday audits, receipts, clock, fixtures, matches, appearances, and legal availability updates.
7. Export the finished campaign and assert the byte length is at or below 32 MiB. Reimport it into an empty store and compare match rows. Reset or advance a different campaign and prove the finished career is unchanged.
8. From review, call preview and sim. Both stop with `Season rollover arrives in Phase 10.` and write nothing.
9. Record the actual commands and counts in `plans/phase8.md`. Update README so the current product plays a matchday and still has no negotiations or second season.
10. Do not claim installer signing, updater behavior, or a performance budget. Phase 13 owns those.

## 7. Tests to add/change

- Full-season Rust integration coverage described above.
- Concurrent replay is already required in G05; keep it, and add the cross-round replay here.
- Schema 1 refusal remains a store test and must still pass after a season of schema 3 writes.
- UI coverage for the review sentence if G05 did not already assert it.

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

The full-season test belongs to `pnpm native:check`. Record its runtime and the export byte length. Unit and integration tests plus these checks are sufficient (DEC-005). No manual season playthrough is required.

## 9. Acceptance coverage

Map Phase 8 items 1–11 onto the named integration test and the retained G01–G05 tests. Item 11 is covered by the existing labelled controls and the review assertion, not by a desktop session.

## 10. Definition of done

- [ ] 34 rounds, 1,224 results, and both venues are proven on SQLite.
- [ ] Reopen and historical replay do not reroll.
- [ ] Export stays within 32 MiB and reimports the same matches.
- [ ] Finance, contracts, and attributes are unchanged by results.
- [ ] Review refuses rollover.
- [ ] README and the progress log match the checks that actually ran.
- [ ] No Phase 9 market or Phase 10 settlement is included.

## 11. Commit instructions

```text
test(p08-g06): verify a full simulated season
```

Stage certification tests, any narrow invariant fix, README, and the progress log. A later evidence-only commit is allowed if the certification commit's checks need a recorded SHA. Do not mark the phase complete while a required command is failing.

## 12. Handoff

Phase 9 starts from a calendar that can already sit inside the winter window. It adds offers and settlements without rewriting stored matches. Phase 10 is the first phase allowed to leave review, post prizes, and create the next season's fixtures. Generate Phase 9 and its guides from master 3.0.4 only after this guide's checks are recorded.
