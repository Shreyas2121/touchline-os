# P10-G05 — Review and confirm the next season

## 1. Context and authority

- Master 3.0.4 §§3.1, 3.3, 7.1, and 12.5; parent [Phase 10](../phase10.md) §§5.7 and 5.8.
- Predecessor: `feat(p10-g04): settle a season atomically`.
- Commit: `feat(p10-g05): review and confirm the next season`.

This is the first guide that stops the clock after round 17 and replaces the review sentence with a confirm.

## 2. Goal and user-observable result

After the halfway matchday, Command Center shows **Apply Development**. Confirming it stores that period's changes, and the next action is **Sim Matchday**. In review, Command Center shows **Review Season**. Seasons shows the position, three objective words, the prize, the carryover, and the next allocation. **Start Next Season** asks for confirmation, then the date is July 1 and the primary action is **Run Market**. A qualifying bid hides the confirm and shows `Accept the qualifying offer before the season can roll over.` A player's changed ratings can be read without a chart.

## 3. Preconditions

G04's service commands already persist. Update the full-season test so the round after the halfway matchday calls `apply_development` once. That test still expects 1,224 played fixtures. Do not add a radar, an archetype, or a second allocation command.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/calendar.rs` — `foundation_clock` and the round-34 review branch.
- `src-tauri/crates/game-core/src/matchday.rs` — where a played round moves the date, and `ROLLOVER_UNAVAILABLE`.
- `src-tauri/crates/game-app/src/lifecycle.rs` — the G04 previews.
- `src-tauri/crates/game-app/tests/full_season.rs` — the 34-call loop.
- `src/app/native/NativeProgression.tsx` — primary action and the review sentence.
- `src/app/native/NativeScreen.tsx` and `NativeScreenTables.tsx` — the Seasons section and the player profile.
- `src/app/native/NativePlanningEditor.tsx` — development notes stay notes.
- `src/app/native/NativeRoutes.tsx` — the help paragraph that still names Phase 10.
- `src/test/native-progression.test.tsx` — the current review assertion.
- `src/app/routes.ts` — Seasons already has a route. Keep it.

## 5. Files to create/modify

- Extend the clock so a consumed round-17 matchday key stays on that date until the midseason development key is consumed. The next action then advances to round 18 as it does today.
- Add a native season-review body and a development-history list on the player profile.
- Wire the three buttons to the G04 client methods.
- Update help copy and the progression tests that expect the old review sentence or an unbroken 34-call loop.

`ROLLOVER_UNAVAILABLE` is no longer the review preview reason. Review with no qualifying offer is allowed. The qualifying sentence and `Finish every league fixture before the season can roll over.` stay the blockers.

## 6. Implementation steps

1. In the clock, treat `season:{seasonId}:development:midseason` on the round-17 date as the consumed development boundary. Until that key is stored, `preview_time` is not allowed and the reason is `Development is applied after the halfway matchday.` `sim_matchday` for that round still saves the results, then leaves the date and phase on that matchday instead of moving a week.
2. Command Center uses the primary-action table in Phase 10 §5.8, including the Phase 9 market rows. One primary button. A second click while the request is in flight does nothing.
3. **Apply Development** shows `Calculating player development.` and then the managed attribute list from `preview_development`. Confirm calls `apply_development` with the preview's id counts. A blocker replaces the button.
4. **Review Season** opens Seasons. The screen reads `preview_season`. It shows `Met` or `Missed` as words, the euro amounts with the existing money format, and the renewal, release, retirement, and intake counts. Confirm calls `settle_season`. The loading sentence is `Calculating the new season.`
5. After a stored settlement, Seasons reads that row and does not render **Start Next Season**. Command Center on the new July 1 shows **Run Market** through the existing market preview.
6. Player profile lists stored snapshots for that player: period, six ratings, and both values. With none, show `Development is applied after the halfway matchday and at season review.` Do not add a chart. Saving a development note still changes only the note.
7. Help text names Apply Development and Review Season and says a second season starts only after confirm.
8. Update `full_season.rs` so the call after round 17 is `apply_development`, then the remaining matchdays. Keep the 1,224 result assertions. Update the React test that looked for the Phase 10 sentence.

## 7. Tests to add/change

- Rust: a public `sim_matchday` on round 17 leaves the date on that fixture, and `preview_time` is not allowed until `apply_development`. The following matchday then plays round 18.
- Rust: review preview is allowed, and settle through the public command reaches July 1 with Run Market due. A qualifying offer makes preview `allowed: false` with the rollover sentence.
- Vitest: the review screen shows `Met` or `Missed`, the prize, and **Start Next Season**. A second click is not sent. The qualifying state has no button.
- Vitest: Apply Development renders the calculating sentence and then one attribute row. The empty history sentence renders when the profile has no snapshots.
- The updated full-season test still reconciles 1,224 played fixtures.

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

Run the lifecycle clock test and `native-progression.test.tsx` before the full set. Unit and integration tests plus these checks are sufficient (DEC-005). No desktop session is required.

## 9. Acceptance coverage

| Item | Evidence |
| --- | --- |
| 9 — Next July 1 and Run Market | The public settle test, plus the existing market preview on a null July 1 cursor. |
| 11 — Keyboard review | Buttons are real `button` elements with the names above; the objective state is text. The existing focus coverage for Command Center still applies. |
| 5 and 8 — Confirm and the qualifying block | Preview allowed flag and the hidden button. |
| 3 and 4 | Unchanged G02 behavior; the full-season test still has 1,224 results after the extra development call. |

## 10. Definition of done

- [ ] Round 17 waits for Apply Development, then the season can be finished.
- [ ] Review confirms once into a July 1 market date.
- [ ] Seasons shows objective words and euro amounts from the preview.
- [ ] Development history is a list, and notes still do not change attributes.
- [ ] Help no longer says rollover is unavailable.
- [ ] The Phase 10 progress log records this commit.

## 11. Commit instructions

```text
feat(p10-g05): review and confirm the next season
```

Stage the clock change, native Seasons and profile UI, tests, help copy, and the Phase 10 progress row. Do not stage unrelated dirty files.

## 12. Handoff

G06 certifies one played season through these buttons' commands, then replays the settlement. It may tighten a check that this guide left open. It must not add a formula or a chart.
