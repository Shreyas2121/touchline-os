# P03-G03 — Persistent campaign management

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §3.3 and §7.1.
- **Parent phase:** `plans/phase3.md`, guide **P03-G03**. Status, delete, reset, the import fence, and the welcome behavior are phase §5 “Campaign status, delete, and reset” and “Screens”. The work block is phase §6 `P03-G03`.
- **Predecessor guide:** `plans/phase3/guide2.md`.
- **Predecessor commit:** the commit whose subject is `feat(p03-g02): provision playable demo campaign`. Verify with `git log --grep="feat(p03-g02): provision playable demo campaign" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p03-g03): manage persistent campaigns`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase3.md` → this guide. This guide does not remove the command-center preview figures. That is `P03-G04`. It does not add the club chooser. That is `P03-G05`.

## 2. Goal and user-observable result

A person can save more than one campaign in this browser:

- **Create new campaign** asks for a campaign name, a club name, and a short name, then opens `/app/<id>/command-center`.
- Welcome lists active saves and, separately, archived saves.
- Rename, archive, restore, and delete are confirmed in the page. Delete stays disabled until the typed name matches. Reset stays disabled until the field is `Reset fictional demo`.
- **Try fictional demo** shows `Seeding fictional world. …` and then opens `/app/demo/command-center`. A second visit does not duplicate the world.
- An unknown `/app/<id>/command-center` shows `Campaign not found` and does not show `Preview`.
- The command center of a campaign that does exist still shows `Static preview — not save data` and `Preview`.

Import still has no file input. Squad, Tactics, and Constitution stay previews.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P03-G02 sha> HEAD` succeeds, using the SHA from §1.
- `src/data/commands/seed-demo.ts` exists. `src/app/providers/database.tsx` does not. If the provider already exists, stop and reconcile before editing.
- `schemaV1` stays byte-for-byte as in `src/data/migrations/v1.ts`. Do not add `version(2)`.
- Leave `MASTER_PLAN.md` and `plans/phase3.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase3.md` §5 from “Campaign status, delete, and reset” through “Screens”, assumption 11, and the `P03-G03` block in §6.
- `src/data/commands/create-campaign.ts` and `rename-campaign.ts` — input schemas and the `updateOptions` parse. `createCampaign` must start writing `status: 'active'`.
- `src/data/commands/seed-demo.ts` — the campaign object built in the structure batch. Add `status: 'active'` there in this commit.
- `src/test/fixtures/campaign.ts` and every other `campaignSchema.parse` call site. Search for `currency: 'EUR'`. Each campaign object needs `status`.
- `src/app/pages/WelcomePage.tsx`, `src/app/copy.ts`, `src/app/router.tsx`, `src/app/App.tsx`, `src/app/layout/WorkspaceLayout.tsx`, `src/components/ui/TopBar.tsx`, `src/test/render.tsx`, `src/test/welcome.test.tsx`.
- `eslint.config.js` — the block whose `files` array starts with `src/main.tsx`. Replace that fence as §6 describes. Leave the `src/domain/**` and `src/data/**` blocks in place.
- `e2e/smoke.spec.ts` — it currently clicks a link named `Try fictional demo` and expects `createPanel`.
- `src/data/db.ts` — `getDatabase`, `DATABASE_NAME`, `assertStorageAvailable`, `deleteDatabaseForTests`.
- `src/data/migrations/v1.ts` — the table names the delete command must clear. Read them. Do not edit the file.

`src/features/campaigns/` does not exist. Create it in this guide.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/validation/schemas.ts` | `Campaign.status`; audit actions `campaign.archive`, `campaign.restore`, `campaign.delete` |
| `src/data/commands/create-campaign.ts` | Store `status: 'active'` |
| `src/data/commands/seed-demo.ts` | Store `status: 'active'` |
| `src/data/commands/set-campaign-archived.ts` | Archive and restore |
| `src/data/commands/delete-campaign.ts` | Scoped delete |
| `src/data/commands/reset-demo.ts` | Delete `demo`, then seed with `reason: 'reset'` |
| `src/data/repositories/delete-campaign-rows.ts` | `deleteCampaignRows`, called only from the delete command |
| `src/app/providers/database.tsx` | The only UI module that imports `src/data/db.ts` |
| `src/app/App.tsx` | Wrap the router in `DatabaseProvider` |
| `src/app/copy.ts` | The strings in §6 |
| `src/features/campaigns/CampaignManager.tsx` | Welcome lists and confirmations |
| `src/app/pages/WelcomePage.tsx` | Host the manager |
| `src/app/layout/WorkspaceLayout.tsx` | Load the campaign; missing and loading states |
| `src/components/ui/TopBar.tsx` | Show the campaign name |
| `src/test/render.tsx` | Provider pointed at `touchline-os-test` |
| `eslint.config.js` | Narrow the shell fence |
| `README.md` | Replace the local-database paragraph |
| `src/test/campaign-management.test.ts` | Archive, delete, and reset isolation |
| `src/test/welcome-saves.test.tsx` | Empty name, import, archived demo |
| `e2e/smoke.spec.ts` | Button instead of the old demo link |

Update every existing campaign fixture and test object so `campaignSchema` still parses. Do not edit `CommandCenterPage.tsx`. Do not add `choose-club`.

### Public API

```ts
export function setCampaignArchived(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Campaign>>

export function deleteCampaign(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<{ id: EntityId }>>

export function resetDemoCampaign(
  database: TouchlineDatabase,
  input: unknown,
  onProgress: (progress: SeedProgress) => void,
): Promise<CommandResult<Campaign>>

export function DatabaseProvider({
  name,
  children,
}: {
  name?: string
  children: ReactNode
}): JSX.Element

export function useDatabase(): TouchlineDatabase
```

`DatabaseProvider` defaults `name` to `DATABASE_NAME` (`touchline-os`). Tests pass `touchline-os-test`.

`setCampaignArchived` input: `campaignId`, `expectedRevision`, `archived` boolean, `now`, `auditEventId`, `actionId`.

`deleteCampaign` input: `campaignId`, `expectedRevision`, `now`, `auditEventId`, `actionId`. The extra ids keep the input shape aligned with the other commands. This command does not insert an audit row. The same transaction deletes that campaign’s audits, so a `campaign.delete` row would not survive. The enum value exists so a stored copy of that action still parses. Do not write one.

`resetDemoCampaign` input: `campaignId`, `expectedRevision`, `now`, and the four seed audit ids from `P03-G02`. `reason` is not an input. The command always seeds with `reset`.

## 6. Implementation steps

1. Add `status: z.enum(['active', 'archived'])` to `campaignSchema` after `revision`. Do not give it a Zod default. A row without `status` must fail `parseStored`. Extend `actionType` with `campaign.archive`, `campaign.restore`, and `campaign.delete`. Keep `campaign.seed`.
2. Set `status: 'active'` in `createCampaign` and in the seed writer’s campaign object. Search for campaign object literals and add `status: 'active'` to each one that is an active save. Archived fixtures are not required in old tests.
3. `setCampaignArchived` reads the campaign before `runCommand`. A missing row returns `NOT_FOUND`. When `status` is already the requested value, return `{ ok: true, revision: current.revision, value: current }` and do not open a transaction. Otherwise use update mode. Inside the body, store the new `revision`, set `status` to `archived` or `active`, set `updatedAt`, and add one audit. Summary `Archived campaign ${name}` or `Restored campaign ${name}`. `actionType` is `campaign.archive` or `campaign.restore`. `seasonId` is `current.activeSeasonId`. Payload is the parsed input. If the row changed to the requested status between the pre-check and the transaction, skip the audit and still store the `revision` argument so the result matches the row.
4. `deleteCampaignRows(database, campaignId)` deletes `where('campaignId').equals(campaignId)` on `seasons`, `leagues`, `clubs`, `players`, `contracts`, `constitutions`, `ledgerEntries`, `transfers`, `offers`, `lineups`, `registrations`, `matchRecords`, `appearances`, `shortlistItems`, `scoutingReports`, `developmentPlans`, `auditEvents`, and `importReceipts`, then `campaigns.delete(campaignId)`. `deleteCampaign` calls that helper inside one `runCommand` whose table list is every one of those tables plus `campaigns`. A stale revision returns `CONFLICT` and the helper does not run. A missing campaign returns `NOT_FOUND`.
5. `resetDemoCampaign` returns `VALIDATION` with message `Only the fictional demo can be reset.` when `campaignId` is not `demo`. If `demo` exists, call `deleteCampaign` with the input’s `expectedRevision`. On `CONFLICT` or any other failure, return it and do not seed. If `demo` is already absent, skip delete. Then call `seedDemoCampaign` with `reason: 'reset'` and the featured seed and version.
6. Add `database.tsx`. On mount, call `assertStorageAvailable(globalThis.indexedDB)` and then `getDatabase(name)`. A `PersistenceError` with code `UNAVAILABLE` renders the paragraph `This browser cannot open a local database.` and does not render `children`. Until the instance exists, render `Loading campaign.` `useDatabase` throws `DatabaseProvider is missing.` when the context is empty. This file may import `../data/db`. It must not import `dexie` or `fake-indexeddb`.
7. Wrap `RouterProvider` in `App` with `DatabaseProvider` and no name argument. Change `renderAt` so it wraps the memory router in `DatabaseProvider name="touchline-os-test"`. Do not put a second provider inside `appRoutes`.
8. Replace the ESLint block that lists `src/main.tsx`, `src/app/**`, `src/features/**`, and `src/components/**`.
   - `src/main.tsx` and `src/components/**` keep the Phase 2 ban on `dexie`, `fake-indexeddb`, `src/data/**`, and `src/domain/**`.
   - `src/app/**` and `src/features/**`, with `src/app/providers/database.tsx` excluded, may import `src/domain/**`, `src/data/commands/**`, `src/data/repositories/**`, `src/data/clock.ts`, and `src/data/ids.ts`. They still reject `dexie`, `fake-indexeddb`, and any import path that ends in `data/db` or contains `data/migrations`.
   - A later block for `src/app/providers/database.tsx` only rejects `dexie` and `fake-indexeddb`.
   - The message text must not say “during Phase 2”.
9. Add these exact strings to `src/app/copy.ts`:
   - `loadingCampaign` = `Loading campaign.`
   - `databaseUnavailable` = `This browser cannot open a local database.`
   - `seedReady` = `Fictional world ready.`
   - `seedFailed` = `The demo could not be saved. Retry to continue this world.`
   - `seedVersionMismatch` = `This demo was built with a different world version. Reset the fictional demo to replace it. Other saves are kept.`
   - `staleSave` = `This save changed in another tab. Reload and try again.`
   - `archivedDemo` = `The fictional demo is archived.`
   - `resetPhrase` = `Reset fictional demo`
   - `resetHelp` = `Reset replaces the fictional demo. Other saves stay.`
   - `archiveHelp` = `Archive hides this save. You can restore it. This does not delete the save.`
   - `deleteHelp` = `Delete removes this save. This cannot be undone.`
   - `saveFailed` = `The campaign could not be saved. Try again.`
   - `seedProgress(stage, done, total)` returns `Seeding fictional world. ${stage} ${done} of ${total}.`
   Stop rendering `createPanel`. Delete the constant if nothing imports it.
10. `CampaignManager` loads `listCampaigns` when it mounts and after each successful command. Sort by `updatedAt` descending. Heading `Saved campaigns` lists `status === 'active'` as links to `/app/${id}/command-center` using the campaign name. Heading `Archived` lists the others and is omitted when empty. Each active row has buttons `Rename`, `Archive`, and `Delete`. Each archived row has `Restore`.
11. Create panel, opened by **Create new campaign**: labels `Campaign name`, `Club name`, and `Short name`, each tied to its input with `htmlFor`. **Save campaign** is disabled while a command runs or while any trimmed value is empty. It calls `createCampaign` with `kind: 'fictional'`, `seed: null`, `generatorVersion: null`, colors `#1F2933` and `#C4A35A`, prestige `50`, academy tier `3`, `scoutingRegion: null`, `systemClock()`, and new ids from `createEntityId()`. Success navigates to `/app/${id}/command-center`. Failure shows `saveFailed`.
12. **Try fictional demo** is a button, not a link. If `demo` is archived, show `archivedDemo` plus `Restore` and do not call the seed. Otherwise call `seedDemoCampaign` with the featured constants, `reason: 'create'`, and the stable audit ids from the `P03-G02` handoff. Show `seedProgress` from the callback. On success show `seedReady` and navigate to `/app/demo/command-center`. Message `Demo world version does not match.` shows `seedVersionMismatch`. `ABORTED` shows `seedFailed` and a `Retry` button that calls the same function. The try and retry controls are disabled while a seed is running. Do not start the seed from `useEffect`.
13. Rename panel: field `Campaign name` filled with the current name, button `Save name`. `CONFLICT` shows `staleSave` and does not send the same input again. Archive panel: `archiveHelp` and button `Archive campaign`. If the archived id is the campaign currently open, navigate to `/`. Delete panel: `deleteHelp`, field `Type the campaign name`, button `Delete campaign` disabled until the value equals `campaign.name` exactly. Reset panel: `resetHelp`, field `Type the confirmation phrase`, button `Reset demo` disabled until the value equals `Reset fictional demo`. Each panel is a `section` with `role="dialog"` and `aria-modal="false"`. Focus the first field on open. `Escape` closes the panel and writes nothing. `Cancel` does the same.
14. `WorkspaceLayout` reads `campaignId` from the route and `getCampaign`. Parse the param with `entityIdSchema.safeParse`; a failure is the missing state. While the read is in flight, render `loadingCampaign` and no banner and no `Outlet`. When the row is absent, render `MissingCampaignPage` and no preview banner. When the row exists, render `AppShell` with `previewBanner` still set, and pass the campaign name to `TopBar`. `TopBar` shows the name and the id. Search and backup panels stay.
15. Replace the README “Local database” paragraph with: `Campaigns are stored in an IndexedDB database named touchline-os on this device. Creating a campaign, opening the fictional demo, and renaming, archiving, or deleting a save all write to that database. Import, backup, and the other workspace sections are still previews.`
16. Update `e2e/smoke.spec.ts`. **Try fictional demo** is a button. The test timeout is 120 seconds. After the click, wait for `/app/demo/command-center`, then still expect `previewBanner` and four `previewValue` cells. Remove the assertion on `createPanel`. Keep the Squad, Tactics, Constitution, skip-link, `/app`, and `/nope` steps. Import still has no `input[type=file]`.

## 7. Tests to add/change

`src/test/campaign-management.test.ts`, database `touchline-os-test`, cleanup in `afterEach`:

- Archive then restore a campaign created with `createCampaign`. The archived row is not in the active filter. A second archive call does not add a second archive audit. A stale `expectedRevision` on delete returns `CONFLICT` and `getCampaign` still finds the row.
- Seed the demo, `createCampaign` a second save, `deleteCampaign` the second id. `listCampaigns` no longer contains it. `listPlayers` for the demo is still 3,000. `listClubs` for the deleted id is empty.
- `resetDemoCampaign` after that seed plus a Harbor campaign: `demo` again has 3,000 players and a `Reset fictional world` audit, and Harbor’s club is still there. `resetDemoCampaign` for `campaign-a` returns `Only the fictional demo can be reset.` and does not delete `campaign-a`.

`src/test/welcome-saves.test.tsx`:

- The create button is disabled when the campaign name is empty, and the page does not show `Campaign saved`.
- Import still shows `importPanel` and no file input.
- A `demo` campaign archived through `setCampaignArchived` makes **Try fictional demo** show `The fictional demo is archived.` The URL stays `/`.

Update `src/test/welcome.test.tsx` so it no longer expects `createPanel`. The disclaimer and the import control stay.

Do not assert command-center KPI text other than the existing preview copy. `P03-G04` changes those figures.

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
- `pnpm test` opens `touchline-os-test` for the new files. UI tests go through `renderAt`, which names that database.
- `pnpm test:e2e` runs `e2e/smoke.spec.ts` against the production preview. That smoke seeds the real demo once.

## 9. Manual acceptance check

1. `pnpm dev`, open `/`. The disclaimer is visible. **Import backup** shows the unavailable sentence and no file input.
2. **Create new campaign** with empty fields. **Save campaign** is disabled. Fill `Harbor`, `Harbor Athletic`, and `HAR`. The app opens `/app/<id>/command-center`. The banner still reads `Static preview — not save data`. The top bar shows `Harbor`.
3. Return to `/`. Harbor is listed under `Saved campaigns`. Rename it to `Harbor Town`. `CONFLICT` is not expected in a single tab.
4. Archive it. It leaves the active list and appears under `Archived`. Restore it.
5. **Try fictional demo**. Progress text includes `Seeding fictional world.` The app then opens `/app/demo/command-center` and the banner is still the preview banner. Reload `/` and start the demo again. It opens without a long second seed.
6. Open `/app/does-not-exist/command-center`. The heading is `Campaign not found`. `Preview` is not on the page.
7. In application storage, the database name is `touchline-os`.
8. Open Squad and Constitution on the demo. The preview banner and `Rules are not active in this build.` are still there.

Do not type the reset phrase in this pass unless delete and reset unit tests already passed. The browser reset is checked again in `P03-G05`.

## 10. Definition of done

- [ ] Create, rename, archive, restore, delete, and reset call the commands in §5. The welcome screen does not import `src/data/db.ts`.
- [ ] Delete with a stale revision returns `CONFLICT` and leaves both campaigns. Delete of one id leaves the other campaign’s players.
- [ ] Reset refuses every id except `demo` and, on success, writes `Reset fictional world` without removing the other campaign.
- [ ] An unknown campaign URL renders the missing state and not the preview KPIs. A known campaign’s command center still shows `Preview`.
- [ ] `schemaV1` and Dexie version 1 are unchanged. `status` is required on `campaignSchema` and is not defaulted at read time.
- [ ] ESLint rejects `dexie` in components and rejects `src/data/db.ts` everywhere except `src/app/providers/database.tsx`.
- [ ] README describes `touchline-os` and says the other workspace sections are still previews.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase3.md` have no edits in this commit.

## 11. Commit instructions

Stage the paths in §5, the fixture and test updates those schema changes require, and `plans/phase3/guide3.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase3.md`.

Suggested message:

```text
feat(p03-g03): manage persistent campaigns
```

Do not commit when §8 is failing. Do not amend the `P03-G02` commit. After the commit succeeds, record its full SHA on the `P03-G03` row of the progress log in `plans/phase3.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P03-G04` may read `useDatabase()`, `getCampaign`, `listPlayersByClub`, and `listAuditEvents`. The preview banner is still passed for every found campaign, including the command center. `P03-G04` removes it on the command center only.

`P03-G05` may call `setCampaignArchived`, `deleteCampaign`, and `resetDemoCampaign`. Club selection does not exist yet. `managedClubId` on a fresh demo is still `demo-club-01`.

Known limitations this guide leaves on purpose:

- Command-center numbers are still the word `Preview`.
- The demo does not ask the user to choose a club.
- Import, backup, search, tactics, finance, and constitution are unchanged.
- `campaign.delete` is a legal action type and this command does not leave a row with that type behind.
