# P04-G05 — Persist and validate lineup workflows

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §7.3, §4.4, and §12.5.
- **Parent phase:** `plans/phase4.md`, guide **P04-G05**. Saved-lineup behavior, the banner change, and the browser journey are phase §5 “Saved lineups” and phase §6 `P04-G05`. The exit checks are phase §7 and §8.
- **Predecessor guide:** `plans/phase4/guide4.md`.
- **Predecessor commit:** the commit whose subject is `feat(p04-g04): enable interactive tactical planning`. Verify with `git log --grep="feat(p04-g04): enable interactive tactical planning" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `test(p04-g05): persist and validate lineup workflows`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase4.md` → this guide. This guide does not add the rule engine, a contract, a match, or a service worker.

## 2. Goal and user-observable result

Named lineups survive reload, and a player still cannot be stored twice:

- Saving `League XI` and reloading shows the same players on the same slots.
- A second name, `Cup Rotation`, can exist beside it. Deleting one leaves the other.
- A lineup that names a player outside the managed club is rejected and not stored.
- Choosing another saved lineup discards unsaved changes, and the page says so.
- Squad and Tactics do not show `Static preview — not save data`. Constitution still does, and it still says `Rules are not active in this build.`

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P04-G04 sha> HEAD` succeeds, using the SHA from §1.
- `LineupDraft`, `lineupProblems`, and `TacticsBoard` exist. `src/data/commands/save-lineup.ts` does not. If it does, stop and reconcile before editing.
- `rejectCommand` already exists from `P04-G02`. Reuse it. Do not add a second failure type.
- `playwright.config.ts` has `reuseExistingServer: false` and no `storageState`. Leave it that way.
- Do not edit `schemaV1` or `formationSlots`.
- Leave `MASTER_PLAN.md` and `plans/phase4.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase4.md` §5 “Saved lineups” and “Banner”, the `P04-G05` block in §6, and §7 acceptance criteria.
- `src/domain/player/lineup-draft.ts` — `lineupProblems` and `LineupDraft`.
- `src/domain/validation/schemas.ts` — `lineupSchema`. It stays permissive. Do not add a duplicate-player refine.
- `src/data/commands/update-player.ts` — the transaction shape and `rejectCommand`.
- `src/data/repositories/players.ts` — `listPlayersByClub` and `getPlayer`.
- `src/data/repositories/seasons.ts` — `getActiveSeason`.
- `src/features/tactics/TacticsBoard.tsx` — the in-memory draft this guide loads and saves.
- `src/app/layout/WorkspaceLayout.tsx` — `/squad` already hides the banner. `/tactics` does not.
- `src/app/copy.ts` — the sentence `This lineup is on this screen only. It is not saved yet.`
- `e2e/smoke.spec.ts` and `e2e/demo-journey.spec.ts` — the demo journey still expects the constitution banner. Keep that.
- `README.md` — the local-database paragraph.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/validation/schemas.ts` | Allow `lineup.save` and `lineup.delete` |
| `src/data/repositories/lineups.ts` | Scoped list, get, insert, update, and remove |
| `src/data/commands/save-lineup.ts` | `saveLineup` |
| `src/data/commands/delete-lineup.ts` | `deleteLineup` |
| `src/test/save-lineup.test.ts` | Isolation, roster rejection, conflict, delete |
| `src/features/tactics/TacticsBoard.tsx` | Load, save, switch, and delete |
| `src/features/tactics/TacticsPage.tsx` | Pass the active season and drop the unsaved sentence |
| `src/app/layout/WorkspaceLayout.tsx` | No preview banner on `/tactics` |
| `src/app/copy.ts` | Save and delete sentences. Remove the on-screen-only sentence |
| `e2e/tactics.spec.ts` | The phase-exit browser journey |
| `e2e/smoke.spec.ts` | Harbor’s Tactics page no longer claims the board is unsaved |
| `README.md` | Squad, notes, and lineups write to `touchline-os` |

Do not edit `lineupSchema`’s starter rules. Do not query `contracts` or `appearances`.

### Public API

```ts
export async function listLineups(
  database: TouchlineDatabase,
  campaignId: EntityId,
  seasonId: EntityId,
): Promise<Lineup[]>

export async function getLineup(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<Lineup | undefined>

export function saveLineup(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Lineup>>

export function deleteLineup(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<{ id: EntityId }>>
```

`listLineups` uses the `[campaignId+seasonId]` index, then sorts by `updatedAt` descending and `id` descending. `getLineup` returns `undefined` when the row is missing or its `campaignId` differs.

Save input, strict: `campaignId`, `lineupId`, `seasonId`, `expectedRevision`, `now`, `auditEventId`, `actionId`, `name`, `formation`, `starters`, `benchPlayerIds`. Delete input, strict: `campaignId`, `lineupId`, `expectedRevision`, `now`, `auditEventId`, `actionId`.

## 6. Implementation steps

1. Add `lineup.save` and `lineup.delete` to the audit enum. Keep `player.update` and `player.note`. Do not edit `schemaV1`.
2. Repository inserts use `add`. Updates use `update` after a campaign check, the same way `updatePlayer` does. `removeLineup` deletes one row after that check and throws `PersistenceError` `SCOPE` with message `Lineup is not in this campaign.` when the stored campaign does not match. It does not delete audit rows. There is no “delete every lineup” export.
3. `saveLineup` is an update-mode command on `lineups`, `players`, `seasons`, `clubs`, `campaigns`, and `auditEvents`. Inside the transaction, load the active season. A missing season, or a `seasonId` that is not that season, throws `SCOPE` with `Season is not the active season.` Load `listPlayersByClub` for `managedClubId` and build the roster id list from those rows only.
4. Run `lineupProblems` on a draft built from the input. Any problem throws `SCOPE` with message `This lineup does not match the current roster.` A trimmed name that fails `lineupSchema` is the generic validation failure. A different lineup in the same campaign and season with the same trimmed name throws `SCOPE` with message `A lineup with this name already exists.` `SCOPE` already becomes `VALIDATION` and keeps that message.
5. If `lineupId` exists in another campaign, `rejectCommand('NOT_FOUND', 'Lineup not found.')` and do not write. If it exists in this campaign, update it. If it does not exist, insert it. `updatedAt` is `now`. Starters and bench are the input, including `role: null`. Audit summary is exactly `Saved lineup ${name}`. `actionType` is `lineup.save`. `seasonId` is the active season id. Payload is the parsed input.
6. `deleteLineup` re-reads the lineup inside the transaction. Missing, or another campaign, is `rejectCommand('NOT_FOUND', 'Lineup not found.')` and deletes nothing. Otherwise remove that row, bump revision, and audit `Deleted lineup ${name}` with `actionType` `lineup.delete`. A stale `expectedRevision` is `CONFLICT` from `runCommand` before the delete.
7. On tactics open, load `listLineups` for the active season. If the list is non-empty, the draft is the first row. Otherwise it is `emptyDraft()`. The select is labeled `Saved lineups`. Its options are the lineup names in list order. `New lineup` sets the draft to `emptyDraft()` and does not delete. Changing the select replaces the draft immediately. The sentence above it is exactly `Choosing another lineup discards unsaved changes.`
8. `Lineup name` is a text input. **Save lineup** is disabled when the trimmed name is empty, when `lineupProblems` is non-empty, or while the command runs. When the problems include a roster or slot code, show `This lineup does not match the current roster.` Success text is exactly `Saved lineup ${name}.` Store `result.revision`. A new lineup uses one `createEntityId()` held in state for the attempt, so a retry does not allocate a second id after a failure that did not insert.
9. Delete is absent for a draft that has not been saved. For a saved lineup, a button opens an in-page panel. The confirm button’s accessible name is `Delete ${name}`. Escape closes the panel and does not call `deleteLineup`. This is not a Radix dialog. After success, that id is gone from the select and the draft becomes the next newest lineup, or `emptyDraft()` when none remain.
10. Remove `This lineup is on this screen only. It is not saved yet.` `WorkspaceLayout` omits `previewBanner` when the path ends with `/tactics`, in addition to command center, choose-club, and squad. Finance, constitution, transfers, registration, scouting, matches, and seasons keep the banner.
11. Replace the README local-database paragraph with: `Campaigns are stored in an IndexedDB database named touchline-os on this device. Creating a campaign, opening the fictional demo, renaming, archiving, or deleting a save, correcting a player, saving a development note, and saving a tactics lineup all write to that database. Finance, constitution, transfers, registration, scouting, matches, seasons, import, and backup are still previews.` Keep the following sentence about the one-time club choice.
12. Smoke, on Harbor’s Tactics step: the pitch name `Pitch` is visible, `Formation` is visible, `previewBanner` is absent, and `This lineup is on this screen only. It is not saved yet.` is absent. Constitution still expects `constitutionNote` and `previewBanner`.
13. Add `e2e/tactics.spec.ts` with `test.setTimeout(120_000)`. Do not set `storageState`.

## 7. Tests to add/change

`src/test/save-lineup.test.ts`, database `touchline-os-test`:

- Save `League XI` and `Cup Rotation` on campaign A’s active season. `listLineups` returns both, newest `updatedAt` first. Campaign B’s list is empty.
- A starter whose `clubId` is campaign B’s club, and a starter with `clubId` null, each return `VALIDATION` with message `This lineup does not match the current roster.` The lineup count is unchanged.
- Two starters with the same `playerId` return that same validation message and write nothing.
- `saveLineup` with a stale `expectedRevision` returns `CONFLICT` and leaves the stored formation unchanged.
- A second lineup with the same trimmed name and a different id returns `VALIDATION` with message `A lineup with this name already exists.`
- `deleteLineup` removes only the named lineup. The other lineup and campaign B remain. Deleting that id again returns `NOT_FOUND` and message `Lineup not found.`
- `getLineup` on campaign B with campaign A’s lineup id is `undefined`.

`e2e/tactics.spec.ts`:

1. Open `/`. Start **Try fictional demo**. Choose the button `Ashbridge`.
2. Open Squad. `previewBanner` is absent. A wage cell reads `Unknown`. A roster button exists. Record nothing from another club.
3. Open Tactics. The pitch name `Pitch` is visible. `previewBanner` is absent.
4. In the list named `Roster`, focus the first button and press Enter. The live text starts with `Holding `. Focus the button whose name matches `/^GK,/`, and press Enter. That button’s name contains the first player’s name.
5. Focus the second roster button, press Enter, focus the button whose name matches `/^RB,/`, and press Enter.
6. Fill `Lineup name` with `League XI` and activate `Save lineup`. The text `Saved lineup League XI.` is visible.
7. Reload. The URL still ends in `/tactics`. The GK button’s name still contains the first player.
8. Hold that same player from the roster and place them on the button whose name matches `/^ST,/`. The GK button’s name is `GK, empty`. The ST button’s name contains the player.
9. Set `Formation` to `4-4-2`. `Starting slots were cleared.` is visible.
10. Open Constitution. `Rules are not active in this build.` and `previewBanner` are visible.

Do not shrink the generator. Do not add `storageState`.

## 8. Verification commands

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected:

- Each command exits 0.
- `pnpm test` includes `save-lineup.test.ts` plus the earlier Phase 4 files.
- `pnpm test:e2e` runs `e2e/smoke.spec.ts`, `e2e/demo-journey.spec.ts`, and `e2e/tactics.spec.ts`.

This is the phase exit. Do not commit if any command fails.

## 9. Manual acceptance check

Use phase §8 “Manual browser pass”, steps 1 through 11. The minimum path on this commit is:

1. Demo, `Ashbridge`, Squad without the preview banner, then Tactics.
2. Place two players with the keyboard, save `League XI`, and reload. Both placements remain.
3. Move the first player to another slot and confirm the original slot no longer names them.
4. Save `Cup Rotation`, switch between the two names, delete `Cup Rotation`, and reload. `League XI` remains.
5. Switch to `4-4-2` and confirm the starters clear.
6. Finance and Constitution still show the preview banner. Harbor’s squad is empty and has no `League XI`.

## 10. Definition of done

- [ ] Two named lineups survive reload and stay inside one campaign and season.
- [ ] A player outside the managed club, a duplicate player, and a stale revision do not write.
- [ ] Delete removes one lineup and leaves every other lineup and campaign.
- [ ] Squad and Tactics hide the preview banner. Constitution and Finance keep it.
- [ ] The keyboard demo journey in `e2e/tactics.spec.ts` passes against the full fictional seed.
- [ ] `schemaV1` and Dexie version 1 are unchanged.
- [ ] README names player corrections, development notes, and tactics lineups as local writes.
- [ ] The §8 commands exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase4.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5 and `plans/phase4/guide5.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase4.md`, or earlier guides that are already committed.

Suggested message:

```text
test(p04-g05): persist and validate lineup workflows
```

Do not commit when §8 is failing. Do not amend the `P04-G04` commit. After the commit succeeds, record its full SHA and the checks `lint, typecheck, test, build, test:e2e` on the `P04-G05` row of `plans/phase4.md` §10. Check the phase exit boxes in that file only when §7 of the phase plan is true. That log edit is not part of this commit.

## 12. Handoff

Phase 5 may read saved lineups and development notes. It must not rewrite a lineup inside a finance command. It may replace the Finance and Constitution previews.

APIs this phase now leaves in place:

- `updatePlayer` and `saveDevelopmentNote` from `P04-G02`.
- `crestSpec`, `pitchLinePaths`, and `formationSlots` from `P04-G03`.
- `placeOnSlot`, `placeOnBench`, `switchFormation`, and `lineupProblems` from `P04-G04`.
- `saveLineup`, `deleteLineup`, and `listLineups` from this guide.

Known limitations this phase leaves on purpose:

- Wage, tier, contract end, and minutes stay `Unknown`.
- Slot `role` is stored as null. There is no role field on the board.
- The rule engine is not called. A saved lineup is not a rule verdict.
- Global search, import, and backup are still unavailable.
