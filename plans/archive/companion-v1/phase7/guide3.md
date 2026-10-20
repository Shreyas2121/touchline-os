> **ARCHIVED / SUPERSEDED — reference only.** This companion plan was replaced on 2026-10-20 by MASTER_PLAN.md 2.0.0 and the active plans/phase7.md. Do not execute these instructions. Completed P07-G01 remains in plans/phase7/guide1.md unchanged.

---

# P07-G03 — Review and correct season history

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §7.6, and §12.2 invariant 7.
- **Parent phase:** `plans/phase7.md`, guide **P07-G03**. Correction and review rules are phase §5 “Correction and review”. The work block is phase §6 `P07-G03`.
- **Predecessor guide:** `plans/phase7/guide2.md`.
- **Predecessor commit:** the commit whose subject is `feat(p07-g02): derive season performance from logs`. Verify with `git log --grep="feat(p07-g02): derive season performance from logs" -1 --format=%H`.
- **Commit subject:** `feat(p07-g03): review and correct season history`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase7.md` → this guide. This guide does not advance a season and does not insert a ledger row.

## 2. Goal and user-observable result

A person can correct a logged match. The minutes become the new figure alone. Seasons shows a timeline and a review, including `Wage change` as `Unknown`. Seasons no longer shows `Static preview — not save data`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P07-G02 sha> HEAD` succeeds.
- `recordMatch` and `minutesByPlayer` exist. `advanceSeason` does not.
- Do not install a package. Do not edit `schemaV1` or `DATABASE_VERSION`.
- Leave later guide files unstaged.

## 4. Files to inspect

- `plans/phase7.md` §5 “Correction and review” and “Banner”.
- `src/data/commands/record-match.ts` — copy the payload checks. Do not export a shared writer that also closes a season.
- `src/data/repositories/appearances.ts` — this guide adds a delete-by-match function.
- `src/domain/finance/wages.ts` — `wageCommitment` for the active season only.
- `src/features/seasons/SeasonsPage.tsx` — still an empty preview.
- `src/data/repositories/seasons.ts` — `listSeasons`. There is no update yet. Add the smallest update this command needs.
- `src/app/layout/WorkspaceLayout.tsx`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/data/commands/correct-match.ts` | `correctMatch` |
| `src/data/repositories/appearances.ts` | `deleteAppearancesForMatch` |
| `src/data/repositories/matches.ts` | `updateMatch` |
| `src/features/seasons/SeasonReview.tsx` | Timeline and review |
| `src/features/seasons/SeasonsPage.tsx` | Host the review |
| `src/features/matches/MatchJournalPage.tsx` | `Correct match` |
| `src/domain/validation/schemas.ts` | Audit type `match.correct` only |
| `src/app/layout/WorkspaceLayout.tsx` | Hide the banner on `/seasons` |
| `src/test/correct-match.test.ts` | Replacement and review |
| `README.md` | Correction writes. Rollover is still not a write |

`deleteAppearancesForMatch` deletes only rows with that `matchId` and `campaignId`. `updateMatch` replaces the stored fields and keeps the id. Both run inside the command's transaction.

## 6. Implementation steps

1. Add `correctMatch`. The match must exist in the campaign and its `seasonId` must be the active season. Otherwise use `NOT_FOUND` or `That season is closed.`
2. Apply the same appearance rules as `recordMatch`, plus the sold-player allowance in phase §5. A failure writes nothing, including no delete.
3. On success, update the match, delete that match's appearances, insert the new set, and write one audit. Summary: `Corrected match against ${opponent}` using the opponent after the edit.
4. Add `Correct match` on each journal row. Reuse `MatchForm`, including `Fill from lineup`, and prefill it from the stored match. Filling again replaces the draft and writes nothing until `Save correction`. Success text: `Corrected the match.`
5. Build the season timeline and review from phase §5. `Wage change` is the literal `Unknown`. `Current weekly wages` uses `wageCommitment` on the active season only. Activity is at most 20 audit summaries for that `seasonId`, newest first. Empty copy: `No activity is recorded for this season.`
6. Hide the preview banner on a path ending in `/seasons`. Leave Scouting as the witness.
7. Do not add `Preview rollover` or `Confirm rollover`.

## 7. Tests to add/change

Create `src/test/correct-match.test.ts`:

- Record 90 minutes, then correct to 45. One appearance remains and `minutesByPlayer` returns 45.
- A player who already appeared can stay after `clubId` is set to another club through the repository. A different player who is already at that other club returns `That player is not at the managed club.` The 45-minute row remains.
- Mark that season `closed` with the table update already used in `src/test/save-lineup.test.ts`. `correctMatch` and `recordMatch` both write nothing. Do not add a public close command.
- A review of two matches shows the record, the appearance count, and `Wage change` `Unknown`.
- `/app/demo/seasons` does not show the preview banner. `/app/demo/scouting` does.

Do not call `advanceSeason`. It does not exist yet.

## 8. Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: each command exits 0. `pnpm test` includes `correct-match.test.ts`.

## 9. Manual acceptance check

1. Record a 1–0 match with 90 minutes.
2. Correct the minutes to 30 and the opponent text. Reload. Squad shows `30`, not `120`. The journal shows one row.
3. Open Seasons. The banner is gone. The active season is listed. `Wage change` reads `Unknown`.
4. Open Scouting. The banner remains.

## 10. Definition of done

- [ ] Correction replaces one match's appearances and writes one audit.
- [ ] A failed correction leaves the previous minutes in place.
- [ ] Closed seasons refuse record and correct.
- [ ] The review does not invent a wage delta.
- [ ] Rollover is not on the page.
- [ ] Lint, typecheck, test, build, and e2e pass.

## 11. Commit instructions

Stage only this guide's files.

```text
feat(p07-g03): review and correct season history
```

Do not commit when a verification command fails. Record the SHA in `plans/phase7.md` §10.

## 12. Handoff

- `correctMatch` is the replacement path. `minutesByPlayer` sees only the surviving rows.
- The season page is a real review and is not yet able to close a season.
- The next guide adds the preview and `advanceSeason` under that review.
