> **ARCHIVED / SUPERSEDED — reference only.** This companion plan was replaced on 2026-10-20 by MASTER_PLAN.md 2.0.0 and the active plans/phase7.md. Do not execute these instructions. Completed P07-G01 remains in plans/phase7/guide1.md unchanged.

---

# P07-G02 — Derive season performance from logs

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §4.1 rule 6, §7.2, and §7.6.
- **Parent phase:** `plans/phase7.md`, guide **P07-G02**. Totals and minutes are phase §5 “Minutes and the season record”. The work block is phase §6 `P07-G02`.
- **Predecessor guide:** `plans/phase7/guide1.md`.
- **Predecessor commit:** the commit whose subject is `feat(p07-g01): record played matches`. Verify with `git log --grep="feat(p07-g01): record played matches" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p07-g02): derive season performance from logs`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase7.md` → this guide. This guide does not correct a match, close a season, or write an appearance.

## 2. Goal and user-observable result

After a match is stored, the journal shows the season's played, wins, draws, losses, and goals. Squad shows the sum of that player's active-season minutes. A player with no appearance still reads `Unknown`. A match with nobody listed is an incomplete log.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P07-G01 sha> HEAD` succeeds, using the SHA from §1.
- `recordMatch` exists. `correctMatch` does not. If `seasonRecord` already exists, stop and reconcile before editing.
- Do not install a package. Do not edit `schemaV1`, `src/data/migrations/v1.ts`, or `DATABASE_VERSION`.
- Leave `MASTER_PLAN.md` and `plans/phase7.md` unchanged except for the progress log if you are recording the previous SHA. Do not stage `plans/phase7/guide3.md` or later guides.

## 4. Files to inspect

- `plans/phase7.md` §5 “Minutes and the season record”.
- `src/domain/matches/result.ts` — reuse `matchResult`. Do not duplicate the comparison.
- `src/data/repositories/matches.ts` and `src/data/repositories/appearances.ts`.
- `src/features/matches/MatchJournalPage.tsx`.
- `src/features/squad/SquadBrowser.tsx` — minutes cell is `() => 'Unknown'`.
- `src/features/squad/PlayerProfile.tsx`.
- `e2e/transfers.spec.ts` — the first squad row's minutes must stay `Unknown` on the unedited demo. Do not seed appearances.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/matches/season-record.ts` | `seasonRecord`, `minutesByPlayer` |
| `src/features/matches/MatchJournalPage.tsx` | Totals and the incomplete sentence |
| `src/features/squad/SquadBrowser.tsx` | Minutes from the map |
| `src/features/squad/PlayerProfile.tsx` | Appearance list |
| `src/test/season-record.test.ts` | Pure totals and one rendered squad |
| `README.md` | Only if it still says minutes can never be stored |

### Public API

```ts
export function seasonRecord(
  matches: readonly { id: string; goalsFor: number; goalsAgainst: number }[],
  appearanceCounts: ReadonlyMap<string, number>,
): {
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  incompleteMatches: number
}

export function minutesByPlayer(
  appearances: readonly { playerId: string; minutes: number }[],
): Map<string, number>
```

`appearanceCounts` maps a match id to how many appearance rows it has. A count of 0, or a missing key, makes that match incomplete. `minutesByPlayer` skips no row that it is given. Callers pass only the active season's rows. A player who is absent from the input is absent from the map.

## 6. Implementation steps

1. Add the two pure functions. Use `matchResult` for the win, draw, and loss counts. Sum goals from the match rows, not from appearance goals.
2. On the journal, load the active season's matches and appearances through the repositories. Render `Played`, `Wins`, `Draws`, `Losses`, `Goals for`, and `Goals against`.
3. When `incompleteMatches` is greater than 0, show `Incomplete logs: ${incompleteMatches}`. When `played` is greater than 0 and the incomplete count is 0, show `Every recorded match has an appearance log.` Zero matches keep `No matches are recorded.` and omit both sentences.
4. Pass the minute map into the squad table. Render a hit as the decimal integer. Render a miss as `Unknown`. Do not render `0` for a miss. A stored zero still renders `0`.
5. On the profile, list that player's active-season appearances, newest date first, with date, opponent, and minutes. Empty copy: `No appearances are recorded.`
6. Do not add `Correct match`. Do not add a write.

## 7. Tests to add/change

Create `src/test/season-record.test.ts`:

- Minutes 90 and 45 for one player sum to 135. A second player with no row is absent from the map.
- A match id with count 0 sets `incompleteMatches` to 1. A match id with count 1 does not.
- Scores 2–1 and 0–0 produce one win, one draw, `goalsFor` 2, and `goalsAgainst` 1.
- A rendered squad row whose map value is 90 shows `90`. A row missing from the map shows `Unknown`, not `0`.
- An appearance whose season is not the active season is not included by the page loader. Assert that with two seasons in the test database.
- Campaign B's appearances are not returned by campaign A's list.

Leave `e2e/transfers.spec.ts` expecting `Unknown` on the first demo squad row.

## 8. Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: each command exits 0. `pnpm test` includes `season-record.test.ts`.

## 9. Manual acceptance check

1. Start the fictional demo and choose `Ashbridge`.
2. Record a 2–0 home win with one player at 90 minutes and a second player omitted.
3. Confirm the journal shows `Played` 1, `Wins` 1, and no incomplete sentence if that one match has an appearance. Add a second match with no appearance and confirm `Incomplete logs: 1`.
4. Open Squad. The listed player shows `90`. Another player shows `Unknown`.
5. Reload. The figures stay. No second match appears for the first entry.

## 10. Definition of done

- [ ] Totals and minutes are derived. No new table is written.
- [ ] Unknown minutes stay `Unknown`. Stored zero stays `0`.
- [ ] Other seasons and other campaigns are excluded.
- [ ] The demo seed is unchanged, so the existing minutes assertion still passes.
- [ ] Lint, typecheck, test, build, and e2e pass.

## 11. Commit instructions

Stage only this guide's files.

```text
feat(p07-g02): derive season performance from logs
```

Do not commit when a verification command fails. Record the SHA in `plans/phase7.md` §10.

## 12. Handoff

- `seasonRecord` and `minutesByPlayer` are the only total functions. The next guide must delete a match's old appearances before inserting replacements, or the sum will see both.
- Correction and the season page are still previews of a write. Seasons still shows the banner.
