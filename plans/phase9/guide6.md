# P09-G06 — Verify transfer budgets and deadlines

## 1. Context and authority

- Master 3.0.4 / DEC-005 §§5.3, 5.4, 12.1, and 12.2 invariants 4, 5, and 17; parent [Phase 9](../phase9.md) §§7–10.
- Predecessor: `feat(p09-g05): run windows and incoming offers`.
- Commit: `test(p09-g06): verify transfer budgets and deadlines`.

This guide certifies the market. It does not add a formula, a match rule, or rollover.

## 2. Goal and user-observable result

A fixed-seed career can run every summer tick, reopen with the same bids and balances, and reach September 1 only after qualifying bids are resolved. A January tick and the winter close obey the same reservation rules. Repeating a tick or an Accept cannot move money twice. The product still refuses season rollover.

## 3. Preconditions

G05 is committed and one real SQLite tick already passes. Use certification to close gaps in coverage, not to redesign §5.2. If a test exposes a broken invariant, fix the implementation without weakening the assertion or the stored market version. Do not replay all 34 matchdays. Phase 8 already certified that season.

## 4. Files to inspect

- `src-tauri/crates/game-app/tests/full_season.rs` — career creation, reopen, export ceiling, and release-mode runtime notes.
- The G04 settle test and the G05 market-command test.
- `src-tauri/crates/game-store/tests/persistence.rs` — backup, reopen, and schema refusal.
- `src-tauri/crates/game-core/src/snapshot.rs` — `MAX_UTF8_BYTES`.
- README desktop and local-database sections.
- Phase 9 acceptance list and progress log.

## 5. Files to create/modify

- A Rust application integration test that runs the summer window and the winter path on a temporary database.
- Extra cases only where G05 left a gap: concurrent ticks, campaign isolation, reservation release, and export size.
- Frontend tests only if a window-close or inbox regression lacks coverage.
- README and the Phase 9 progress log.

Do not add a new command unless a certification fix requires it. Do not duplicate every pure unit test.

## 6. Implementation steps

1. Create a fixed-seed standalone career through the public service. Run all nine summer ticks through `run_market`, reopening after the July 1 tick and after the August 26 tick.
2. Assert the sum of `transfer_balance_cents` is unchanged across every AI-to-AI settlement. Assert every open negotiation's `reserved_cents` is covered by that buyer's balance after other reservations. Assert no buyer has more than three open buys, and no tick stored more than 12 new negotiations.
3. Replay the July 1 tick from the later date. The receipt is `replayed`, the revision is unchanged, and negotiation ids are unchanged.
4. If the seed produced a qualifying incoming bid, assert Reject writes nothing and the August 31 advance writes nothing. Accept it once, then advance to September 1. If the seed produced none, still assert the close command's qualifying count is zero and the advance succeeds. Cover the block on a second temporary database whose schema 4 snapshot already contains one affordable, reserved, qualifying offer. Import that snapshot through the public import path, then Reject, advance, and Accept. Do not add a test-only insert command and do not fabricate the bid inside the market planner.
5. Continue that career with Sim Matchday until the first January fixture date. Run Market, then Sim Matchday. On the next close date, run Close Window, then Sim Matchday. Compare the pre-tick match and appearance rows with the post-close rows for already played fixtures. They match.
6. Withdraw or let a non-compulsory negotiation expire and assert the reservation returns once. A second release does not increase spendable money again.
7. Overlap two same-tick calls and assert one effect. A stale revision and a fingerprint conflict write nothing. An injected audit failure leaves zero new negotiations. A second campaign can tick while the first campaign's rows stay unchanged.
8. Export the career and assert the UTF-8 size is at or below 32 MiB, then reimport it. Schema 1 refusal from the existing store test still passes. Review still returns `Season rollover arrives in Phase 10.`
9. Record the focused command, the release or debug runtime, and the export size in the Phase 9 progress log. Update README so Run Market and the inbox are described as implemented, and a second season is still refused.

## 7. Tests to add/change

- `summer_window_conserves_balances_and_replays_ticks`
- `qualifying_offer_blocks_close_until_one_accept`
- `winter_tick_and_close_leave_played_matches_unchanged`
- `reservation_release_stale_revision_and_isolation`

Names may match the module style. The behaviors above are the requirement. Keep the Phase 8 full-season test in the suite without turning it into a market test.

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

Run the new market certification in release mode first when the January path is slow, and record the observed time. Unit and integration tests plus these checks are sufficient (DEC-005). No desktop session is required.

## 9. Acceptance coverage

| Item | Evidence |
| --- | --- |
| 1 — Schema upgrade/refusal | Existing store upgrade and schema-1 refusal, plus this career opening as schema 4. |
| 2 — Snapshot import/export | G06 export and reimport under 32 MiB. |
| 3 — Stable proposals | July 1 replay compares negotiations, not a second draw. |
| 4 — Caps and affordability | Per-tick and per-club counts, and reserved cents within balance. |
| 5 — Replay | Tick replay and Accept replay leave revision and balances unchanged. |
| 6 — Atomic settlement | G04 rollback test plus G06 sum-of-balances check. |
| 7 — Compulsory lifecycle | Reject, expiry, and a second compulsory bid write nothing; Accept completes once. |
| 8 — Window close | August 31 advance writes nothing while a qualifying bid is open. |
| 9 — January order and immutable results | Winter test compares played match rows before and after the tick and close. |
| 10 — Reservation release | Withdraw or expiry restores spendable cents once. |
| 11 — Inbox controls | G05 UI tests for the compulsory word, Accept, Reject, and the blocker sentence. |

## 10. Definition of done

- [ ] Summer ticks, reopen, and replay are recorded.
- [ ] Qualifying close behavior and balance conservation are recorded.
- [ ] Winter order does not rewrite played matches.
- [ ] README matches the implemented market and still refuses rollover.
- [ ] Phase 9 progress log contains the commands, export size, and runtime.
- [ ] No market-engine version change and no Phase 10 feature.

## 11. Commit instructions

```text
test(p09-g06): verify transfer budgets and deadlines
```

Stage the certification test, any invariant fix it required, README, and the Phase 9 progress row. Do not stage unrelated dirty files.

## 12. Handoff

Phase 10 may treat stored negotiations, released or consumed reservations, and immutable qualification snapshots as inputs. It owns expiry, renewal, retirement, growth, awards, and the next calendar. It must not rerun a market tick to explain an old transfer.
