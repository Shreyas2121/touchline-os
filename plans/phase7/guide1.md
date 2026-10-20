# P07-G01 — Record played matches

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §4.2, §7.6, and §8.
- **Parent phase:** `plans/phase7.md`, guide **P07-G01**. Match, xG, and appearance rules are phase §5 “Match record”. The work block is phase §6 `P07-G01`.
- **Predecessor guide:** none in Phase 7. Phase 6 is complete.
- **Predecessor commit:** `bd4b6003d70a0b7c826ddaad859db41e7180c6a9` (`test(p06-g06): verify controlled market workflows`). Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p07-g01): record played matches`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase7.md` → this guide. This guide does not close a season, correct a match, change a squad minute cell, or generate a player.

## 2. Goal and user-observable result

On Match Journal, a person can record a match they already played:

- Reload shows that match once, with the score and the word `Win`, `Draw`, or `Loss`.
- Optional appearances are stored with it. The same player cannot be added twice.
- `Fill from lineup` puts that lineup's starters on the sheet at 90 minutes. Bench players stay off until `Played` is checked. The click does not save the match.
- Blank xG stays blank. `1.840` is stored as milli-units.
- The player's club does not change.
- Match Journal no longer shows `Static preview — not save data`. Seasons still does.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor bd4b6003d70a0b7c826ddaad859db41e7180c6a9 HEAD` succeeds.
- `src/features/matches/MatchJournalPage.tsx` still renders `EmptyState`. If `recordMatch` already exists, stop and reconcile with this guide before editing.
- Do not install a package. Do not edit `schemaV1`, `src/data/migrations/v1.ts`, or `DATABASE_VERSION`.
- Do not add a policy action type. `{ type: 'season-rollover' }` already parses. Leave it unused.
- Leave `MASTER_PLAN.md` and `plans/phase7.md` unchanged in this commit. Stage this guide only, not `plans/phase7/guide2.md` or later guides.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase7.md` §5 “Match record”, including the `Fill from lineup` paragraphs, and “Banner”. The work block is phase §6 `P07-G01`.
- `src/domain/validation/schemas.ts` — `matchRecordSchema`, `appearanceSchema`, `lineupSchema`, `auditEventSchema`. Do not change the match, appearance, or lineup shapes.
- `src/data/repositories/lineups.ts` — `listLineups`. Read the active season's lineups. Do not write one.
- `src/domain/validation/limits.ts` — `minutesMax`, `goalsMax`, `xgMilliMax`.
- `src/data/transactions/run-command.ts` — `CONFLICT` message is `Campaign revision is stale.`
- `src/data/repositories/players.ts` — `listPlayersByClub`.
- `src/data/repositories/seasons.ts` — `getActiveSeason`.
- `src/features/squad/SquadBrowser.tsx` — the minutes cell stays `Unknown`.
- `src/app/layout/WorkspaceLayout.tsx` — banner paths. `/matches` is still in the preview set.
- `src/test/shell-nav.test.tsx` — the banner witness is Scouting. Leave it.
- `README.md` — the local-database paragraph.
- `eslint.config.js` — domain code cannot import React, Dexie, `Math.random`, or `Date`.

`src/data/commands/correct-match.ts` and `src/data/commands/advance-season.ts` do not exist. Do not create them.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/matches/xg.ts` | `parseXgMilli`, `formatXg` |
| `src/domain/matches/result.ts` | `matchResult` |
| `src/data/repositories/matches.ts` | List and insert |
| `src/data/repositories/appearances.ts` | List and insert |
| `src/data/commands/record-match.ts` | `recordMatch` |
| `src/domain/matches/from-lineup.ts` | `appearancesFromLineup` |
| `src/features/matches/MatchForm.tsx` | The entry form, including lineup fill |
| `src/features/matches/MatchJournalPage.tsx` | Replace the empty preview |
| `src/domain/validation/schemas.ts` | Audit type `match.record` only |
| `src/app/layout/WorkspaceLayout.tsx` | Hide the banner on `/matches` |
| `src/test/record-match.test.ts` | Command and form tests |
| `README.md` | Match writes |

### Public API

```ts
export function parseXgMilli(
  input: string,
): { ok: true; value: number | null } | { ok: false; message: string }

export function formatXg(milli: number | null): string

export function matchResult(
  goalsFor: number,
  goalsAgainst: number,
): 'Win' | 'Draw' | 'Loss'

export function appearancesFromLineup(
  lineup: {
    starters: readonly { playerId: string }[]
    benchPlayerIds: readonly string[]
  },
  managedPlayerIds: ReadonlySet<string>,
): {
  drafts: {
    playerId: string
    minutes: number | null
    started: boolean
    played: boolean
  }[]
  skipped: number
}

export function recordMatch(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<{ matchId: string }>>
```

`parseXgMilli('')` returns `{ ok: true, value: null }`. A non-empty value must match at most three decimal places and lie from 0 to 20. The failure message is `Enter xG as a number from 0 to 20 with at most three decimal places.` `formatXg(1840)` is `1.840`. `formatXg(null)` is an empty string.

A starter who is still managed is `{ minutes: 90, started: true, played: true }`. A bench player who is still managed is `{ minutes: null, started: false, played: false }`. `skipped` counts lineup ids that are not in `managedPlayerIds`. A bench id already used as a starter is not a second draft and is not counted as skipped.

Repository reads take `campaignId` and, for list functions, `seasonId`. A row whose campaign does not match is omitted. Inserts throw `PersistenceError('SCOPE', ...)` on a campaign mismatch and `PersistenceError('DUPLICATE', ...)` on a constraint error. Do not export an update or a delete from this guide.

## 6. Implementation steps

1. Add `parseXgMilli` and `formatXg` with integer math. Multiply a whole part by 1000 and a fractional part by `10` raised to `3 - fraction.length`. Do not store a JavaScript float.
2. Add `matchResult`. Do not write the word onto the match row.
3. Add the repositories. `listMatches` and `listAppearances` filter by `campaignId` and `seasonId`.
4. Add `recordMatch`. Parse a strict input. Inside `runCommand`, load the campaign and the active season. Refuse a season id that is not active. Validate the duplicate-player and managed-club rules from phase §5. Insert the match, then each appearance, then one audit. Summary: `Recorded match against ${opponent}`.
5. Build `MatchForm` with the labels in phase §5. `Record match` stays disabled until date, opponent, home or away, and both goal fields parse, and until every included appearance has minutes. Invalid xG shows the parse message and does not call the command. `Add appearance` appends a draft row. `Fill from lineup` calls `appearancesFromLineup` and replaces the appearance draft only. An unchecked bench row is not sent. A checked bench row with blank minutes shows `Enter minutes for this substitute.` and keeps Record disabled. Success text: `Recorded the match.`
6. Replace the journal empty preview with the form and the saved list. Load lineups with `listLineups` for the active season. Empty copy: `No matches are recorded.` No lineup copy: `Save a lineup on Tactics to fill a match from it.` Each stored row shows the date, opponent, `Home` or `Away`, `${goalsFor}–${goalsAgainst}`, and the result word.
7. Hide the preview banner on a path ending in `/matches`. Update the README so match records are named. Leave seasons, scouting, import, and backup as previews.
8. Do not change `SquadBrowser`. Do not call `evaluateAction`.

## 7. Tests to add/change

Create `src/test/record-match.test.ts`:

- A match with two appearances writes one match, two appearances, and one audit. Revision increases by 1. Both `clubId` values stay the same.
- The same player twice returns `VALIDATION` with `This match lists a player twice.` The match count stays 0.
- A player at another club returns `That player is not at the managed club.` and writes nothing.
- Blank xG stores null. Input milli-units `1840` store `1840`.
- A rendered form rejects `1.8400` with the xG message and does not increase the match count.
- `appearancesFromLineup` with two managed starters and one managed bench player returns the starters at 90, included and started, and the bench player excluded with null minutes. A departed starter increments `skipped` and is absent. A bench id that repeats a starter appears once.
- A rendered `Fill from lineup` shows those starters at `90` and does not insert a match. Recording a score with `Played` unchecked stores the starters only. Checking `Played` and leaving minutes blank keeps `Record match` disabled.
- A stored 2–1 renders `Win` and `2–1`. A stored 1–1 renders `Draw`.
- A stale `expectedRevision` returns `CONFLICT` and does not insert a second match.
- `listMatches` for campaign B does not include campaign A's row.
- `/app/demo/matches` does not show `Static preview — not save data`. `/app/demo/seasons` does.

`parseXgMilli('1.8')` is `1800`. `parseXgMilli('1')` is `1000`. `matchResult(0, 2)` is `Loss`.

## 8. Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: each command exits 0. `pnpm test` includes `record-match.test.ts`. `pnpm test:e2e` still has five specs. The Scouting banner witness stays.

## 9. Manual acceptance check

1. `pnpm dev`, open `/`, start the fictional demo, and choose `Ashbridge`.
2. Open Match Journal. Confirm the preview banner is absent.
3. Leave opponent empty and confirm `Record match` is disabled.
4. Enter date, opponent `Calder Reserve`, `Home`, goals `2` and `1`, and one squad player's 90 minutes. Leave both xG fields blank. Record.
5. Reload. The row shows `2–1` and `Win`. Squad still shows `Unknown` for minutes. The player is still at Ashbridge.
6. Open Tactics, save a lineup that has one starter and one bench player, and return to Match Journal. Choose that lineup and press `Fill from lineup`. The starter shows `90` and Started checked. The bench player shows `Played` unchecked. Enter only the score and record. Reload. The bench player has no appearance on that match.
7. Open Seasons and confirm the preview banner is still there.

## 10. Definition of done

- [ ] `recordMatch` is the only new write path, and a blocked or invalid payload writes nothing.
- [ ] xG is milli-units or null. The result word is derived.
- [ ] `Fill from lineup` only changes the draft. Starters default to 90. An unchecked substitute is not stored.
- [ ] Squad minutes are still the constant `Unknown`.
- [ ] No season is closed. No prospect is inserted.
- [ ] `schemaV1` and Dexie version 1 are unchanged.
- [ ] The README names match writes and still calls Seasons a preview.
- [ ] Lint, typecheck, test, build, and e2e pass.

## 11. Commit instructions

Stage only this guide's files. Do not stage later guides.

```text
feat(p07-g01): record played matches
```

Do not commit when a verification command fails. Record the SHA and the check results in `plans/phase7.md` §10. That progress-log edit may be a follow-up docs commit; do not rewrite the subject.

## 12. Handoff

- `recordMatch`, `parseXgMilli`, `formatXg`, `matchResult`, and `appearancesFromLineup` exist.
- Repositories can list and insert matches and appearances. Lineup reads stay on the existing lineup repository. They cannot update or delete a match yet.
- The next guide adds `seasonRecord` and the squad minutes cell. It must not enable `Correct match`.
