> **ARCHIVED / SUPERSEDED — reference only.** This companion plan was replaced on 2026-10-20 by MASTER_PLAN.md 2.0.0 and the active plans/phase7.md. Do not execute these instructions. Completed P07-G01 remains in plans/phase7/guide1.md unchanged.

---

# P07-G04 — Advance campaign seasons explicitly

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.2, §5.3, §7.6, and §12.2 invariant 8.
- **Parent phase:** `plans/phase7.md`, guide **P07-G04**. Preview, close, and carryover rules are phase §5 “Rollover”. The work block is phase §6 `P07-G04`.
- **Predecessor guide:** `plans/phase7/guide3.md`.
- **Predecessor commit:** the commit whose subject is `feat(p07-g03): review and correct season history`. Verify with `git log --grep="feat(p07-g03): review and correct season history" -1 --format=%H`.
- **Commit subject:** `feat(p07-g04): advance campaign seasons explicitly`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase7.md` → this guide. This guide does not generate prospects and does not post `initial_allocation`.

## 2. Goal and user-observable result

On Seasons, a person can preview a rollover and then confirm it:

- The preview says `Preview only — no changes recorded.`
- A qualifying offer disables confirm and writes nothing.
- A successful confirm closes the current season, opens the next, and posts carryover once when the amount is positive.
- A second confirm of that same season does not open another copy and does not post a second carryover.
- Reported age and birth date stay as stored.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P07-G03 sha> HEAD` succeeds.
- The season review renders. `advanceSeason` does not exist.
- Do not install a package. Do not edit `schemaV1` or `DATABASE_VERSION`.
- Do not teach `postLedgerEntry` to accept `approved_carryover`.
- Leave `plans/phase7/guide5.md` and `guide6.md` unstaged.

## 4. Files to inspect

- `plans/phase7.md` §5 “Rollover”, including the expiring-contract table.
- `src/domain/rules/evaluate-action.ts` — the `season-rollover` branch and the message `A qualifying offer is still unresolved.`
- `src/domain/rules/qualify-offer.ts` — `countUnresolvedQualifyingOffers`.
- `src/domain/finance/capacity.ts` — `transferCapacity` already adds `approved_carryover`.
- `src/data/commands/post-ledger-entry.ts` — the allowed kinds stay `initial_allocation` and `prize_income`.
- `src/data/repositories/ledger-entries.ts` — `insertLedgerEntry`.
- `src/data/repositories/seasons.ts` — `insertSeason` rejects a second active season. Close first.
- `src/domain/player/squad-view.ts` — `displayAge`. Do not write a new age helper that uses `Date`.
- `src/features/dashboard/CommandCenterPage.tsx` — the expiring filter.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/finance/carryover.ts` | `previewSeasonRollover`, `carryoverCents` |
| `src/data/commands/advance-season.ts` | `advanceSeason` |
| `src/features/seasons/RolloverForm.tsx` | Preview and confirm |
| `src/features/seasons/SeasonsPage.tsx` | Place the form under the review |
| `src/features/dashboard/CommandCenterPage.tsx` | End-date window |
| `src/domain/validation/schemas.ts` | Audit type `season.advance` only |
| `src/test/advance-season.test.ts` | Carryover, block, and age |
| `README.md` | Season advances |

### Public API

```ts
export function carryoverCents(
  remainingCents: number,
  carryoverPct: number,
): number

export function previewSeasonRollover(input: {
  remainingCents: number | null
  unresolvedQualifyingOffers: number
  constitution: Constitution | null
  snapshotRevision: number
}): {
  carryoverCents: number | null
  initialAllocationCents: null
  report: RuleReport
}

export function advanceSeason(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<{ seasonId: string }>>
```

`carryoverCents` returns `Math.floor(Math.max(0, remainingCents) * carryoverPct / 100)`. `previewSeasonRollover` reads `carryoverPct` from the constitution's `SELL_TO_BUY` rule, including when that rule is disabled. It sets `carryoverCents` to null when `constitution` is null or `remainingCents` is null. It always sets `initialAllocationCents` to null. With a constitution it calls `evaluateAction`. With no constitution the report has no verdicts and uses `snapshotRevision`. A disabled prestige rule is the caller's responsibility: pass `unresolvedQualifyingOffers: 0`.

`advanceSeason` has no `generateNewgens` field in this guide. The next guide adds it. Keep the input strict so the next guide is the one that widens the schema.

## 6. Implementation steps

1. Add the pure carryover helpers. Do not post a ledger row from the preview.
2. Add `advanceSeason` with the transaction order in phase §5: fresh read, offer count, `evaluateAction`, throw on `BLOCK`, close, insert, point `activeSeasonId` at the new season, insert `approved_carryover` only when the amount is positive, one audit. Summary: `Advanced to ${label}`.
3. Use `insertLedgerEntry`. Do not call `postLedgerEntry`. A positive amount needs `carryoverEntryId`. A zero amount rejects a non-null id.
4. Do not copy lineups, registrations, offers, matches, or appearances. Do not update players or contracts.
5. Add the form under the review. Labels: `Next season`, `Starts on`, `Season ended on`. Buttons: `Preview rollover`, `Confirm rollover`. The preview includes `Preview only — no changes recorded.` Confirm stays disabled while the latest preview has a `BLOCK` or belongs to a stale revision. A blocker uses `StatusPill` `Blocked` plus the verdict message and remedy. Success text: `Advanced the season.`
6. There is no checkbox and no rule toggle on this form.
7. Change the expiring-contract count to the table in phase §5. A null `endDate` keeps today's count so Harbor stays `0`.

## 7. Tests to add/change

Create `src/test/advance-season.test.ts`:

- Remaining 500_000_000 and percent 40 insert one `approved_carryover` of 200_000_000 on the new season. The old season's ledger is unchanged. The new season has no `initial_allocation`.
- Percent 0 inserts no ledger row. Remaining `-1` inserts no ledger row.
- No constitution inserts no ledger row, closes the old season, and opens the new one.
- One qualifying open offer returns `VALIDATION` with `A qualifying offer is still unresolved.` The season stays `active` and the ledger count is unchanged.
- A null market value does not block.
- A second call with the closed season id returns `VALIDATION`. A stale revision returns `CONFLICT` and the carryover count stays 1.
- `postLedgerEntry` with `approved_carryover` still returns `VALIDATION`.
- Stored `reportedAge` 20 and reference ordinal 1 are unchanged. `displayAge` on the new season is `{ kind: 'estimated', years: 21 }`. A birth date string is unchanged.
- `endDate` null still counts a dated contract. `endDate` `2027-06-30` counts a contract ending that day and ignores `2027-07-01`.
- Campaign B's season list does not include campaign A's new season.

Use a constitution save to set `carryoverPct` to 40. Do not edit the Balanced preset table.

## 8. Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: each command exits 0. `pnpm test` includes `advance-season.test.ts`.

## 9. Manual acceptance check

1. On the demo, save Balanced, open Seasons, and preview a rollover. Confirm the preview sentence and that nothing was written. Reload. The season is still the original active season.
2. Confirm the rollover. The timeline shows one closed season and one active season. Finance shows no carryover row, because Balanced's percent is 0, and it may show the existing opening-allocation mismatch sentence.
3. Confirm again is a new form for the new season. Do not treat that as a second close. The closed season remains one row.
4. Harbor, created with the default preset and no end date, still shows `Expiring contracts` `0`.

## 10. Definition of done

- [ ] Preview writes nothing. Confirm writes the season pair, at most one carryover, and one audit.
- [ ] A block or a stale revision writes none of those.
- [ ] No opening allocation is inserted by this command.
- [ ] Players' stored ages are untouched.
- [ ] No prospect is inserted.
- [ ] Lint, typecheck, test, build, and e2e pass.

## 11. Commit instructions

Stage only this guide's files.

```text
feat(p07-g04): advance campaign seasons explicitly
```

Do not commit when a verification command fails. Record the SHA in `plans/phase7.md` §10.

## 12. Handoff

- `advanceSeason` closes one season and can post one carryover. Its input has no newgen flag yet.
- `previewSeasonRollover` is the verdict and amount the screen shows.
- The next guide adds `generateNewgens` and `prospectIds` to that command and the checkbox on this form.
