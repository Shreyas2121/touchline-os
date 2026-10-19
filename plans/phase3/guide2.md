# P03-G02 — Playable demo campaign

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §6.1 and §4.4.
- **Parent phase:** `plans/phase3.md`, guide **P03-G02**. Batching, completion, and the audit payload are phase §5 “Seed command”. The work block is phase §6 `P03-G02`.
- **Predecessor guide:** `plans/phase3/guide1.md`.
- **Predecessor commit:** the commit whose subject is `feat(p03-g01): generate deterministic fictional world`. Verify with `git log --grep="feat(p03-g01): generate deterministic fictional world" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p03-g02): provision playable demo campaign`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase3.md` → this guide. This guide does not add a screen, a delete command, or a Dexie version.

## 2. Goal and user-observable result

The clickable shell stays the Phase 1 preview. What this commit adds is a command tests can call:

- `seedDemoCampaign` writes 4 leagues, 72 clubs, 3,000 players, one season, the `demo` campaign, a create audit, and one `campaign.seed` audit.
- A second call writes nothing and returns the same revision.
- A throw inside the first player batch returns `ABORTED`, leaves the clubs in place, and a later call finishes at 3,000 players without a second club 01.
- An existing `demo` row with generator version `0` returns `VALIDATION` and is not rewritten.
- Progress reports a `players` event with `done > 0` and a final `ready` event of 3000/3000.

`pnpm dev` still shows `Campaigns cannot be saved in this build.` A page load still does not create `touchline-os`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P03-G01 sha> HEAD` succeeds, using the SHA from §1.
- `src/domain/seed/generate-world.ts` exists. `src/data/commands/seed-demo.ts` does not. If the command file already exists, stop and reconcile before editing.
- Do not edit `schemaV1`, `generateWorld`, or the draw order.
- Do not add `status` to `campaignSchema`. That field is `P03-G03`.
- Leave `MASTER_PLAN.md` and `plans/phase3.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase3.md` §5 “Seed command” and the `P03-G02` block in §6.
- `src/domain/seed/generate-world.ts` — `generateWorld` and `GeneratedPlayer.weeklyWageCents`.
- `src/data/transactions/run-command.ts` — `runCommand` does not persist `revision` by itself. The body must `updateCampaign` with the `revision` argument, or the next batch’s `expectedRevision` will not match the stored row.
- `src/data/commands/create-campaign.ts` — the pattern for parsing, inserting, and writing one audit inside the body. Do not call `createCampaign` from the seed. It would add a 73rd club.
- `src/data/repositories/leagues.ts`, `clubs.ts`, `seasons.ts`, `campaigns.ts`, `players.ts` — `insertLeague`, `insertClub`, `insertSeason`, `insertCampaign`, `insertPlayer`, `getCampaign`, `updateCampaign`. Inserts use `add`. A repeated id throws `DUPLICATE` and aborts the transaction, so the seed must `get` an id and skip it instead of catching that error.
- `src/domain/validation/schemas.ts` — `auditEventSchema.actionType` is `'campaign.create' | 'campaign.rename' | 'player.add'`.
- `src/test/commands.test.ts` — clock `2026-10-19T00:00:00.000Z`, database name `touchline-os-test`, cleanup with `deleteDatabaseForTests`.
- `src/test/setup.ts` — already imports `fake-indexeddb/auto`. Do not edit it.

`src/features/` still cannot import `src/data`. Do not change that fence in this guide.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/data/commands/seed-demo.ts` | `seedDemoCampaign` |
| `src/data/repositories/audit-events.ts` | `listAuditEvents` |
| `src/domain/validation/schemas.ts` | Allow `campaign.seed` on `actionType` |
| `src/test/schemas.test.ts` | One audit fixture may use `campaign.seed` |
| `src/test/seed-demo.test.ts` | Completion, resume, mismatch, and progress |

Do not edit `src/app/**`, `src/features/**`, `src/components/**`, `e2e/**`, `README.md`, or `src/data/migrations/v1.ts`.

### Public API

```ts
export type SeedProgress = {
  stage: 'leagues' | 'clubs' | 'players' | 'ready'
  done: number
  total: number
}

export function seedDemoCampaign(
  database: TouchlineDatabase,
  input: unknown,
  onProgress: (progress: SeedProgress) => void,
): Promise<CommandResult<Campaign>>
```

Input, strict Zod object:

| Field | Rule |
| --- | --- |
| `campaignId` | entity id |
| `seed` | string, 1–120 |
| `generatorVersion` | string, 1–40 |
| `now` | timestamp |
| `reason` | `'create'` or `'reset'` |
| `createAuditEventId` | entity id |
| `createActionId` | entity id |
| `seedAuditEventId` | entity id |
| `seedActionId` | entity id |

There is no `expectedRevision` on this input. The orchestrator reads the stored revision before each batch.

## 6. Implementation steps

1. Add `'campaign.seed'` to the `actionType` enum. Leave the existing three values in place. Do not add archive, delete, or select-club values.
2. Add `listAuditEvents(database, campaignId)`. Query `where('[campaignId+createdAt]')` with `between([campaignId, Dexie.minKey], [campaignId, Dexie.maxKey])`. Parse every row. Sort by `createdAt` descending, then by `id` descending. Return the full list. Do not slice to 20 here.
3. `seedDemoCampaign` parses the input first. A Zod failure returns `{ ok: false, code: 'VALIDATION', message: 'Command input is not valid.' }` without a write.
4. If `campaignId` is not `demo`, or `seed` is not `touchline-demo-v1`, or `generatorVersion` is not `1`, return `VALIDATION` with message `Only the fictional demo can be seeded.` and write nothing.
5. Call `generateWorld`. If it returns `ok: false`, return `VALIDATION` with message `Unsupported generator version.` This path is defensive: step 4 already rejects other versions.
6. Read the `demo` campaign, its leagues, clubs, players, and audits.
   - If the campaign exists and `seed` or `generatorVersion` differs from the featured constants, return `VALIDATION` with message `Demo world version does not match.` Do not delete or insert.
   - If the campaign exists, the seed and version match, league count is 4, club count is 72, player count is 3,000, and some audit has `actionType` `campaign.seed`, call `onProgress({ stage: 'ready', done: 3000, total: 3000 })` and return `{ ok: true, revision: campaign.revision, value: campaign }` without `runCommand`.
7. Structure batch, only when the campaign is missing or any league or club id from the world is missing.
   - Before the transaction, if league count is under 4, call `onProgress({ stage: 'leagues', done: leagueCount, total: 4 })`.
   - If club count is under 72, call `onProgress({ stage: 'clubs', done: clubCount, total: 72 })`.
   - Those two calls sit outside the transaction. A throw there is not the resume test.
   - Inside `runCommand`, insert each missing league, then each missing club, then the season when its id is missing, then the campaign when it is missing, then the create audit when no `campaign.create` audit exists. Skip ids that `get` already finds. Do not call `add` for an existing id.
   - Season id is `demo-season-1`, label `Season 1`, ordinal `1`, status `active`, `startDate` is `now.slice(0, 10)`, `endDate` null, `openedAt` is `now`, `closedAt` null.
   - Campaign name is `Fictional demo`, kind `fictional`, seed and generator version are the featured constants, `managedClubId` is `demo-club-01`, `activeSeasonId` is `demo-season-1`, currency `EUR`, both timestamps are `now`, and `revision` is the argument `runCommand` passes. Do not set a `status` field.
   - Create audit summary is exactly `Created campaign Fictional demo`. `actionType` is `campaign.create`. `seasonId` is `demo-season-1`. Payload is the parsed command input.
   - Use `kind: 'create'` only when the campaign row is absent. Otherwise use `kind: 'update'` with the stored revision. The body always `updateCampaign`s the new revision when the row already existed, and `insertCampaign`s it when it did not.
   - If this batch inserts nothing because every row exists, do not call `runCommand`.
8. Player batches of 250, in id order, twelve batches for 3,000 players.
   - Outside the transaction, collect drafts in the slice whose ids are absent.
   - If the slice has no missing ids, do not call `runCommand` and do not bump revision.
   - Inside the body, call `onProgress({ stage: 'players', done: storedCountBeforeThisBatch, total: 3000 })` before any insert. Then `get` each id again and `insertPlayer` only when it is absent.
   - Strip `weeklyWageCents` before `playerSchema.parse`.
   - `updateCampaign` with the new `revision` and `updatedAt: now`. Leave `managedClubId` as stored.
   - Tables are `players` and `campaigns`.
9. After the player count is 3,000, if no `campaign.seed` audit exists, one update batch writes it. Summary is `Seeded fictional world` when `reason` is `create`, and `Reset fictional world` when `reason` is `reset`. Payload is exactly `{ seed, generatorVersion, leagueCount: 4, clubCount: 72, playerCount: 3000, reason }`. Then call `onProgress` with `ready` / 3000 / 3000.
10. On `CONFLICT` or `ABORTED` from any batch, return that result immediately. Do not retry. Do not start the next batch.
11. `onProgress` throwing inside a player batch is the abort mechanism. `runCommand` maps that throw to `ABORTED`. Earlier batches stay committed. Do not catch the throw inside the body.

`insertClub` requires the league row in the same campaign. Insert leagues before clubs in the same transaction. `insertPlayer` requires the club row when `clubId` is set. The structure batch commits before the first player batch.

Do not call `addPlayer`. Do not call `database.players.put`. Do not put player names in the audit payload.

## 7. Tests to add/change

Create `src/test/seed-demo.test.ts`. Use `touchline-os-test`, clock `2026-10-19T00:00:00.000Z`, and `deleteDatabaseForTests` in `afterEach`. Audit ids: `demo-audit-create`, `demo-action-create`, `demo-audit-seed`, `demo-action-seed`.

- A finished seed has 4 leagues, 72 clubs, 3,000 players, one `campaign.create` audit, and one `campaign.seed` audit whose summary is `Seeded fictional world`. A stored player has no `weeklyWageCents` key. A second call returns `ok: true`, the same `revision`, player count 3,000, and still one seed audit. Progress includes `{ stage: 'ready', done: 3000, total: 3000 }`.
- `onProgress` throws `new Error('stop')` when `stage === 'players'`. The result is `ABORTED`. League count is 4. Club count is 72. Player count is 0. A later call whose progress callback does not throw reaches 3,000 players, and `demo-club-01` is still one row.
- `createCampaign` a `demo` campaign with `generatorVersion: '0'` and any seed, then call `seedDemoCampaign`. The result is `VALIDATION` and message `Demo world version does not match.` League count stays 0. The campaign revision stays 1.
- `seedDemoCampaign` with `campaignId: 'campaign-a'` returns `VALIDATION` and message `Only the fictional demo can be seeded.`
- Progress from the successful full seed includes a `players` event whose `done` is greater than 0.
- Build a second campaign with the existing fixture ids and assert `listPlayers(database, 'campaign-b')` is empty after the demo seed.

Update `src/test/schemas.test.ts` so one valid audit uses `actionType: 'campaign.seed'`. Keep a case that still accepts `campaign.create`. An unknown action type still fails.

Do not edit `persistence.test.ts` or the shell tests.

## 8. Verification commands

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- Each command exits 0.
- `pnpm test` includes the previous files plus `seed-demo.test.ts`.
- The new file opens `touchline-os-test` only.

`pnpm test:e2e` is not a gate for this guide. The shell paths are not in §5. Revert a shell edit instead of adding an end-to-end run.

## 9. Manual acceptance check

1. `pnpm dev`, open `/`. **Create new campaign** still shows `Campaigns cannot be saved in this build.`
2. Open `/app/demo/command-center`. The banner reads `Static preview — not save data`. The KPI values read `Preview`.
3. In the browser application-storage panel, no database named `touchline-os` appears after those visits.

The seed is proven by `src/test/seed-demo.test.ts`. There is no demo button that writes yet.

## 10. Definition of done

- [ ] The featured seed writes 4 leagues, 72 clubs, and 3,000 players, then a second call does not add rows or a second `campaign.seed` audit.
- [ ] A throw on the first `players` progress event returns `ABORTED`, keeps the 72 clubs, and a later call completes without duplicating `demo-club-01`.
- [ ] Generator version `0` on an existing `demo` row returns `Demo world version does not match.` and does not insert leagues.
- [ ] A campaign id other than `demo` returns `Only the fictional demo can be seeded.`
- [ ] Stored players have no `weeklyWageCents`. The seed audit payload does not list player names.
- [ ] Inserts go through `insertLeague`, `insertClub`, `insertSeason`, `insertCampaign`, and `insertPlayer` inside `runCommand`. `addPlayer` and `put` are not on this path.
- [ ] `schemaV1` is unchanged. `campaignSchema` has no `status` field yet.
- [ ] The shell and the ESLint import fence are unchanged.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase3.md` have no edits in this commit.

## 11. Commit instructions

Stage `src/data/commands/seed-demo.ts`, `src/data/repositories/audit-events.ts`, `src/domain/validation/schemas.ts`, `src/test/schemas.test.ts`, `src/test/seed-demo.test.ts`, and `plans/phase3/guide2.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase3.md`.

Suggested message:

```text
feat(p03-g02): provision playable demo campaign
```

Do not commit when §8 is failing. Do not amend the `P03-G01` commit. After the commit succeeds, record its full SHA on the `P03-G02` row of the progress log in `plans/phase3.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P03-G03` may call `seedDemoCampaign` and `listAuditEvents`. Stable audit ids for the demo are `demo-audit-create`, `demo-action-create`, `demo-audit-seed`, and `demo-action-seed`. Pass those from the UI so a retry does not invent a second create audit.

`P03-G03` adds `status` to `campaignSchema` and must update the campaign object inside `seed-demo.ts` to store `active`. Until that commit, the seed writer must not set `status`.

Known limitations this guide leaves on purpose:

- No welcome control calls the seed. The command center still shows `Preview`.
- `managedClubId` is `demo-club-01` with no `campaign.select-club` audit.
- There is no archive, delete, or reset command. `reason: 'reset'` only changes the seed audit summary.
- A partial world is resumed, not deleted.
