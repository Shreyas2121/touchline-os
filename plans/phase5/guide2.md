# P05-G02 — Auditable club finances

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.3 and §12.2 invariants 1 and 6.
- **Parent phase:** `plans/phase5.md`, guide **P05-G02**. Capacity, wage commitment, and the ledger commands are phase §5 “Capacity”, “Wage commitment”, and “Ledger commands”. The work block is phase §6 `P05-G02`.
- **Predecessor guide:** `plans/phase5/guide1.md`.
- **Predecessor commit:** the commit whose subject is `feat(p05-g01): introduce explainable policy engine`. Verify with `git log --grep="feat(p05-g01): introduce explainable policy engine" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p05-g02): calculate auditable club finances`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase5.md` → this guide. This guide does not evaluate a signing, save a constitution, or change a screen.

## 2. Goal and user-observable result

Nothing a person can click changes. Finance still shows the empty ledger preview.

What this guide adds:

- A pure capacity breakdown. €10,000,000 of completed sales at 70% credits €7,000,000, not €10,000,000.
- A wage total that leaves a null wage out of the sum.
- Commands that post an opening allocation or prize income, and that reverse one row, or that write nothing.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P05-G01 sha> HEAD` succeeds, using the SHA from §1.
- `src/domain/rules/presets.ts` exists. `src/domain/finance/` does not. `src/data/commands/post-ledger-entry.ts` does not. If either new path exists, stop and reconcile before editing.
- `rejectCommand` and `runCommand` already exist. Reuse them.
- Do not edit `schemaV1` or `src/data/migrations/v1.ts`. The ledger indexes from Phase 2 are enough.
- Leave `MASTER_PLAN.md` and `plans/phase5.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase5.md` §5 “Capacity”, “Wage commitment”, and “Ledger commands”, and the `P05-G02` block in §6.
- `src/domain/validation/schemas.ts` — `ledgerEntrySchema`, `contractSchema`, `auditEventSchema`. The audit enum does not yet include `ledger.post` or `ledger.reverse`.
- `src/domain/models/money.ts` — `formatMoneyEuros` and `moneyCentsSchema`. Format only a parsed `MoneyCents`.
- `src/data/transactions/run-command.ts` — a `PersistenceError` of code `SCOPE` becomes `VALIDATION` and keeps `error.message`. `CONFLICT` is `Campaign revision is stale.`
- `src/data/commands/save-lineup.ts` — the input schema, `rejectCommand`, `updateCampaign`, and the single audit `add`.
- `src/data/repositories/lineups.ts` — `parseStored`, campaign scope, and `add`.
- `src/data/migrations/v1.ts` — indexes `[campaignId+seasonId]` on `ledgerEntries`, `[campaignId+clubId]` on `contracts`, and `campaignId` on `constitutions`. Read them. Do not change them.
- `src/test/fixtures/campaign.ts` — `harborInput`. A second campaign in the isolation test needs its own ids. Do not put a preset on `harborInput`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/finance/capacity.ts` | `transferCapacity`, kind labels |
| `src/domain/finance/wages.ts` | `wageCommitment`, `formatWageCommitment` |
| `src/data/repositories/constitutions.ts` | Read and insert. No update |
| `src/data/repositories/ledger-entries.ts` | Scoped list and insert |
| `src/data/repositories/contracts.ts` | `listContractsByClub` only |
| `src/data/commands/post-ledger-entry.ts` | `postLedgerEntry` |
| `src/data/commands/reverse-ledger-entry.ts` | `reverseLedgerEntry` |
| `src/domain/validation/schemas.ts` | Allow the two new audit action types |
| `src/test/capacity.test.ts` | Formula, reversal pairs, wages |
| `src/test/ledger-commands.test.ts` | Post, refuse, reverse, conflict, isolation |
| `src/test/schemas.test.ts` | The audit fixture still parses |

Do not edit `src/features/**` or `e2e/**`. Do not export `insertContract`.

### Public API

```ts
export type CapacityBreakdown = {
  initialAllocationCents: number
  saleCreditCents: number
  prizeCreditCents: number
  carryoverCents: number
  incomingFeesCents: number
  authorizedCents: number
  remainingCents: number
}

export function transferCapacity(
  entries: readonly LedgerEntry[],
  seasonId: string,
  clubId: string,
  percents: { salesReinvestmentPct: number; prizeReinvestmentPct: number },
): CapacityBreakdown

export function formatCapacity(cents: number | null): string

export function ledgerKindLabel(kind: LedgerEntry['kind']): string

export function displayLedgerKind(kind: LedgerEntry['kind']): string

export type WageTier = 'key' | 'rotation' | 'youth' | 'unknown'

export type WageCommitment = {
  knownCents: number
  unknownCount: number
  byTier: Record<
    WageTier,
    { count: number; knownCents: number; unknownCount: number }
  >
}

export function wageCommitment(
  contracts: readonly Contract[],
  clubId: string,
): WageCommitment

export function formatWageCommitment(commitment: {
  knownCents: number
  unknownCount: number
}): string

export function postLedgerEntry(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<LedgerEntry>>

export function reverseLedgerEntry(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<LedgerEntry>>
```

`ledgerKindLabel` returns `opening allocation`, `prize income`, `player sale`, `incoming fee`, `carryover`, or `reversal`. `displayLedgerKind` returns `Opening allocation`, `Prize income`, `Player sale`, `Incoming fee`, `Carryover`, or `Reversal`.

`formatCapacity(null)` is `Unknown`. A number formats with `formatMoneyEuros`, including `€0.00`.

## 6. Implementation steps

1. Implement `transferCapacity` exactly as phase §5. Keep rows whose `seasonId` and `clubId` match. Drop a reversal and the row its `reversesEntryId` names. Ignore an orphan reversal. Do not add the reversal’s amount to a bucket.
2. Credit sales with `Math.floor(grossSales * salesReinvestmentPct / 100)` and prizes with the same floor division. `authorizedCents` is the four credit buckets. `remainingCents` is authorized minus incoming fees. A one-cent sale at 70% credits 0.
3. Implement `wageCommitment`. Keep `status === 'active'` and the same `clubId`. A null wage increments `unknownCount` and is not added. A null `squadTier` uses the `unknown` tier. Ended rows and other clubs contribute nothing. Every tier key is present even when its count is 0.
4. Implement `formatWageCommitment` with the three rows in phase §5. `unknownCount === 0` includes `€0.00` when `knownCents` is 0.
5. `listLedgerEntries` queries `[campaignId+seasonId]`, filters `clubId` in that result, parses every row with `parseStored`, and sorts by `effectiveOn` ascending, then `id` ascending. Do not call `toArray()` on the whole table.
6. `getActiveConstitution` loads `where('campaignId').equals(campaignId)`, parses every row, and returns the highest `version`, or `undefined`. `listConstitutions` returns those rows sorted by `version` ascending. `insertConstitution` uses `add` and throws `PersistenceError` `SCOPE` when `constitution.campaignId` differs. Do not export an update.
7. `insertLedgerEntry` uses `add` and the same `SCOPE` check. `listContractsByClub` queries `[campaignId+clubId]` and parses every row. Do not export an insert.
8. `postLedgerEntry` accepts a strict input: `campaignId`, `entryId`, `seasonId`, `expectedRevision`, `now`, `auditEventId`, `actionId`, `kind` limited to `'initial_allocation' | 'prize_income'`, `amountCents` as a nonnegative integer, `effectiveOn` as a `DateOnly`, and `note` as a trimmed string of 1–4_000 characters or null. Any other kind fails the schema and returns `{ ok: false, code: 'VALIDATION', message: 'Command input is not valid.' }` before `runCommand`, matching `saveLineup`.
9. Inside the transaction, load the campaign. `seasonId` must be the active season. `clubId` must equal `managedClubId`. A second non-reversed `initial_allocation` for that campaign, season, and club throws `PersistenceError` `SCOPE` with message `An opening allocation is already posted.` Prize income may repeat. Write the ledger row, `updateCampaign` with the revision argument, and one audit. Summaries are `Posted opening allocation of ${euros}` and `Posted prize income of ${euros}`. `actionType` is `ledger.post`. `sourceActionId` is `actionId`. `reversesEntryId` is null. `note` is the parsed note.
10. `reverseLedgerEntry` accepts `campaignId`, `entryId`, `reversalId`, `expectedRevision`, `now`, `auditEventId`, `actionId`, and a required trimmed `note` of 1–4_000 characters. Load the target with the campaign scope. A missing target is `rejectCommand('NOT_FOUND', 'Ledger entry not found.')`. A target whose kind is `reversal`, or a target that already has a reversal in this campaign, throws `PersistenceError` `SCOPE` with message `This entry cannot be reversed.` Copy `amountCents`, `seasonId`, `clubId`, and `effectiveOn` from the target. Audit summary is `Reversed ${ledgerKindLabel(target.kind)}`. `actionType` is `ledger.reverse`.
11. Both commands declare `ledgerEntries`, `seasons`, `campaigns`, and `auditEvents` on the transaction. A stale `expectedRevision` returns `CONFLICT` and writes nothing. Do not call `systemClock` or `createEntityId` inside either command.
12. Add `ledger.post` and `ledger.reverse` to the `actionType` enum. Update the audit object in `src/test/schemas.test.ts` only if it stops parsing. Do not edit `schemaV1`.

## 7. Tests to add/change

`src/test/capacity.test.ts` does not open a database. Build plain objects that pass `ledgerEntrySchema`.

- Gross `player_sale` 1_000_000_000 and sales percent 70 produce `saleCreditCents` 700_000_000. Percent 100 produces 1_000_000_000. Percent 0 produces 0.
- A `player_sale` of 1 cent at 70% credits 0.
- Prize 100_000_000 at 100% credits 100_000_000. At 50% it credits 50_000_000.
- Opening 500_000_000 plus that 70% sale and no fees leaves `remainingCents` at 1_200_000_000.
- Adding a reversal of the sale, included in the same array, drops the sale credit back to 0. A reversal of an `incoming_fee` drops that fee.
- An orphan reversal does not change the buckets.
- A row with another `seasonId` or another `clubId` does not move season 1.
- One active contract with `weeklyWageCents: null` yields `knownCents` 0 and `unknownCount` 1. `formatWageCommitment` of that result is `Unknown`. An ended contract is ignored. No contracts formats as `€0.00`. A known 1050 plus one unknown formats as `€10.50 · 1 unknown`.
- `formatCapacity(null)` is `Unknown`. `formatCapacity(0)` is `€0.00`.

`src/test/ledger-commands.test.ts`, database `touchline-os-test`, cleanup with `deleteDatabaseForTests`:

- `createCampaign` with `harborInput`. Post an opening allocation of 500_000_000. The result is `ok`, revision is the previous revision plus 1, one ledger row exists, and one `ledger.post` audit summary is `Posted opening allocation of €5,000,000.00`.
- A second opening allocation returns `VALIDATION`, message `An opening allocation is already posted.`, and the row count stays 1.
- `postLedgerEntry` with `kind: 'player_sale'` returns `VALIDATION` and message `Command input is not valid.`
- Post prize income of 100_000_000, then reverse it. `transferCapacity` after the reversal credits 0 prize. Reversing that reversal returns `VALIDATION` and message `This entry cannot be reversed.`
- The same prize post with a stale `expectedRevision` returns `CONFLICT`. Prize rows and revision stay as they were.
- Create a second campaign. Its `listLedgerEntries` for its own season and club is empty.
- A `runCommand` body that inserts a ledger row and then throws returns `ABORTED`. The ledger count and revision match the pre-command state.

Use the fixed timestamp `2026-10-19T00:00:00.000Z` and `effectiveOn` `2026-10-19`. Do not call `systemClock()`.

## 8. Verification commands

Run from the repository root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: each command exits 0. `pnpm test` includes the previous files plus `capacity.test.ts` and `ledger-commands.test.ts`.

Do not run Playwright. This guide must not change a screen.

## 9. Manual acceptance check

There is no screen change. Open Finance and confirm the empty ledger and `This build does not store records.` are still there.

The formulas and commands are proven by the two new test files.

## 10. Definition of done

- [ ] 1_000_000_000 cents of sales at 70% credits 700_000_000 cents.
- [ ] A null wage is not added into `knownCents`.
- [ ] Opening allocation posts once. `player_sale` is refused by `postLedgerEntry`.
- [ ] Reverse drops the target from a later capacity call. A second reverse writes nothing.
- [ ] A stale revision writes nothing. Campaign B cannot list campaign A’s ledger.
- [ ] `schemaV1` is unchanged. No feature file imports the new commands.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase5.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5, and `plans/phase5/guide2.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase5.md`, or later guide files.

Suggested message:

```text
feat(p05-g02): calculate auditable club finances
```

Do not commit when §8 is failing. Do not amend the `P05-G01` commit. After the commit succeeds, record its full SHA on the `P05-G02` row of the progress log in `plans/phase5.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P05-G03` passes `remainingCents` into `PolicySnapshot`. It does not post a ledger row.

`P05-G04` calls `postLedgerEntry`, `reverseLedgerEntry`, `transferCapacity`, `formatCapacity`, `wageCommitment`, `formatWageCommitment`, `displayLedgerKind`, `getActiveConstitution`, `listLedgerEntries`, and `listContractsByClub`. It must not add `insertContract`.

Known limitations this guide leaves on purpose:

- Sale and incoming-fee rows can be inserted by a test through `insertLedgerEntry`. The public post command still refuses them.
- No constitution is saved, so the screen has no capacity figure yet.
- `approved_carryover` is counted by the pure function and is not postable here.
