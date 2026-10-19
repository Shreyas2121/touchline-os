# P02-G04 — Atomic command boundary

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §4.4.
- **Parent phase:** `plans/phase2.md`, guide **P02-G04**. Command results, revision checks, and audit text are phase §5 “Repository and command API”. The work block is phase §6 `P02-G04`.
- **Predecessor guide:** `plans/phase2/guide3.md`.
- **Predecessor commit:** `4c04741a774d7061899fa955f16cb14de62c33bf` (`feat(p02-g03): add isolated repository operations`). Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p02-g04): introduce atomic command boundary`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase2.md` → this guide. This guide does not add a screen, a constitution row, a ledger row, or a schema change.

## 2. Goal and user-observable result

The clickable shell stays the Phase 1 preview. What this commit adds is three commands that commit their rows together:

- `createCampaign` stores revision `1`, the managed club, season ordinal `1`, and one audit row. A second call with the same ids returns `DUPLICATE` and does not add another audit row.
- `renameCampaign` with the current revision stores the new name, one audit row, and `expectedRevision + 1`. The same call with a stale revision returns `CONFLICT` and leaves the name, revision, and audit count unchanged. An unknown campaign id returns `NOT_FOUND`.
- `addPlayer` stores the player, one audit row, and `expectedRevision + 1`. A Zod failure or a club from another campaign returns `VALIDATION` and does not store the player, write an audit row, or change revision.
- A `runCommand` body that inserts a player and then throws returns `ABORTED`. The player count, revision, and audit count stay as they were.

`pnpm dev` still shows **Touchline OS** and `Static preview — not save data`. Browsing the app does not create a database named `touchline-os`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor 4c04741a774d7061899fa955f16cb14de62c33bf HEAD` succeeds.
- `src/data/repositories/` and `src/data/transactions/run-in-transaction.ts` exist. `src/data/commands/` does not. If the command directory already exists, stop and reconcile before editing.
- Do not edit `schemaV1`, entity schemas, repository functions, `parseStored`, or `PersistenceError`.
- Leave `MASTER_PLAN.md` and `plans/phase2.md` unchanged in this commit. `plans/phase2.md` may already have uncommitted progress-log SHAs. Leave those unstaged.
- Do not add a package.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase2.md` §5 “Repository and command API” and the `P02-G04` block in §6. `assertStorageAvailable` and `src/test/persistence.test.ts` are `P02-G05`. Do not add them here.
- `src/domain/commands/result.ts` — `CommandResult` and `CommandFailureCode`. Do not edit it.
- `src/domain/validation/schemas.ts` — `campaignSchema`, `clubSchema`, `seasonSchema`, `playerSchema`, `auditEventSchema`, and `entityIdSchema`. `auditEventSchema.payload` accepts a plain JSON object. Do not put `undefined` in that object. Nested club colors and player attributes fit the existing depth limit.
- `src/data/transactions/run-in-transaction.ts` — `runInTransaction(database, tables, body)`. It does not catch errors. A throw aborts the Dexie transaction.
- `src/data/repositories/campaigns.ts` — `insertCampaign` and `updateCampaign`. `updateCampaign` stores the revision it is given and does nothing when the id is missing. The command checks the id before it calls `updateCampaign`.
- `src/data/repositories/clubs.ts`, `seasons.ts`, and `players.ts` — inserts throw `PersistenceError` `SCOPE` or `DUPLICATE`. They do not open a transaction.
- `src/data/errors.ts` — `PersistenceError`.
- `src/test/fixtures/campaign.ts` — ids `campaign-a`, `club-a`, `season-a`, and the `campaign-b` set. Timestamp `2026-10-19T00:00:00.000Z`.
- `eslint.config.js` — the domain block already bans `Date.now`, `new Date`, and `Math.random`. Copy those selectors. Do not remove the data-layer React ban.

`src/data/clock.ts` and `src/data/ids.ts` do not exist. Create them in this guide. Do not import `src/data` from a feature, a component, or `src/main.tsx`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/commands/revision.ts` | `nextRevision` |
| `src/data/clock.ts` | `systemClock` |
| `src/data/ids.ts` | `createEntityId` |
| `src/data/transactions/run-command.ts` | `runCommand` |
| `src/data/commands/create-campaign.ts` | `createCampaign` |
| `src/data/commands/rename-campaign.ts` | `renameCampaign` |
| `src/data/commands/add-player.ts` | `addPlayer` |
| `src/test/commands.test.ts` | Revision, rollback, conflict, and audit |
| `eslint.config.js` | Clock ban for repositories, commands, and transactions |

Do not create `src/data/index.ts`, an audit repository, or a command for any other action. Do not export an audit update or delete function.

Do not edit `src/main.tsx`, `src/app/**`, `src/features/**`, `src/components/**`, `src/domain/validation/**`, `src/domain/models/**`, `src/domain/commands/result.ts`, `src/data/db.ts`, `src/data/errors.ts`, `src/data/migrations/**`, `src/data/repositories/**`, `README.md`, or `src/test/setup.ts`.

### Public API

`verbatimModuleSyntax` is on. `erasableSyntaxOnly` is on. Do not add TypeScript enums or parameter properties.

```ts
export function nextRevision(current: number): number

export function systemClock(): TimestampUtc
export function createEntityId(): EntityId

export function runCommand<T>(
  database: TouchlineDatabase,
  tables: readonly Table[],
  options: RunCommandOptions,
  body: (revision: number) => Promise<T>,
): Promise<CommandResult<T>>

export function createCampaign(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Campaign>>

export function renameCampaign(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Campaign>>

export function addPlayer(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Player>>
```

`RunCommandOptions` is:

```ts
export type RunCommandOptions =
  | { kind: 'create' }
  | { kind: 'update'; campaignId: EntityId; expectedRevision: number }
```

`TimestampUtc` and `EntityId` are the branded types already exported from the domain. `Table` is the Dexie table type. `CommandResult` is the type already exported from `src/domain/commands/result.ts`.

Export each command’s Zod input schema and its inferred type: `createCampaignInputSchema`, `renameCampaignInputSchema`, and `addPlayerInputSchema`. The functions still accept `unknown` and parse inside the transaction.

Every command takes the `TouchlineDatabase` the caller already opened. Commands do not call `getDatabase`. That default opens the production name.

## 6. Implementation steps

1. Add `nextRevision` in `src/domain/commands/revision.ts`. It returns `current + 1`. It does not read a clock, a database, or `Math.random`.
2. Add `systemClock` in `src/data/clock.ts`. Call `new Date().toISOString()` and parse that string with `timestampUtcSchema`. `toISOString()` already ends in `.sssZ`. This file is the only data file that may call `new Date`.
3. Add `createEntityId` in `src/data/ids.ts`. Parse `crypto.randomUUID()` with `entityIdSchema`. This file is the only data file that may call `crypto.randomUUID()`. A UUID fits the existing id pattern.
4. Add the ESLint ban. Keep the current `src/data/**/*.ts` import block. Add a separate block whose `files` are only:
   - `src/data/repositories/**/*.ts`
   - `src/data/commands/**/*.ts`
   - `src/data/transactions/**/*.ts`

   `no-restricted-syntax` uses the three domain selectors for `Date.now`, `new Date`, and `Math.random`, plus a selector for `crypto.randomUUID()`. Message: `repositories, commands, and transactions take a clock and ids from their caller.` `src/data/clock.ts` and `src/data/ids.ts` are outside these globs. Do not add them to the ban.
5. Add `runCommand` in `src/data/transactions/run-command.ts`.
   - Call `runInTransaction` with the caller’s tables. Do not catch errors inside that callback. A catch inside the callback would commit the Dexie transaction.
   - `kind: 'create'` does not read a campaign. The revision passed to the body is `nextRevision(0)`, which is `1`.
   - `kind: 'update'` calls `getCampaign` inside the transaction. If the campaign is missing, throw a failure with code `NOT_FOUND` and message `Campaign not found.` If `campaign.revision !== expectedRevision`, throw a failure with code `CONFLICT` and message `Campaign revision is stale.` Otherwise pass `nextRevision(campaign.revision)` to the body. Do not call the body after either failure.
   - The transaction resolves to `{ revision, value }`, where `value` is the body result. The outer success result is `{ ok: true, revision, value }`.
   - Catch the rejection from `runInTransaction` outside the transaction. If the rejection is a Dexie `AbortError` and it has an `inner` error, map `inner`. Then:
     - The `NOT_FOUND` or `CONFLICT` failure thrown above returns that code and message.
     - A `ZodError` returns `VALIDATION` with message `Command input is not valid.`
     - `PersistenceError` `SCOPE` returns `VALIDATION` with that error’s message.
     - `PersistenceError` `DUPLICATE`, or `Dexie.ConstraintError`, returns `DUPLICATE` with message `A row with this id already exists.`
     - Anything else, including `PersistenceError` `CORRUPT` and a plain `Error`, returns `ABORTED` with message `Command did not finish.`
   - Use a normal class for the not-found and conflict failure. Do not use a parameter property. Do not export it.
6. Each command parses its input inside the `runCommand` body, before any insert, then writes only through the repository functions plus one `auditEvents.add`. Build entity objects with the exported entity schemas. Store the revision argument. Do not call `nextRevision` in a command file.
7. `createCampaign` uses `runCommand` with `kind: 'create'` and tables `clubs`, `seasons`, `campaigns`, and `auditEvents`, in that list. Input object, all required:
   - `campaignId`, `clubId`, `seasonId`, `auditEventId`, `actionId`
   - `name`, `kind` (`fictional` or `imported`)
   - `seed` and `generatorVersion`, each a string or `null`
   - `now`
   - `clubName`, `shortName`, `colors`, `prestige`, `academyTier`, `scoutingRegion`
   Reuse the matching fields from `campaignSchema` and `clubSchema` so the limits stay in one place. `now` is `timestampUtcSchema`. After parse, write these four rows and no others:
   - Club: `leagueId` is `null`. The other club fields come from the input. `id` is `clubId` and `campaignId` is `campaignId`.
   - Season: id `seasonId`, label `Season 1`, ordinal `1`, status `active`, `startDate` the first ten characters of `now`, `endDate` null, `openedAt` `now`, `closedAt` null.
   - Campaign: ids from the input, `currency` `EUR`, `createdAt` and `updatedAt` both `now`, `revision` the argument from `runCommand`. `seed` and `generatorVersion` are the parsed values, including `null`.
   - Audit: id `auditEventId`, `campaignId`, `seasonId` the new season id, `actionId`, `actionType` `campaign.create`, `createdAt` `now`, summary ``Created campaign ${name}``, `payload` the parsed input. Parse the audit row with `auditEventSchema` before `add`.
   Insert the club, then the season, then the campaign, then the audit row. Do not write a player, a constitution, or a ledger row. Return the campaign.
8. `renameCampaign` uses `kind: 'update'` and tables `campaigns` and `auditEvents`. Input: `campaignId`, `name`, `expectedRevision`, `now`, `auditEventId`, `actionId`. `expectedRevision` is a nonnegative integer. Re-read the campaign inside the body. Build the next campaign with the same fields, the new name, `updatedAt` set to `now`, and `revision` set to the argument. Call `updateCampaign`. Then add an audit row with `actionType` `campaign.rename`, `seasonId` null, and summary ``Renamed campaign to ${name}``. `payload` is the parsed input. Return the updated campaign.
9. `addPlayer` uses `kind: 'update'` and tables `players`, `clubs`, `campaigns`, and `auditEvents`. Input is `campaignId`, `expectedRevision`, `now`, `auditEventId`, `actionId`, and every `playerSchema` field except `id` and `campaignId`. The stored player id is `playerId` from the input. Reuse `playerSchema` fields so attributes, positions, and null money stay valid. Call `insertPlayer` with the campaign id. A cross-campaign `clubId` still throws `SCOPE` from the repository. Then re-read the campaign, set `updatedAt` to `now` and `revision` to the argument, and call `updateCampaign`. Then add an audit row with `actionType` `player.add`, `seasonId` null, and summary ``Added player ${name}``. Return the player.
10. Do not call `Date.now`, `new Date`, `Math.random`, or `crypto.randomUUID` from a repository, command, or transaction file. Tests pass the fixed timestamp and fixed ids. Tests do not call `systemClock` or `createEntityId`.
11. Add `src/test/commands.test.ts` as specified in §7. Use `getDatabase('touchline-os-test')`. `afterEach` awaits `deleteDatabaseForTests('touchline-os-test')`.

## 7. Tests to add/change

Existing Phase 1 tests and the Phase 2 test files stay as they are and must still pass. Do not edit them.

`src/test/commands.test.ts` imports `describe`, `it`, `expect`, and `afterEach` from `vitest`. Each case is its own `it`. Assert `result.ok` and, on failure, `result.code`. Do not assert failure message text.

Fixed clock value: `2026-10-19T00:00:00.000Z`. Do not call `systemClock()`.

Create input for campaign A uses ids `campaign-a`, `club-a`, `season-a`, `audit-a`, and `action-a`. Name `Riverside`, kind `fictional`, `seed` null, `generatorVersion` null. Club name `Riverside Athletic`, short name `RIV`, colors `#113355` and `#D4A017`, prestige `40`, academy tier `3`, `scoutingRegion` null.

Campaign B uses `campaign-b`, `club-b`, `season-b`, `audit-b`, `action-b`, name `Hilltown`, club name `Hilltown`, short name `HIL`, colors `#224466` and `#88AACC`, prestige `20`, academy tier `2`. Same kind, null seed, and null generator version unless a case says otherwise.

Player input uses id `player-a`, club `club-a`, name `Amina Cole`, group `MID`, positions `['CM']`, nationality null, birth date null, reported age `18`, age reference ordinal `1`, `marketValueCents` null, attributes `{ passing: 70 }`, potential null, source `fictional`, `externalSourceId` null, `isNewgen` false. Audit id `audit-player-a`. Action id `action-player-a`.

### Cases

- `nextRevision(0)` is `1`. `nextRevision(4)` is `5`.
- `createCampaign` for A returns `ok: true` and `revision` `1`. The stored campaign revision is `1`, `generatorVersion` is `null`, and `seed` is `null`. The club is `club-a` with `leagueId` null. The active season is ordinal `1` and status `active`. `auditEvents` has one row, `actionType` `campaign.create`, and summary `Created campaign Riverside`. Calling the same input again returns `DUPLICATE`. The audit count stays `1`, and there is still one club and one season.
- A create input for campaign B with `generatorVersion` `v1` and `seed` `alpha` stores those two strings and revision `1`.
- After creating A, `renameCampaign` with `expectedRevision` `1`, name `Riverside Athletic`, audit id `audit-rename-a`, and action id `action-rename-a` returns revision `2`. The stored name is `Riverside Athletic` and the stored revision is `2`. The new audit summary is `Renamed campaign to Riverside Athletic` and its `actionType` is `campaign.rename`. Calling that same input again, still with `expectedRevision` `1`, returns `CONFLICT`. The name, revision, and audit count stay at the successful values.
- `renameCampaign` for id `campaign-missing` returns `NOT_FOUND`. `listCampaigns` is empty and `auditEvents` is empty.
- After creating A, `addPlayer` with `expectedRevision` `1` returns revision `2`. `getPlayer` for campaign A returns that player and `marketValueCents` is `null`. The audit summary is `Added player Amina Cole` and its `actionType` is `player.add`. The stored campaign revision is `2`.
- After creating A, `addPlayer` with `positions: []` returns `VALIDATION`. `listPlayers` for A is empty, the campaign revision is still `1`, and the audit count is still `1`.
- Create A and B. `addPlayer` on A whose `clubId` is `club-b` returns `VALIDATION`. That player id is absent from the player table, A’s revision is unchanged, and the audit count is still the two create rows.
- After creating A, call `runCommand` directly with `kind: 'update'`, `expectedRevision` `1`, and tables `campaigns`, `players`, and `clubs`. The body inserts the valid player through `insertPlayer`, then throws `new Error('stop')`. The result is `ABORTED`. `listPlayers` for A is empty, the campaign revision is `1`, and the audit count is `1`. This body is not an exported command.

### Failure cases that must keep failing

- Catching the body error inside the Dexie callback commits the player without an audit row. The abort test forbids that. Map the error outside `runInTransaction`.
- `put` on a second create overwrites the campaign and can add a second audit row. The duplicate test forbids that.
- Bumping revision inside `updateCampaign` is not this guide. The command passes the next revision, and the repository stores that number.
- Treating a repository `SCOPE` error as `ABORTED` fails the cross-campaign club case. Map `SCOPE` to `VALIDATION`.
- Calling `systemClock()` in a test makes the stored timestamp depend on the machine clock. Pass `2026-10-19T00:00:00.000Z`.

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
- `pnpm test` runs the previous files plus `commands.test.ts`.
- `pnpm test` does not open a browser. The only IndexedDB name it opens for this guide’s new file is `touchline-os-test`.
- `pnpm build` still produces the static shell. The bundle does not need to include Dexie, because the shell does not import it.

`pnpm test:e2e` is not a gate for this guide. Do not run it unless a file under `src/app`, `src/features`, `src/components`, or `e2e` changed. Those paths are not in §5. Revert that change instead of adding an end-to-end run.

## 9. Manual acceptance check

1. `pnpm dev`, open `/`. The heading is `Touchline OS`. **Create new campaign** still shows `Campaigns cannot be saved in this build.`
2. Open `/app/demo/command-center`. The banner reads `Static preview — not save data`. The four KPI values read `Preview`.
3. Open Constitution. It still says rules are not active. Squad still has no player rows.
4. In the browser application-storage panel, no database named `touchline-os` appears.

If a page shows a saved club or a euro amount, a feature file imported the data layer. Revert that import.

## 10. Definition of done

- [ ] `createCampaign` commits the club, season ordinal `1`, campaign revision `1`, and one `campaign.create` audit row, or it leaves the database unchanged.
- [ ] A second create with the same ids returns `DUPLICATE` and does not add an audit row.
- [ ] `renameCampaign` stores `expectedRevision + 1` and `Renamed campaign to ${name}`. A stale revision returns `CONFLICT` without a write. A missing id returns `NOT_FOUND`.
- [ ] `addPlayer` stores the player and `Added player ${name}`. Zod failure and a cross-campaign club return `VALIDATION` without a player, an audit row, or a revision change.
- [ ] A body that writes a player and then throws returns `ABORTED`, and the player, revision, and audit count are unchanged.
- [ ] `nextRevision(current)` is `current + 1` and is called from `runCommand` only.
- [ ] Audit rows are append-only. There is no audit update or delete export.
- [ ] ESLint rejects `Date.now`, `new Date`, `Math.random`, and `crypto.randomUUID` in repositories, commands, and transactions. `clock.ts` and `ids.ts` are outside that ban.
- [ ] `schemaV1`, entity schemas, and repository modules are unchanged.
- [ ] `src/main.tsx`, feature pages, and `src/app/copy.ts` are unchanged.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase2.md` have no edits in this commit.

## 11. Commit instructions

Stage `src/domain/commands/revision.ts`, `src/data/clock.ts`, `src/data/ids.ts`, `src/data/transactions/run-command.ts`, `src/data/commands/**`, `src/test/commands.test.ts`, `eslint.config.js`, and `plans/phase2/guide4.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase2.md`.

Suggested message:

```text
feat(p02-g04): introduce atomic command boundary
```

Do not commit when §8 is failing. Do not amend `4c04741a774d7061899fa955f16cb14de62c33bf`. After the commit succeeds, record its full SHA on the `P02-G04` row of the progress log in `plans/phase2.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P02-G05` may call `createCampaign`, `renameCampaign`, `addPlayer`, and `runCommand`. Its scenario uses two campaigns, a stale rename, an aborted player insert, a cross-campaign club mapped from `SCOPE` to `VALIDATION`, and a repeated player id mapped to `DUPLICATE`.

`P02-G05` adds `assertStorageAvailable` to `src/data/db.ts` and `src/test/persistence.test.ts`. It does not belong in this commit.

Known limitations this guide leaves on purpose:

- The shell still cannot save a campaign, and a normal page load does not open `touchline-os`.
- No constitution, ledger, contract, or transfer command exists.
- There is no delete. A missing campaign is `NOT_FOUND` from `renameCampaign` and `addPlayer`, not from `updateCampaign`.
- `systemClock` and `createEntityId` are unused by tests. Phase 3 calls them at the UI edge and passes the results into the command input.
