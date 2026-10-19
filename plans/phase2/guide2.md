# P02-G02 — Versioned local database

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §2.1 and §8.
- **Parent phase:** `plans/phase2.md`, guide **P02-G02**. Database name, version, and indexes are phase §5 “Dexie version 1”. The work block is phase §6 `P02-G02`.
- **Predecessor guide:** `plans/phase2/guide1.md`.
- **Predecessor commit:** `0af78a8b90c2b88dd408975632838f0df5039109` (`feat(p02-g01): define canonical domain contracts`). Later docs commits may sit on top of it, including `b7e6ad15d83d4adb7bc680710b547b6ecb1569aa`. Do not reset them.
- **Commit subject:** `feat(p02-g02): add versioned local database`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase2.md` → this guide. This guide does not add repositories, a command runner, or a screen.

## 2. Goal and user-observable result

The clickable shell stays the Phase 1 preview. What this commit adds is a Dexie database the later repositories will open:

- Opening a database named `touchline-os-test` reports version `1` and the nineteen tables in §6.
- Closing it and opening the same name again still reports version `1`.
- `getDatabase` returns the same instance for a name until `deleteDatabaseForTests` drops that cache.
- A player row stored without `source` makes `parseStored` throw `PersistenceError` with code `CORRUPT`.
- `pnpm dev` still shows **Touchline OS** and `Static preview — not save data`. Browsing the app does not create a database named `touchline-os`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor 0af78a8b90c2b88dd408975632838f0df5039109 HEAD` succeeds.
- `src/data/` does not exist. If it does, stop and reconcile with this guide before editing.
- `package.json` depends on `zod`. It does not depend on `dexie` or `fake-indexeddb`. If either is already present, stop and reconcile.
- Do not type a package version by hand. `pnpm add dexie` and `pnpm add -D fake-indexeddb` write the lockfile. Commit that lockfile.
- Leave `MASTER_PLAN.md` and `plans/phase2.md` unchanged in this commit.
- Do not edit entity schemas, money parsers, or `src/domain/commands/result.ts`.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase2.md` §5 through “Assumptions recorded here”, especially “Dexie version 1” and the boundary bullets, and the `P02-G02` block in §6.
- `src/domain/validation/schemas.ts` — the entity schemas and their inferred types. Table properties use those types. Do not change field names.
- `src/main.tsx` — mounts `App` and does not import `src/data` or `src/domain`. Leave it unchanged.
- `src/test/setup.ts` — Vitest setup. It cleans up Testing Library and stubs `matchMedia`. Add one import. Do not call `getDatabase`.
- `src/test/welcome.test.tsx` — must still pass after `fake-indexeddb` is installed from the setup file.
- `eslint.config.js` — the domain block from `P02-G01` stays. New blocks go after it and before `eslintConfigPrettier`.
- `tsconfig.app.json` — `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, and `noUnusedParameters` are on. `include` is `src`. Imports in this repo do not use a `.ts` suffix.
- `vitest.config.ts` — `environment` is `jsdom`, `setupFiles` is `./src/test/setup.ts`. Do not edit it.
- `package.json` — scripts `lint`, `typecheck`, `test`, and `build` already exist.

`src/data/` does not exist. Do not import it from a feature, a component, or `src/main.tsx`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `package.json` | Production dependency `dexie`. Dev dependency `fake-indexeddb` |
| `pnpm-lock.yaml` | Lockfile pnpm writes |
| `eslint.config.js` | Data-layer React ban, and the shell ban on Dexie, `src/data`, and `src/domain` |
| `src/data/errors.ts` | `PersistenceError` |
| `src/data/migrations/v1.ts` | `schemaV1` |
| `src/data/db.ts` | `TouchlineDatabase`, `getDatabase`, `deleteDatabaseForTests`, `parseStored` |
| `src/test/setup.ts` | Import `fake-indexeddb/auto` only |
| `src/test/database.test.ts` | Version, cache, and corrupt-row cases |

Do not create `src/data/index.ts`, `src/data/clock.ts`, `src/data/ids.ts`, `src/data/repositories/`, `src/data/commands/`, or `src/data/transactions/`.

Do not add `vite-plugin-pwa`. Do not edit feature pages, `src/app/copy.ts`, `src/main.tsx`, `src/domain/**`, or `README.md`.

### Public API

`verbatimModuleSyntax` is on. A value and a type from the same module can share one import.

```ts
export const DATABASE_NAME = 'touchline-os'
export const DATABASE_VERSION = 1

export const persistenceErrorCodes = [
  'CORRUPT',
  'UNAVAILABLE',
  'SCOPE',
  'DUPLICATE',
] as const

export type PersistenceErrorCode = (typeof persistenceErrorCodes)[number]

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode
  constructor(code: PersistenceErrorCode, message: string)
}

export const schemaV1: {
  /* the nineteen index strings in §6 */
}

export class TouchlineDatabase extends Dexie {
  constructor(name: string)
}

export function getDatabase(name?: string): TouchlineDatabase
export function deleteDatabaseForTests(name: string): Promise<void>
export function parseStored<T>(schema: ZodType<T>, value: unknown): T
```

`getDatabase()` with no argument uses `DATABASE_NAME`. Tests never do that. They pass `'touchline-os-test'`.

`PersistenceError` does not use TypeScript parameter properties. `erasableSyntaxOnly` rejects `constructor(readonly code: ...)`. Assign `this.name = 'PersistenceError'` and `this.code = code` in the body.

Table properties on `TouchlineDatabase` are declared with the installed Dexie type `EntityTable<Entity, 'id'>` when that type is exported. If this major does not export `EntityTable`, use `Table<Entity, string>` from the same package. Do not use `any`. The entity type for each table is the `z.infer` type already exported from `src/domain/validation/schemas.ts`:

| Table property | Entity type |
| --- | --- |
| `campaigns` | `Campaign` |
| `seasons` | `Season` |
| `leagues` | `League` |
| `clubs` | `Club` |
| `players` | `Player` |
| `contracts` | `Contract` |
| `constitutions` | `Constitution` |
| `ledgerEntries` | `LedgerEntry` |
| `transfers` | `Transfer` |
| `offers` | `Offer` |
| `lineups` | `Lineup` |
| `registrations` | `Registration` |
| `matchRecords` | `MatchRecord` |
| `appearances` | `Appearance` |
| `shortlistItems` | `ShortlistItem` |
| `scoutingReports` | `ScoutingReport` |
| `developmentPlans` | `DevelopmentPlan` |
| `auditEvents` | `AuditEvent` |
| `importReceipts` | `ImportReceipt` |

## 6. Implementation steps

1. From the repo root, install Dexie as a production dependency and `fake-indexeddb` as a dev dependency: `pnpm add dexie` and `pnpm add -D fake-indexeddb`. Do not edit the versions pnpm resolved.
2. Add `src/data/errors.ts` with `persistenceErrorCodes`, `PersistenceErrorCode`, and `PersistenceError` exactly as in §5. Do not import Dexie, Zod, or React. `UNAVAILABLE`, `SCOPE`, and `DUPLICATE` are declared here so later guides can throw them. This guide does not add `assertStorageAvailable` or a repository. Nothing in this guide throws those three codes.
3. Add `src/data/migrations/v1.ts`. Export `schemaV1` and no other value. Above the object, add this comment and do not paraphrase it:

   ```ts
   // Frozen after P02-G02. A new index or table is a new Dexie version, not an edit of this object.
   ```

   The object is the index map below. The first token of every string is the primary key `id`. Do not use `++id`. Do not reorder tokens. `&` is Dexie’s unique-index marker. Bracketed `+` lists are Dexie compound indexes. `as const` is appropriate when it typechecks. If the installed Dexie `stores()` rejects a readonly object, give `stores()` a type that major accepts without changing any string.

   ```ts
   export const schemaV1 = {
     campaigns: 'id, kind, managedClubId, activeSeasonId, updatedAt',
     seasons: 'id, campaignId, &[campaignId+ordinal], [campaignId+status]',
     leagues: 'id, campaignId',
     clubs: 'id, campaignId, [campaignId+leagueId]',
     players:
       'id, campaignId, [campaignId+clubId], [campaignId+positionGroup], [campaignId+name]',
     contracts:
       'id, campaignId, [campaignId+playerId], [campaignId+clubId], [campaignId+status]',
     constitutions: 'id, campaignId, &[campaignId+version]',
     ledgerEntries:
       'id, campaignId, [campaignId+seasonId], [campaignId+clubId], sourceActionId, reversesEntryId',
     transfers:
       'id, campaignId, [campaignId+seasonId], [campaignId+playerId], sourceActionId',
     offers:
       'id, campaignId, [campaignId+seasonId], [campaignId+playerId], [campaignId+status]',
     lineups: 'id, campaignId, [campaignId+seasonId]',
     registrations:
       'id, campaignId, &[campaignId+seasonId+competitionKey+playerId], [campaignId+competitionKey]',
     matchRecords: 'id, campaignId, [campaignId+seasonId], [campaignId+date]',
     appearances:
       'id, campaignId, &[matchId+playerId], [campaignId+seasonId], [campaignId+playerId]',
     shortlistItems: 'id, campaignId, &[campaignId+playerId]',
     scoutingReports:
       'id, campaignId, [campaignId+playerId], [campaignId+seasonId]',
     developmentPlans: 'id, campaignId, &[campaignId+playerId+seasonId]',
     auditEvents: 'id, campaignId, &actionId, [campaignId+createdAt]',
     importReceipts: 'id, campaignId, importedAt',
   } as const
   ```

4. Add `src/data/db.ts`.
   - Export `DATABASE_NAME` and `DATABASE_VERSION` as in §5.
   - `TouchlineDatabase` extends Dexie. The constructor takes `name: string`, calls `super(name)`, then `this.version(DATABASE_VERSION).stores(schemaV1)`. It does not call `this.version` with any other number. Declare the nineteen table properties from §5.
   - Keep a module-private `Map<string, TouchlineDatabase>`. `getDatabase(name = DATABASE_NAME)` returns the cached instance for that name, or constructs one, caches it, and returns it. Two different names are two instances.
   - `deleteDatabaseForTests(name)` closes the cached instance when one exists, deletes that cache entry, then `await Dexie.delete(name)`. It still deletes the named database when the cache has no entry. It has no default argument, so a caller cannot wipe `touchline-os` by forgetting the name.
   - `parseStored` runs `schema.safeParse(value)`. On failure it throws `new PersistenceError('CORRUPT', 'Stored row does not match its schema.')`. On success it returns `parsed.data`. It does not substitute defaults and it does not strip keys itself. Zod already rejected or accepted the value.
5. In `src/test/setup.ts`, add `import 'fake-indexeddb/auto'` as the first import. Leave the Testing Library cleanup and the `matchMedia` stub. Do not import `src/data/db.ts`. Do not mention `getDatabase` or `touchline-os`.
6. Add the ESLint blocks in `eslint.config.js` after the existing `src/domain/**/*.ts` block and before `eslintConfigPrettier`.
   - **Data block.** `files`: `src/data/**/*.ts`.
     - `no-restricted-imports` paths: `react`, `react-dom`, `react-router`, and `fake-indexeddb`. Message: data modules stay free of React and the test IndexedDB polyfill.
     - Do not ban `dexie` or `src/domain` here. This layer imports both.
     - Turn `react-refresh/only-export-components` **off**. These modules export a class, schemas, and functions, not components.
   - **Shell block.** `files`: `src/main.tsx`, `src/app/**/*.{ts,tsx}`, `src/features/**/*.{ts,tsx}`, and `src/components/**/*.{ts,tsx}`.
     - `no-restricted-imports` paths: `dexie` and `fake-indexeddb`. Message: the shell cannot import Dexie, the data layer, or the domain during Phase 2.
     - `no-restricted-imports` patterns, so a relative import cannot reach `src/data` or `src/domain`. Include at least:
       - `./data`, `./data/**`, `./domain`, `./domain/**`
       - `../data`, `../data/**`, `../domain`, `../domain/**`
       - `../../data`, `../../data/**`, `../../domain`, `../../domain/**`
       - `../../../data`, `../../../data/**`, `../../../domain`, `../../../domain/**`
     - Same message as the path ban.
   - **Domain block, one added path.** On the existing domain `no-restricted-imports` paths, add `fake-indexeddb` with message: domain modules stay free of the test IndexedDB polyfill. Leave the Dexie, React, and relative-import bans from `P02-G01` as they are.
   - Do not add the `Date.now` / `new Date` / `Math.random` ban to `src/data/**` in this guide. `P02-G04` adds that ban when `src/data/clock.ts` and `src/data/ids.ts` exist, and it excludes those two files. The modules in this guide simply do not call them.
7. Add `src/test/database.test.ts` as specified in §7. Do not render a route. Do not open `touchline-os`.

## 7. Tests to add/change

Existing `src/test/welcome.test.tsx`, `routing.test.tsx`, `status-pill.test.tsx`, `shell-nav.test.tsx`, `money.test.ts`, `dates.test.ts`, and `schemas.test.ts` stay as they are and must still pass. Do not edit them.

`src/test/database.test.ts` uses `describe`, `it`, `expect`, `afterEach` from `vitest`. `afterEach` awaits `deleteDatabaseForTests('touchline-os-test')` so a failed test does not leave the name open. Direct `new TouchlineDatabase` instances are closed before that helper runs.

Constants under test:

- `DATABASE_NAME` is `'touchline-os'`.
- `DATABASE_VERSION` is `1`.
- The test database name is `'touchline-os-test'`, and it is not `DATABASE_NAME`.

### Version and tables

Construct `new TouchlineDatabase('touchline-os-test')`, `await database.open()`, and assert:

- `database.verno` is `1`.
- The sorted `database.tables` names equal the sorted keys of `schemaV1`.
- `schemaV1` deep-equals the nineteen strings in §6. Compare the object, not a rebuilt subset.

Then `database.close()`, construct a second `TouchlineDatabase` with the same name, open it, and assert `verno` is still `1`. Close the second instance.

### Cache

- `getDatabase('touchline-os-test')` twice returns the same instance (`toBe`).
- After `await deleteDatabaseForTests('touchline-os-test')`, the next `getDatabase('touchline-os-test')` is a different instance.
- Open that new instance and assert `verno` is `1`.
- `getDatabase('touchline-os-test')` and `getDatabase('touchline-os-other')` are different instances. `afterEach` must also delete `'touchline-os-other'`.

No call in this file passes `DATABASE_NAME` or `'touchline-os'` to `getDatabase` or `TouchlineDatabase`.

### Corrupt row

Build the player object below and delete `source` before insert. Store it with the table API: `database.players.add(row as Player)`. The `as Player` assertion exists only so the typed table accepts a row the schema rejects. Do not change `playerSchema`.

```ts
const row = {
  id: 'player-a',
  campaignId: 'campaign-a',
  clubId: 'club-a',
  name: 'Amina Cole',
  positionGroup: 'MID',
  positions: ['CM'],
  nationalityCode: null,
  birthDate: null,
  reportedAge: 18,
  ageReferenceSeasonOrdinal: 1,
  marketValueCents: null,
  attributes: { passing: 70 },
  potential: null,
  source: 'fictional',
  externalSourceId: null,
  isNewgen: false,
}
```

Read it back with `database.players.get('player-a')`. Pass that stored value to `parseStored(playerSchema, stored)`. The call throws. The thrown value is an instance of `PersistenceError` and its `code` is `'CORRUPT'`.

A successful control stays in this file: `parseStored(playerSchema, row)` on the object **before** `source` is removed returns a player whose `source` is `'fictional'` and whose `marketValueCents` is `null`.

### Failure cases that must keep failing

- `parseStored` that returns the raw row when `safeParse` fails does not throw `CORRUPT`.
- A class that calls `this.version(2)` does not keep `verno` at `1`.
- `getDatabase` that constructs a new instance on every call fails the `toBe` assertion.
- `deleteDatabaseForTests` that closes the database but leaves it in the map fails the “different instance” assertion.
- Do not delete or edit the Phase 1 UI tests to make `fake-indexeddb` pass. If they fail, the setup import is wrong.

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
- `pnpm test` runs the Phase 1 files plus `money.test.ts`, `dates.test.ts`, `schemas.test.ts`, and `database.test.ts`.
- `pnpm test` does not open a browser. IndexedDB in that run is the fake installed from `src/test/setup.ts`.
- `pnpm build` still typechecks, then produces the existing static shell.

`pnpm test:e2e` is not a gate for this guide. Do not skip the commit because it was not run. Run it only if you changed a file under `src/app`, `src/features`, `src/components`, or `e2e`. Those paths are not in §5, so a change there means the guide was exceeded; revert that change instead of adding an end-to-end run.

## 9. Manual acceptance check

1. `pnpm dev`, open `/`. The heading is `Touchline OS`. The disclaimer is still the Phase 1 sentence. **Create new campaign** still shows `Campaigns cannot be saved in this build.`
2. Open `/app/demo/command-center`. The banner reads `Static preview — not save data`. The four KPI values read `Preview`.
3. Open Constitution. It still says rules are not active. Squad still has no player rows.
4. In the browser application-storage panel, no database named `touchline-os` appears.

If step 1 or 2 fails, a data file was wired into the shell or copy changed. Revert that wiring. `src/test/setup.ts` is loaded by Vitest only. The dev server must not import `fake-indexeddb` or `getDatabase`.

## 10. Definition of done

- [ ] `dexie` is a production dependency. `fake-indexeddb` is a dev dependency. `vite-plugin-pwa` is not installed.
- [ ] `schemaV1` matches the nineteen index strings in §6, and `TouchlineDatabase` calls `version(1)` only.
- [ ] `getDatabase` caches by name. `deleteDatabaseForTests` closes, deletes, and drops that cache entry.
- [ ] `parseStored` throws `PersistenceError` code `CORRUPT` for a stored player that has no `source`.
- [ ] `src/test/setup.ts` imports `fake-indexeddb/auto` and does not call `getDatabase`.
- [ ] ESLint rejects React imports under `src/data/**/*.ts`, and rejects Dexie, `src/data`, and `src/domain` imports from `src/main.tsx`, `src/app/**`, `src/features/**`, and `src/components/**`.
- [ ] `react-refresh/only-export-components` does not fail the data files.
- [ ] The data-layer `Date.now` ban is not added in this guide. There is no `src/data/clock.ts` and no `src/data/ids.ts`.
- [ ] There is no repository module, no `runCommand`, no `assertStorageAvailable`, and no `src/data/index.ts`.
- [ ] `src/main.tsx`, feature pages, `src/app/copy.ts`, and `src/domain/**` are unchanged.
- [ ] Phase 1 tests and the `P02-G01` tests still pass.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase2.md` have no edits in this commit.

## 11. Commit instructions

Stage `package.json`, `pnpm-lock.yaml`, `eslint.config.js`, `src/data/**`, `src/test/setup.ts`, `src/test/database.test.ts`, and `plans/phase2/guide2.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase2.md`.

Suggested message:

```text
feat(p02-g02): add versioned local database
```

Do not commit when §8 is failing. Do not amend `0af78a8b90c2b88dd408975632838f0df5039109` or `b7e6ad15d83d4adb7bc680710b547b6ecb1569aa`. After the commit succeeds, record its full SHA on the `P02-G02` row of the progress log in `plans/phase2.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P02-G03` may import:

- `getDatabase`, `deleteDatabaseForTests`, `parseStored`, `DATABASE_NAME`, and `DATABASE_VERSION`
- `schemaV1` only to prove indexes. Repository code uses the `TouchlineDatabase` tables, not a second schema object
- `PersistenceError` and `persistenceErrorCodes`
- The entity schemas from `src/domain/validation/schemas.ts`

`P02-G03` adds campaign, season, league, club, and player repositories, plus `src/data/transactions/run-in-transaction.ts`. It must not edit `schemaV1` in place and must not change these schemas’ field names.

`P02-G04` adds the `Date.now` / `new Date` / `Math.random` ban for repository, command, and transaction files, excluding `src/data/clock.ts` and `src/data/ids.ts`.

`P02-G05` adds `assertStorageAvailable`. Do not add it here.

Known limitations this guide leaves on purpose:

- No repository reads or writes, and no `runCommand`.
- `UNAVAILABLE`, `SCOPE`, and `DUPLICATE` are names only. Nothing throws them yet.
- A corrupt row is detected by `parseStored` in a test. No screen reads IndexedDB.
- The shell still says a campaign cannot be saved, and a normal page load does not open `touchline-os`.
