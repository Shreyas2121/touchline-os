# P02-G01 — Canonical domain contracts

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §4.1–§4.3, §5.2, and §5.3.
- **Parent phase:** `plans/phase2.md`, guide **P02-G01**. Entity shapes, money, dates, and the out-of-scope list are phase §4 and §5. The work block is phase §6 `P02-G01`.
- **Predecessor guide:** none in Phase 2. Phase 1 is complete.
- **Predecessor commit:** `bbdabe871502ac71d044196aa4ce82396c9fbc81` (`docs: record phase 1 guide commits`).
- **Commit subject:** `feat(p02-g01): define canonical domain contracts`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase2.md` → this guide. This guide does not add Dexie, a database, a command runner, or a screen.

## 2. Goal and user-observable result

The clickable shell stays the Phase 1 preview. What this commit adds is a pure TypeScript domain the later database will store:

- Parsing `10.50` yields `1050` integer cents. Empty text and `null` do not become zero. Formatting `null` yields the word `Unknown`.
- A date, an age, and an estimated age are computed from the arguments the caller passes.
- Every master-plan entity has a strict Zod schema. Unknown keys fail. Nullable money stays `null`.
- `CommandResult` exists as a type. Nothing opens IndexedDB, and nothing evaluates a constitution rule.

`pnpm test` covers the parsers and the schemas. `pnpm dev` still shows **Touchline OS** and `Static preview — not save data`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor bbdabe871502ac71d044196aa4ce82396c9fbc81 HEAD` succeeds.
- `src/domain/` does not exist. If it does, stop and reconcile with this guide before editing.
- `package.json` has no `zod` or `dexie` dependency. If either is already present, stop and reconcile.
- Do not type a package version by hand. `pnpm add zod` writes the lockfile. Commit that lockfile.
- Leave `MASTER_PLAN.md` and `plans/phase2.md` unchanged in this commit.
- `plans/phase2.md` must be readable on disk. If it is still untracked, leave it untracked for this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase2.md` §4, §5 through “Assumptions recorded here”, and the `P02-G01` block in §6.
- `MASTER_PLAN.md` §4.2 entity table and §5.2 rule ids. Where this guide names a field, it is fixing that table for storage. Do not add a field the phase plan does not list.
- `tsconfig.app.json` — `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, and `noUnusedParameters` are on. `include` is `src`. Imports in this repo do **not** use a `.ts` suffix (`src/features/dashboard/CommandCenterPage.tsx` imports `../../app/copy`). Match that style.
- `eslint.config.js` — flat config from `eslint/config` `defineConfig`. The TypeScript block covers `**/*.{ts,tsx}` and includes `react-refresh`.
- `src/test/welcome.test.tsx` — Vitest style to copy: `describe`, `it`, `expect` from `vitest`. Domain tests do not render React.
- `src/test/setup.ts` — do not edit it. Do not import `fake-indexeddb` here.
- `src/main.tsx` and `src/app/copy.ts` — read-only confirmation that the shell has no domain imports. Do not edit them.
- `package.json` — `zod` is not listed. Scripts `lint`, `typecheck`, `test`, and `build` already exist.

`src/data/` does not exist. Do not create it.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `package.json` | Add runtime dependency `zod` only |
| `pnpm-lock.yaml` | Lockfile pnpm writes |
| `eslint.config.js` | Domain import fence and the domain clock ban |
| `src/domain/validation/limits.ts` | Shared numeric bounds |
| `src/domain/validation/result.ts` | `ParseResult<T>` |
| `src/domain/models/money.ts` | Cents brand, parse, and format |
| `src/domain/models/dates.ts` | Date-only, UTC timestamp, age |
| `src/domain/models/positions.ts` | Position lists and `positionGroupFor` |
| `src/domain/validation/schemas.ts` | One strict schema per entity, plus rule schemas |
| `src/domain/commands/result.ts` | `CommandResult` and failure codes. No runner |
| `src/test/money.test.ts` | Parser and formatter cases |
| `src/test/dates.test.ts` | Calendar, timestamp, and age cases |
| `src/test/schemas.test.ts` | One valid object per entity, plus the negative cases in §7 |

Do not create `src/domain/index.ts`. Callers import the module that defines the symbol.

Do not add Dexie, `fake-indexeddb`, React Router, or a test setup change. Do not edit feature pages, `src/app/copy.ts`, `src/main.tsx`, or `README.md`.

### Public API

`verbatimModuleSyntax` is on. Exporting a type and importing it elsewhere uses `import { type MoneyCents }` or `import type`. A value and a type from the same module can share one import: `import { moneyCentsSchema, type MoneyCents } from '../models/money'`.

```ts
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string }

export function parseMoneyCents(input: string): ParseResult<MoneyCents>
export function formatMoneyEuros(cents: MoneyCents): string
export function formatMoneyUnknown(cents: MoneyCents | null): string

export function parseDateOnly(input: string): ParseResult<DateOnly>
export function parseTimestampUtc(input: string): ParseResult<TimestampUtc>
export function ageInWholeYears(birthDate: DateOnly, asOf: DateOnly): number
export function estimateAge(
  reportedAge: number,
  referenceSeasonOrdinal: number,
  seasonOrdinal: number,
): number

export function positionGroupFor(position: Position): PositionGroup
```

`MoneyCents`, `DateOnly`, `TimestampUtc`, and `EntityId` are Zod brands (`z.infer` of the schema), not TypeScript `enum`s and not `as` casts at the boundary. A plain `number` or `string` must not be assignable to the brand without `safeParse` / `parse`.

```ts
export const commandFailureCodes = [
  'VALIDATION',
  'CONFLICT',
  'NOT_FOUND',
  'DUPLICATE',
  'ABORTED',
] as const

export type CommandFailureCode = (typeof commandFailureCodes)[number]

export type CommandResult<T> =
  | { ok: true; revision: number; value: T }
  | { ok: false; code: CommandFailureCode; message: string }
```

Schema exports from `src/domain/validation/schemas.ts`, each a strict object schema plus its inferred type:

`entityIdSchema`, `campaignSchema`, `seasonSchema`, `leagueSchema`, `clubSchema`, `playerSchema`, `contractSchema`, `constitutionRuleSchema`, `constitutionSchema`, `ledgerEntrySchema`, `transferSchema`, `offerSchema`, `lineupSchema`, `registrationSchema`, `matchRecordSchema`, `appearanceSchema`, `shortlistItemSchema`, `scoutingReportSchema`, `developmentPlanSchema`, `auditEventSchema`, `importReceiptSchema`.

Types use the entity names `EntityId`, `Campaign`, `Season`, `League`, `Club`, `Player`, `Contract`, `ConstitutionRule`, `Constitution`, `LedgerEntry`, `Transfer`, `Offer`, `Lineup`, `Registration`, `MatchRecord`, `Appearance`, `ShortlistItem`, `ScoutingReport`, `DevelopmentPlan`, `AuditEvent`, and `ImportReceipt`.

`moneyCentsSchema` lives in `money.ts`. `dateOnlySchema` and `timestampUtcSchema` live in `dates.ts`. Entity schemas reuse them. Do not declare a second cents or date parser inside `schemas.ts`.

## 6. Implementation steps

1. From the repo root, install Zod as a production dependency: `pnpm add zod`. Do not add `dexie` or `fake-indexeddb`. Do not edit the version pnpm resolved.
2. Add the domain ESLint block in `eslint.config.js`, after the existing `**/*.{ts,tsx}` block and before `eslintConfigPrettier`. Scope it to `src/domain/**/*.ts`.
   - `no-restricted-imports` paths: `react`, `react-dom`, `react-router`, and `dexie`. Message: domain modules stay free of React and Dexie.
   - `no-restricted-imports` patterns, so a relative import cannot reach the shell or the future data layer. Include at least `../../app/**`, `../../features/**`, `../../components/**`, and `../../data/**`, plus the same four prefixes with `../` instead of `../../`. Message: domain modules cannot import the app shell, features, components, or the data layer.
   - `no-restricted-syntax` selectors:
     - `CallExpression[callee.object.name='Date'][callee.property.name='now']`
     - `NewExpression[callee.name='Date']`
     - `CallExpression[callee.object.name='Math'][callee.property.name='random']`
     - Message for each: domain code takes explicit inputs and does not call `Date.now`, `new Date`, or `Math.random`.
   - Turn `react-refresh/only-export-components` **off** for this block. These modules export functions and schemas, not components. Leaving the rule on makes the file fail lint for a reason that does not apply.
3. Add `src/domain/validation/limits.ts` with this object and no other exports:

```ts
export const limits = {
  idMax: 64,
  nameMax: 120,
  shortNameMax: 16,
  seasonLabelMax: 40,
  noteMax: 4000,
  slotMax: 40,
  roleMax: 40,
  competitionKeyMax: 40,
  archetypeMax: 80,
  regionMax: 80,
  sourceIdMax: 200,
  seedMax: 120,
  generatorVersionMax: 40,
  mappingVersionMax: 40,
  payloadJsonMax: 20_000,
  warningCountMax: 100,
  rowCountKeysMax: 20,
  minutesMax: 200,
  goalsMax: 99,
  xgMilliMax: 20_000,
  ageMax: 99,
  yearMin: 1900,
  yearMax: 2199,
  moneyWholeDigitsMax: 13,
  priorityMin: 1,
  priorityMax: 5,
  startersMax: 11,
  benchMax: 12,
  positionsMin: 1,
  positionsMax: 5,
  prestigeMax: 100,
  academyTierMin: 1,
  academyTierMax: 5,
  signingAgeMin: 15,
  signingAgeMax: 50,
  ratingMax: 100,
  attributeMax: 100,
} as const
```

`moneyWholeDigitsMax` keeps cent math inside `Number.MAX_SAFE_INTEGER`. Thirteen euro digits times 100 still fits. This bound is part of the parser contract.

4. Add `ParseResult<T>` in `src/domain/validation/result.ts` exactly as in §5.
5. Implement money in `src/domain/models/money.ts`.
   - `moneyCentsSchema` is a Zod brand over `z.number().int().nonnegative()`. The brand label is `MoneyCents`. Use the installed Zod’s `.brand()` (or the documented equivalent if this major renamed it). Do not assert the brand with `as`.
   - Export stable messages:
     - `invalidMoneyMessage = 'Enter a non-negative euro amount with at most two decimal places.'`
   - `parseMoneyCents`:
     1. Trim. A leading `€` may appear once; strip it and trim again. `10€`, `€€10`, and `EUR 10` fail.
     2. The rest must match `^(0|[1-9]\d{0,12})(\.\d{1,2})?$`. The `{0,12}` cap is `limits.moneyWholeDigitsMax - 1`. Empty text, internal spaces, `,`, `-`, a trailing dot, a leading dot, a third decimal, and a leading zero on a multi-digit whole part (`00.50`, `01`) fail.
     3. Build cents with integers. Whole euros times `100`, plus the fraction. One fractional digit is tens of cents (`5` means `50`). Two fractional digits are the cents. Do not multiply the original decimal string by `100` through a float (`Number('1.15') * 100` is the bug this step exists to avoid).
     4. If the result is not a safe integer, fail. On success, return `moneyCentsSchema.parse(cents)` inside `{ ok: true, value }`. On failure, return `{ ok: false, message: invalidMoneyMessage }`. Do not return `0` for a failure.
   - `formatMoneyEuros` groups the euro digits with `,` from the right and always prints two decimal places. `1050` → `€10.50`. `0` → `€0.00`. `10000000` → `€100,000.00`. Do not call `Intl.NumberFormat`. Do not call this function with `null`.
   - `formatMoneyUnknown(null)` returns `Unknown`. A `MoneyCents` argument returns the same string as `formatMoneyEuros`.
6. Implement dates in `src/domain/models/dates.ts` without `Date`, `Date.UTC`, or `Date.now`.
   - Leap years: divisible by 4, except years divisible by 100 unless also divisible by 400. Month lengths: 31, 28/29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31.
   - `dateOnlySchema` accepts `YYYY-MM-DD` only when the year is `limits.yearMin`–`limits.yearMax` and the day exists. Brand the string as `DateOnly`. `2026-02-31` fails. `2026-02-29` fails. `2024-02-29` passes. `1899-01-01` fails.
   - `parseDateOnly` returns `ParseResult<DateOnly>` via that schema. Failure message: `Enter a real date as YYYY-MM-DD.` Export it as `invalidDateMessage`.
   - `timestampUtcSchema` accepts only `YYYY-MM-DDTHH:mm:ss.sssZ`. The date part must pass the calendar check. Hours `00`–`23`, minutes and seconds `00`–`59`, milliseconds exactly three digits, suffix `Z`. `2026-10-19T00:00:00.000Z` passes. `2026-10-19T00:00:00Z` fails. Brand the string as `TimestampUtc`.
   - `parseTimestampUtc` failure message: `Enter a UTC timestamp as YYYY-MM-DDTHH:mm:ss.sssZ.` Export it as `invalidTimestampMessage`.
   - `ageInWholeYears` splits the two branded dates. Subtract one when the as-of month/day is before the birthday. `2000-10-19` on `2026-10-19` is `26`. `2000-10-20` on `2026-10-19` is `25`. If the as-of date is earlier than the birth date, throw `RangeError` with `Birth date is after the as-of date.` Export that string as `invertedAgeMessage`.
   - `estimateAge` returns `reportedAge + (seasonOrdinal - referenceSeasonOrdinal)`. `reportedAge` must be an integer `0`–`limits.ageMax`. Both ordinals must be integers ≥ `1`. The result must be an integer `0`–`limits.ageMax`. Otherwise throw `RangeError` with `Estimated age is out of range.` Export that string as `estimatedAgeMessage`. `estimateAge(18, 1, 3)` is `20`. Do not add `birthDateFromAge` or any other function that creates a `DateOnly` from an age.
7. Implement `src/domain/models/positions.ts`.
   - `positionGroups`: `GK`, `DEF`, `MID`, `FWD`, `UNKNOWN`.
   - `positions`: `GK`, `CB`, `LB`, `RB`, `LWB`, `RWB`, `CDM`, `CM`, `CAM`, `LM`, `RM`, `LW`, `RW`, `ST`, `CF`, `UNKNOWN`.
   - Types `PositionGroup` and `Position` are the element types of those readonly arrays.
   - `positionGroupFor`: `GK` → `GK`; `CB` `LB` `RB` `LWB` `RWB` → `DEF`; `CDM` `CM` `CAM` `LM` `RM` → `MID`; `LW` `RW` `ST` `CF` → `FWD`; `UNKNOWN` → `UNKNOWN`. Any other runtime value throws `RangeError` `Unknown position.` Export that string as `unknownPositionMessage`.
8. Implement `src/domain/validation/schemas.ts`. Every object rejects unknown keys. Use the installed Zod API that does that (`z.strictObject` when it exists, otherwise `z.object(...).strict()`). Use the same choice for every object in this file, including nested ones (`colors`, lineup starters, constitution rules).
   - Nullable fields are required keys whose value may be `null` (`.nullable()`). Do not use `.optional()` for them, and do not use `.default(null)` or `.default(0)`. A missing key fails. `null` is the stored unknown.
   - Trim name strings, then enforce length. A name that trims to empty fails. Limits come from `limits`.
   - `entityIdSchema`: regex `^[A-Za-z0-9-]+$`, length 1–`limits.idMax`, branded `EntityId`.
   - `recordSourceSchema`: `fictional`, `imported`, `user-entered`, `estimated`, `generated`.
   - Percent fields are integers `0`–`100`. Attribute values and `potential` are integers `0`–`limits.attributeMax`. `potential` is nullable.
   - Nationality and `countryCode` are `^[A-Z]{2}$` or `null`. `gb` fails. `GB` passes.
   - Hex colors are `^#[0-9A-Fa-f]{6}$` for `primary` and `secondary`.
   - Build Zod enums from the `as const` arrays in `positions.ts` (`z.enum`). If this Zod major rejects a readonly tuple, give it a mutable tuple and add a `satisfies` check so that tuple cannot drift from `Position` / `PositionGroup`. Do not hand-copy the position strings into the schema without that check.

Entity fields:

- **Campaign.** `id`, `name` (1–`nameMax`), `kind` `fictional` | `imported`, `seed` string 1–`seedMax` or `null`, `generatorVersion` string 1–`generatorVersionMax` or `null`, `managedClubId`, `activeSeasonId`, `currency` literal `EUR`, `createdAt`, `updatedAt`, `revision` integer ≥ `0`.
- **Season.** `id`, `campaignId`, `label` 1–`seasonLabelMax`, `ordinal` integer ≥ `1`, `status` `active` | `closed`, `startDate` and `endDate` date-only or `null`, `openedAt`, `closedAt` timestamp or `null`.
- **League.** `id`, `campaignId`, `name`, `countryCode`, `tier` integer ≥ `1` or `null`.
- **Club.** `id`, `campaignId`, `leagueId` or `null`, `name`, `shortName` 1–`shortNameMax`, `colors`, `prestige` integer `0`–`prestigeMax`, `academyTier` integer `academyTierMin`–`academyTierMax`, `scoutingRegion` string 1–`regionMax` or `null`.
- **Player.** `id`, `campaignId`, `clubId` or `null`, `name`, `positionGroup`, `positions` (length `positionsMin`–`positionsMax`, unique), `nationalityCode` or `null`, `birthDate` or `null`, `reportedAge` integer `0`–`ageMax` or `null`, `ageReferenceSeasonOrdinal` integer ≥ `1` or `null`, `marketValueCents` or `null`, `attributes`, `potential` or `null`, `source`, `externalSourceId` string 1–`sourceIdMax` or `null`, `isNewgen` boolean. `attributes` is a strict object whose only keys are `pace`, `finishing`, `passing`, `dribbling`, `defending`, `physical`, each optional and each an integer `0`–`attributeMax` when present. `null` for one of those keys fails. An omitted key stays omitted. Refine: `reportedAge` and `ageReferenceSeasonOrdinal` are both null or both set. Refine: every position’s `positionGroupFor` equals `positionGroup`. Do not copy `birthDate` into `reportedAge` or the reverse.
- **Contract.** `id`, `campaignId`, `playerId`, `clubId`, `weeklyWageCents` or `null`, `squadTier` `key` | `rotation` | `youth` or `null`, `startsOn` and `expiresOn` date-only or `null`, `status` `active` | `ended`.
- **Constitution.** `id`, `campaignId`, `version` integer ≥ `1`, `rules`, `updatedAt`. `rules` is a five-element discriminated union on `id`, each id once, any order. Rule objects:
  - `SELL_TO_BUY`: `enabled` boolean, `salesReinvestmentPct`, `prizeReinvestmentPct`, `carryoverPct` percents, `initialAllocationCents` money.
  - `MAX_SIGNING_AGE`: `enabled`, `maxAge` integer `signingAgeMin`–`signingAgeMax`, `freeTransfersExempt` boolean.
  - `WAGE_TIER_CAP`: `enabled`, `keyWeeklyCapCents`, `rotationWeeklyCapCents`, `youthWeeklyCapCents` money.
  - `PRESTIGE_BID_SALE`: `enabled`, `requiredFeeNumerator` and `requiredFeeDenominator` integers ≥ `1`, `requireHigherPrestige` boolean.
  - `REGISTRATION_QUOTA`: `enabled`, `rosterLimit` integer ≥ `1`, `minimumHomegrown` integer ≥ `0`, `ageExemptionUnder` integer ≥ `1` or `null`, `competitionKey` 1–`competitionKeyMax`.
  - `enabled: false` still requires the parameters. Do not add a preset builder.
- **LedgerEntry.** `id`, `campaignId`, `seasonId`, `clubId`, `kind` `initial_allocation` | `player_sale` | `prize_income` | `approved_carryover` | `incoming_fee` | `reversal`, `amountCents`, `effectiveOn`, `sourceActionId`, `reversesEntryId` or `null`, `note` string 1–`noteMax` or `null`. Refine: `reversal` requires `reversesEntryId`; every other kind requires `reversesEntryId` null. Do not compute transfer capacity.
- **Transfer.** `id`, `campaignId`, `seasonId`, `playerId`, `fromClubId` or `null`, `toClubId` or `null`, `feeCents`, `kind` `sale` | `purchase` | `free`, `effectiveOn`, `sourceActionId`. Refine: at least one club id is set. `free` requires `feeCents` `0`. `sale` and `purchase` allow any nonnegative fee, including `0`.
- **Offer.** `id`, `campaignId`, `seasonId`, `playerId`, `bidderClubId`, `feeCents`, `status` `open` | `accepted` | `rejected`, `receivedOn`, `resolvedOn` or `null`. Refine: `open` requires `resolvedOn` null. `accepted` and `rejected` may still have `null`.
- **Lineup.** `id`, `campaignId`, `seasonId`, `name`, `formation` `4-3-3` | `4-2-3-1` | `4-4-2` | `3-5-2`, `starters` (0–`startersMax` of `{ playerId, slot, role }`), `benchPlayerIds` (0–`benchMax`), `updatedAt`. `slot` is 1–`slotMax` after trim. `role` is `null` or a string 1–`roleMax` after trim. Do not reject duplicate slots or duplicate players. That is Phase 4.
- **Registration.** `id`, `campaignId`, `seasonId`, `playerId`, `competitionKey`, `status` `registered` | `ineligible` | `unknown`, `homegrownClub` boolean or `null`, `homegrownNation` boolean or `null`, `ageExempt` boolean or `null`, `provenance` a record source. The homegrown fields are flags, not club ids.
- **MatchRecord.** `id`, `campaignId`, `seasonId`, `date`, `opponent` (name limit), `homeAway` `home` | `away`, `goalsFor` and `goalsAgainst` integers `0`–`goalsMax`, `competition` string 1–`competitionKeyMax` or `null`, `notes` string 1–`noteMax` or `null`, `xgFor` and `xgAgainst` integers `0`–`xgMilliMax` or `null`. Those xG integers are thousandths of a goal.
- **Appearance.** `id`, `campaignId`, `seasonId`, `matchId`, `playerId`, `minutes` integer `0`–`minutesMax`, `started` boolean or `null`, `goals` and `assists` integers `0`–`goalsMax` or `null`, `rating` integer `0`–`ratingMax` or `null`.
- **ShortlistItem.** `id`, `campaignId`, `playerId`, `priority` integer `priorityMin`–`priorityMax`, `status` `open` | `closed`, `notes` string 1–`noteMax` or `null`, `addedAt`.
- **ScoutingReport.** `id`, `campaignId`, `playerId`, `seasonId`, `archetype` 1–`archetypeMax`, `observations` string length 0–`noteMax` (empty is allowed), `confidence` `low` | `medium` | `high`, `source`, `createdAt`.
- **DevelopmentPlan.** `id`, `campaignId`, `playerId`, `seasonId`, `targetRole` string 1–`roleMax` or `null`, `notes` string length 0–`noteMax` (empty is allowed), `status` `open` | `closed`.
- **AuditEvent.** `id`, `campaignId`, `seasonId` or `null`, `actionId`, `actionType` `campaign.create` | `campaign.rename` | `player.add`, `createdAt`, `summary` 1–`noteMax`, `payload`. `payload` is a plain object (`Object.prototype`, not an array, not `null`). Walk it: only `null`, booleans, finite numbers, strings, arrays, and plain objects, depth at most `6`. `JSON.stringify(payload).length` ≤ `payloadJsonMax`. `undefined`, `NaN`, `Infinity`, bigint, and `Date` fail.
- **ImportReceipt.** `id`, `campaignId` or `null`, `sourceName` (name limit), `sourceType` `csv` | `json` | `backup`, `importedAt`, `rowCounts` (at most `rowCountKeysMax` keys, each key 1–`competitionKeyMax`, each value a nonnegative integer), `mappingVersion` 1–`mappingVersionMax`, `warnings` (at most `warningCountMax` strings, each 1–`noteMax`), `provenance`.

9. Add `src/domain/commands/result.ts` exactly as the `CommandResult` block in §5. Do not import Zod there. Do not add `runCommand`, `createCampaign`, `renameCampaign`, or `addPlayer`.
10. Add the tests in §7. Do not import `dexie`, `fake-indexeddb`, or IndexedDB. Do not render a route.

## 7. Tests to add/change

Existing `src/test/welcome.test.tsx`, `routing.test.tsx`, `status-pill.test.tsx`, and `shell-nav.test.tsx` stay as they are and must still pass. Do not edit them.

### `src/test/money.test.ts`

Each input is its own case. Assert the result object, not a thrown error.

| Input | Result |
| --- | --- |
| `''` | failure, message `invalidMoneyMessage` |
| `'   '` | failure |
| `'€10.50'` | `1050` |
| `' € 10.50 '` | `1050` |
| `'10'` | `1000` |
| `'10.5'` | `1050` |
| `'10.50'` | `1050` |
| `'0'` | `0` |
| `'0.01'` | `1` |
| `'1.15'` | `115` |
| `'0.29'` | `29` |
| `'10.555'` | failure |
| `'-1'` | failure |
| `'1,050.00'` | failure |
| `'10.'` | failure |
| `'.50'` | failure |
| `'00.50'` | failure |
| `'10€'` | failure |
| `'€€10'` | failure |

Also:

- `formatMoneyEuros` of the parsed `1050` is `€10.50`.
- `formatMoneyEuros(moneyCentsSchema.parse(0))` is `€0.00`.
- `formatMoneyEuros(moneyCentsSchema.parse(10_000_000))` is `€100,000.00`.
- `formatMoneyUnknown(null)` is `Unknown`.
- `formatMoneyUnknown` of parsed `1050` is `€10.50`.
- A failed parse does not have `value: 0`.

### `src/test/dates.test.ts`

- `parseDateOnly('2026-10-19')` succeeds.
- `parseDateOnly('2026-02-31')`, `parseDateOnly('2026-02-29')`, `parseDateOnly('1899-01-01')`, and `parseDateOnly('2026-10-19T00:00:00.000Z')` fail with `invalidDateMessage`.
- `parseDateOnly('2024-02-29')` succeeds.
- `parseTimestampUtc('2026-10-19T00:00:00.000Z')` succeeds.
- `parseTimestampUtc('2026-10-19T00:00:00Z')` and `parseTimestampUtc('2026-02-31T00:00:00.000Z')` fail with `invalidTimestampMessage`.
- Age of birth `2000-10-20` on `2026-10-19` is `25`.
- Age of birth `2000-10-19` on `2026-10-19` is `26`.
- Birth `2026-10-20` on as-of `2026-10-19` throws `RangeError` `invertedAgeMessage`.
- `estimateAge(18, 1, 3)` is `20`.
- `estimateAge(18, 3, 1)` throws `RangeError` `estimatedAgeMessage`.

Pass `ageInWholeYears` the branded values returned by `parseDateOnly`, not raw strings asserted with `as`.

### `src/test/schemas.test.ts`

Use `safeParse`. Do not assert Zod’s default issue text. Build one valid plain object per schema with these ids and timestamps, then `safeParse` each and expect success:

- Timestamp `2026-10-19T00:00:00.000Z`, date `2026-10-19`.
- Campaign `campaign-a`, kind `fictional`, seed `null`, generatorVersion `null`, managed club `club-a`, active season `season-a`, currency `EUR`, revision `0`, name `Riverside`.
- Season `season-a`, label `Season 1`, ordinal `1`, status `active`, endDate `null`, closedAt `null`.
- League `league-a`, name `North Counties`, countryCode `GB`, tier `1`.
- Club `club-a`, leagueId `null`, name `Riverside Athletic`, shortName `RIV`, colors `#113355` / `#D4A017`, prestige `40`, academyTier `3`, scoutingRegion `null`.
- Player `player-a`, club `club-a`, name `Amina Cole`, group `MID`, positions `['CM']`, nationality `null`, birthDate `null`, reportedAge `18`, ageReferenceSeasonOrdinal `1`, marketValueCents `null`, attributes `{ passing: 70 }`, potential `null`, source `fictional`, externalSourceId `null`, isNewgen `false`.
- After that player parses, `passing` is `70` and `pace` is `undefined`. It must not be `0`.
- Contract `contract-a` with `weeklyWageCents: null`, `squadTier: null`, both dates `null`, status `active`.
- Constitution `constitution-a`, version `1`, `updatedAt` the timestamp, and these five rules in this order, all `enabled: false`: sell-to-buy percents `70` / `100` / `0` and allocation `0`; max age `26` with free transfers exempt; weekly caps `4500000` / `2000000` / `500000`; fee numerator `3` and denominator `2` with higher prestige required; roster limit `25`, minimum homegrown `8`, age exemption under `21`, competition key `league`.
- Ledger `ledger-a`, kind `initial_allocation`, amount `0`, `reversesEntryId: null`, note `null`. Also a successful `reversal` row `ledger-rev` whose `reversesEntryId` is `ledger-a`.
- Transfer `transfer-a`, kind `free`, fee `0`, `fromClubId` `club-b`, `toClubId` `null`.
- Offer `offer-a`, status `open`, fee `0`, `resolvedOn: null`.
- Lineup `lineup-a`, formation `4-3-3`, one starter `{ playerId: 'player-a', slot: 'cm', role: null }`, bench `[]`.
- Registration `registration-a`, status `unknown`, both homegrown flags `null`, `ageExempt: null`, provenance `user-entered`, competition key `league`.
- Match `match-a`, opponent `Hilltown`, home, `0`–`0`, competition `null`, notes `null`, both xG `null`.
- Appearance `appearance-a`, minutes `90`, started `true`, goals `null`, assists `null`, rating `null`.
- Shortlist `shortlist-a`, priority `1`, status `open`, notes `null`.
- Scouting report `report-a`, archetype `Box-to-Box`, observations `''`, confidence `low`, source `estimated`.
- Development plan `plan-a`, targetRole `null`, notes `''`, status `open`.
- Audit `audit-a`, action id `action-a`, action type `campaign.create`, seasonId `null`, summary `Created campaign Riverside`, payload `{ name: 'Riverside' }`.
- Import receipt `receipt-a`, campaignId `null`, source name `local.csv`, source type `csv`, rowCounts `{ players: 0 }`, mapping version `1`, warnings `[]`, provenance `imported`.

Negative cases, each `safeParse(...).success` is `false`:

- Contract fixture with `weeklyWageCents` omitted.
- Player fixture with `source` omitted.
- Player fixture with `attributes: { passing: 70, speed: 10 }`.
- Player fixture with `marketValueCents` omitted.
- Player fixture with `reportedAge: 18` and `ageReferenceSeasonOrdinal: null`.
- Player fixture with `reportedAge: null` and `ageReferenceSeasonOrdinal: 1`.
- Player fixture with `positionGroup: 'FWD'` and `positions: ['CM']`.
- Player fixture with `positions: ['CM', 'CM']`.
- Campaign fixture plus `currency: 'GBP'`.
- Campaign fixture plus an extra key `nickname: 'Riv'`.
- League fixture with `countryCode: 'gb'`.
- Constitution fixture with the `REGISTRATION_QUOTA` rule removed.
- Constitution fixture with a second `SELL_TO_BUY` and one fewer of another rule, so the length is still 5 and an id repeats.
- Ledger `initial_allocation` with `reversesEntryId: 'ledger-a'`.
- Ledger `reversal` with `reversesEntryId: null`.
- Transfer `free` with `feeCents: 1`.
- Offer `open` with `resolvedOn` set to the date.
- The valid player’s `marketValueCents: null` still parses, and the parsed value is `null`.
- The valid contract’s `weeklyWageCents` parses as `null`.

`CommandResult` coverage in this same file:

```ts
const failure: CommandResult<null> = {
  ok: false,
  code: 'CONFLICT',
  message: 'Stale revision',
}
```

Expect `commandFailureCodes` to contain `failure.code`, and expect the five codes in §5 in that order. Do not open a database in the test.

### Failure cases that must keep failing

- A money parser that uses `Number(input) * 100` fails the `1.15` and `0.29` cases or is still wrong if those cases were loosened. Do not loosen them.
- A schema that defaults a missing wage to `0` fails the omitted-`weeklyWageCents` case.
- A schema that fills `pace: 0` fails the “pace is undefined” assertion.
- A schema that strips unknown keys instead of rejecting them fails the `nickname` case.
- An age helper that reads the system clock cannot satisfy the fixed `2000-10-20` / `2026-10-19` expectation. Do not replace those dates with `new Date()`.

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
- `pnpm test` runs the four Phase 1 files plus `money.test.ts`, `dates.test.ts`, and `schemas.test.ts`.
- `pnpm test` does not open a browser and does not need IndexedDB.
- `pnpm build` still typechecks, then produces the existing static shell.

`pnpm test:e2e` is not a gate for this guide. Do not skip the commit because it was not run. Run it only if you changed a file under `src/app`, `src/features`, `src/components`, or `e2e`. Those paths are not in §5, so a change there means the guide was exceeded; revert that change instead of adding an end-to-end run.

## 9. Manual acceptance check

1. `pnpm dev`, open `/`. The heading is `Touchline OS`. The disclaimer is still the Phase 1 sentence. **Create new campaign** still shows `Campaigns cannot be saved in this build.`
2. Open `/app/demo/command-center`. The banner reads `Static preview — not save data`. The four KPI values read `Preview`.
3. Open Constitution. It still says rules are not active. Squad still has no player rows.
4. In the browser application-storage panel, no database named `touchline-os` appears.

If step 1 or 2 fails, a domain file was wired into the shell or copy changed. Revert that wiring. This guide has no new click path.

## 10. Definition of done

- [ ] `zod` is a production dependency. `dexie` and `fake-indexeddb` are not.
- [ ] Domain modules do not import React, React Router, Dexie, `src/app`, `src/features`, `src/components`, or `src/data`.
- [ ] ESLint rejects `Date.now`, `new Date`, and `Math.random` under `src/domain/**/*.ts`.
- [ ] `react-refresh/only-export-components` does not fail the domain files.
- [ ] Money, date, timestamp, age, and schema tests in §7 exist and pass. Phase 1 tests still pass.
- [ ] Nullable wage and value have no zero default. `formatMoneyUnknown(null)` is `Unknown`.
- [ ] There is no `birthDateFromAge`, no `evaluateAction`, no `src/data/`, and no `src/domain/index.ts`.
- [ ] `src/main.tsx`, feature pages, and `src/app/copy.ts` are unchanged.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase2.md` have no edits in this commit.

## 11. Commit instructions

Stage `package.json`, `pnpm-lock.yaml`, `eslint.config.js`, `src/domain/**`, `src/test/money.test.ts`, `src/test/dates.test.ts`, `src/test/schemas.test.ts`, and `plans/phase2/guide1.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase2.md`.

Suggested message:

```text
feat(p02-g01): define canonical domain contracts
```

Do not commit when §8 is failing. Do not amend `bbdabe871502ac71d044196aa4ce82396c9fbc81`. After the commit succeeds, record its full SHA on the `P02-G01` row of the progress log in `plans/phase2.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P02-G02` may import:

- `moneyCentsSchema`, `dateOnlySchema`, `timestampUtcSchema`, and `entityIdSchema`
- Every entity schema exported from `src/domain/validation/schemas.ts`
- `ParseResult` only if a database helper needs it; the database guide parses with Zod, not with `parseMoneyCents`

`P02-G02` adds Dexie, `fake-indexeddb`, `src/data/db.ts`, and `schemaV1`. It must not change these schemas’ field names. A new stored field is a phase-plan edit, not a quiet schema tweak.

Known limitations this guide leaves on purpose:

- No IndexedDB, no repositories, and no `runCommand`.
- `CommandResult` is not yet produced by a function.
- Constitution objects can be parsed and still have `enabled: false`. Nothing treats them as active rules. The constitution screen copy stays `Rules are not active in this build.`
- Ledger rows do not imply a remaining transfer budget. Phase 5 calculates that.
- Lineup schemas do not reject a player used twice.
