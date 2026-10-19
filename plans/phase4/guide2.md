# P04-G02 — Player details and notes

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §4.1 rules 5, 7, and 10, and §7.2.
- **Parent phase:** `plans/phase4.md`, guide **P04-G02**. The correction and note contracts are phase §5 “Player correction” and “Development notes”. The work block is phase §6 `P04-G02`.
- **Predecessor guide:** `plans/phase4/guide1.md`.
- **Predecessor commit:** the commit whose subject is `feat(p04-g01): build squad browser`. Verify with `git log --grep="feat(p04-g01): build squad browser" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p04-g02): add player details and notes`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase4.md` → this guide. This guide does not draw a crest, place a player on a pitch, or write a contract.

## 2. Goal and user-observable result

Selecting a squad row opens a profile that can be saved:

- The profile shows identity, age, market value, source, and the six attributes. Absent attributes read `Missing`. Empty wage history reads `Contracts are not recorded in this build.`
- **Save player** stores a correction and the audit `Updated player ${name}`. `source` and `clubId` stay as they were. A blank birth date stays null.
- **Save note** stores one development note for the active season and does not change attributes. A second save updates that same note.
- A stale revision shows `This save changed in another tab. Reload and try again.` and does not write.
- Reload shows the corrected name and the note.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P04-G01 sha> HEAD` succeeds, using the SHA from §1.
- `src/features/squad/SquadBrowser.tsx` already selects a player and shows `This build does not edit players yet.`
- `src/data/commands/update-player.ts` and `src/data/commands/save-development-note.ts` do not exist. If either does, stop and reconcile before editing.
- `CommandFailure` in `src/data/transactions/run-command.ts` is not exported. This guide exports a throw helper. It does not change how existing commands fail.
- Do not edit `schemaV1`. Do not add React Hook Form or Radix.
- Leave `MASTER_PLAN.md` and `plans/phase4.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase4.md` §5 “Player correction” and “Development notes”, and the `P04-G02` block in §6.
- `src/data/commands/add-player.ts` — the update-mode command shape. `updatePlayer` must not accept `clubId` or `source`.
- `src/data/transactions/run-command.ts` — `SCOPE` becomes `VALIDATION` and keeps `PersistenceError.message`. A missing campaign is already `NOT_FOUND`. A missing player is not.
- `src/data/repositories/players.ts` — `getPlayer` and `insertPlayer`. `update` is not there yet. Copy the campaign check from `updateCampaign` in `src/data/repositories/campaigns.ts`.
- `src/data/repositories/seasons.ts` — `getActiveSeason`.
- `src/data/repositories/audit-events.ts` — `listAuditEvents` is newest first.
- `src/domain/validation/schemas.ts` — `playerSchema`, `developmentPlanSchema`, and the `actionType` enum. `attributesSchema` is not exported; build attributes so `playerSchema` accepts them.
- `src/domain/models/money.ts` — `parseMoneyCents` and `invalidMoneyMessage`.
- `src/domain/models/dates.ts` — `parseDateOnly` and `invalidDateMessage`.
- `src/domain/models/positions.ts` — `positionGroupFor` and `positions`.
- `src/app/copy.ts` — `staleSave`.
- `src/features/squad/SquadBrowser.tsx` and `src/features/squad/SquadPage.tsx` — the selection region and where `revision` must be kept.
- `src/test/schemas.test.ts` — `campaign.unknown` must still fail. Adding enum members must not require a new fixture unless a test lists every action.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/data/transactions/run-command.ts` | Export `rejectCommand` |
| `src/data/repositories/players.ts` | `updatePlayer` |
| `src/data/repositories/development-plans.ts` | Get, insert, and update one plan |
| `src/data/commands/update-player.ts` | `updatePlayer` command |
| `src/data/commands/save-development-note.ts` | `saveDevelopmentNote` |
| `src/domain/validation/schemas.ts` | `player.update` and `player.note` |
| `src/features/squad/PlayerProfile.tsx` | The form, note, history, and attribute list |
| `src/features/squad/SquadBrowser.tsx` | Render the profile instead of the locked sentence |
| `src/features/squad/SquadPage.tsx` | Pass season, revision, and a reload callback |
| `src/test/update-player.test.ts` | Command cases |
| `src/test/player-profile.test.tsx` | Profile copy and a saved note |

Do not edit the tactics page, crest code, or `schemaV1`.

### Public API

```ts
export function rejectCommand(
  code: 'NOT_FOUND' | 'CONFLICT',
  message: string,
): never

export async function updateStoredPlayer(
  database: TouchlineDatabase,
  campaignId: EntityId,
  player: Player,
): Promise<void>

export function updatePlayer(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Player>>

export function saveDevelopmentNote(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<DevelopmentPlan>>
```

`updateStoredPlayer` lives in `src/data/repositories/players.ts`. `updatePlayer` lives in `src/data/commands/update-player.ts` and calls `updateStoredPlayer`. Feature code imports `updatePlayer` from the command file only.

`rejectCommand` throws the existing private `CommandFailure`. It does not return a `CommandResult`. `runCommand` already maps that throw to `{ ok: false, code, message }` and aborts the transaction.

## 6. Implementation steps

1. Export `rejectCommand` from `run-command.ts`. Do not export the class. Do not change `failed`.
2. Add `player.update` and `player.note` to the audit enum. Keep every existing action. `campaign.unknown` still fails to parse.
3. `updateStoredPlayer` loads the row by id. A missing row or a `campaignId` mismatch throws `PersistenceError` `SCOPE` with message `Player is not in this campaign.` It then `update`s the stored id. It does not call `put` or `add`.
4. The command input is a strict object: `campaignId`, `playerId`, `expectedRevision`, `now`, `auditEventId`, `actionId`, `name`, `positions`, `nationalityCode`, `birthDate`, `reportedAge`, `marketValueCents`, `attributes`, `potential`. It has no `clubId`, `source`, `externalSourceId`, `isNewgen`, or `positionGroup`. An input that includes `clubId` fails the strict parse and returns `VALIDATION` with message `Command input is not valid.` before `runCommand` writes.
5. Inside the transaction, `getPlayer`. Undefined means `rejectCommand('NOT_FOUND', 'Player not found.')`. That covers a missing id and an id that belongs to another campaign. Do not update the other campaign’s row.
6. Copy `clubId`, `source`, `externalSourceId`, and `isNewgen` from the stored player. Set `positionGroup` with `positionGroupFor` on every submitted position. Mixed groups fail `playerSchema` and become `VALIDATION`. When `reportedAge` is null, store `ageReferenceSeasonOrdinal: null`. When it is set, load `getActiveSeason` and store that `ordinal`. A missing active season throws `PersistenceError` `SCOPE` with message `This campaign has no active season.` Do not invent a birth date. Do not copy `reportedAge` into `birthDate`.
7. Write the player, bump the campaign through the revision `runCommand` passes in, and append the audit. Summary is exactly `Updated player ${name}` using the submitted name. `actionType` is `player.update`. `seasonId` is the active season id, or null when the age was cleared and no season was required. Payload is the parsed input and includes `playerId`.
8. `getDevelopmentPlan(database, campaignId, playerId, seasonId)` uses the `[campaignId+playerId+seasonId]` index. `saveDevelopmentNote` input adds `seasonId`, `planId`, `notes`, and `targetRole` to the usual command fields. `notes` is a string up to 4_000 characters. `targetRole` is a 1–40 character string or null. `status` is not an input. The stored status is `open`.
9. Inside that transaction, a missing player is `NOT_FOUND` with `Player not found.` The season must be the active season; otherwise throw `SCOPE` with `Season is not the active season.` If a plan already exists for that player and season, update its `notes` and `targetRole` and keep its id. Ignore `planId` in that case. If none exists, insert `planId`. Do not read or write the player row. Audit summary is exactly `Noted development for ${name}`. `actionType` is `player.note`.
10. Replace the locked sentence in the selection region with `PlayerProfile`. Show `Source stays ${sourceLabel(player.source)}. This correction is recorded in activity.` Show `Newgen` only when `isNewgen` is true. List the six attribute keys in the phase order. A present integer, including `0`, is that integer. An absent key is `Missing`. Birth date text is the stored date or `No birth date recorded.` Age uses `ageText(displayAge(...))`.
11. The player form uses native controls. Labels: `Name`, `Position`, `Nationality`, `Birth date`, `Reported age`, `Market value`, `Pace`, `Finishing`, `Passing`, `Dribbling`, `Defending`, `Physical`, `Potential`. The position control is a select of every `positions` entry, defaulting to `positions[0]`. Save sends that one position only. There is no wage, tier, minutes, club, or source control.
12. Block **Save player** without calling the command when the name is empty, nationality is not blank and not two letters after trim and uppercase, the birth date is not blank and `parseDateOnly` fails, the reported age is not blank and not an integer 0–99, the market value is not blank and `parseMoneyCents` fails, or a rating is not blank and not an integer 0–100. Messages, exact: `Enter a two-letter code or leave nationality blank.` `invalidDateMessage`, `Enter an age from 0 to 99, or leave it blank.` `invalidMoneyMessage`, and `Enter a rating from 0 to 100, or leave it blank.` Blank market value, birth date, reported age, potential, and attribute fields are null or omitted. They are not zero. Uppercase a two-letter nationality before submit.
13. The note form is separate. Labels: `Development notes`, `Target role`, button `Save note`. Helper text, exact: `Notes stay in this companion. They do not change the player's attributes.` Blank target role is null. Blank notes save as `''`.
14. Both buttons use `Button`, disable while their own command runs, and do not submit the other form. Success text is `Player updated.` or `Development note saved.` `CONFLICT` shows `staleSave` and does not retry. After `ok`, store `result.revision` as the next `expectedRevision` and reload the squad list and the open profile from IndexedDB. Pass `systemClock()` and new ids from `createEntityId()` at this edge. Reuse the plan id returned by the command so a second note does not allocate a second row.
15. History is a list labeled `History`. Take `listAuditEvents`, keep events whose payload is an object with `playerId` equal to the selected player, and show at most 20 summaries. Empty copy, exact: `No individual history for this player.` Contracts copy, exact: `Contracts are not recorded in this build.` Do not render a shortlist or compare control.

## 7. Tests to add/change

`src/test/update-player.test.ts`, database `touchline-os-test`:

- After `createCampaign` and `addPlayer` with `source: 'fictional'`, `updatePlayer` changes the name, writes one audit whose summary is `Updated player ${name}`, keeps `source` and `clubId`, and returns `revision` 3 when create was 1 and add was 2. Assert the actual revisions rather than assuming a number if a fixture inserts extra audits. The stored birth date stays null when the input birth date is null and `reportedAge` is 21. `ageReferenceSeasonOrdinal` becomes the active season ordinal.
- The same call with `expectedRevision` one behind returns `CONFLICT`. The name, revision, and audit count stay as they were.
- An input object that includes `clubId` returns `VALIDATION` and message `Command input is not valid.`
- `updatePlayer` for an id that exists only on campaign B returns `NOT_FOUND`, message `Player not found.`, and campaign B’s player is unchanged.
- `saveDevelopmentNote` leaves `attributes` deep-equal to the stored player. A second save with new notes keeps one plan row, changes the notes, and writes a second `player.note` audit. `getDevelopmentPlan` for campaign B and that player id is `undefined`.

`src/test/player-profile.test.tsx`:

- Render a squad with one player, select them, and find `Contracts are not recorded in this build.`
- The profile does not include a button named `Shortlist` or `Compare`.
- An attribute bag that omits `pace` shows `Missing` next to Pace. A stored `pace` of `0` shows `0`, not `Missing`.
- Fill `Development notes` with `Hold the ball` and save. The success sentence is visible. Reload the route and the note is still in the textarea. The player’s pace is unchanged.

Keep the squad-page tests from `P04-G01`. Update them so they no longer expect `This build does not edit players yet.`

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

Expected: each command exits 0. `pnpm test` includes `update-player.test.ts` and `player-profile.test.tsx`. The smoke spec still reaches Constitution.

## 9. Manual acceptance check

1. `pnpm dev`. Open the fictional demo, choose `Ashbridge`, and open Squad.
2. Select a player. The source sentence says `Source stays Fictional. This correction is recorded in activity.` Pace is a number or `Missing`, never a blank that pretends to be zero.
3. Clear Market value and save. The row’s value becomes `Unknown` after the list reloads. Source is still `Fictional`.
4. Enter `Hold the ball` as the development note and save. Reload the page, select the same player, and confirm the note is still there. The attribute numbers are unchanged.
5. Open Finance. The preview banner is still there.

## 10. Definition of done

- [ ] A correction cannot change `clubId` or `source` and cannot invent a birth date.
- [ ] Stale player and note writes return `CONFLICT` and write nothing.
- [ ] A second note updates the same plan id.
- [ ] Absent attributes render `Missing`. Stored `0` renders `0`.
- [ ] The profile has no shortlist or compare control, and it states that contracts are not recorded.
- [ ] `schemaV1` is unchanged. Tactics is unchanged.
- [ ] The §8 commands exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase4.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5 and `plans/phase4/guide2.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase4.md`, or the other phase 4 guides.

Suggested message:

```text
feat(p04-g02): add player details and notes
```

Do not commit when §8 is failing. Do not amend the `P04-G01` commit. After the commit succeeds, record its full SHA on the `P04-G02` row of `plans/phase4.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P04-G03` may read the managed club’s `name` and `colors` for a crest. It must not change `updatePlayer` or `saveDevelopmentNote`.

New behavior the next guide can rely on:

- `rejectCommand('NOT_FOUND' | 'CONFLICT', message)` aborts a transaction with that code.
- Player corrections and notes already bump `revision` and write audits.
- The selection region is `PlayerProfile`.

Known limitations this guide leaves on purpose:

- The editor replaces `positions` with one selected code.
- `role` on a lineup does not exist yet. Tactics is still not interactive.
- History is an in-memory filter of campaign audits. There is no new index.
