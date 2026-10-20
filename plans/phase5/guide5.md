# P05-G05 — Rule impacts before commits

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.4 and §12.5.
- **Parent phase:** `plans/phase5.md`, guide **P05-G05**. Preview arithmetic and the Finance region are phase §5 “Preview arithmetic” and “Screens”. The work block is phase §6 `P05-G05`.
- **Predecessor guide:** `plans/phase5/guide4.md`.
- **Predecessor commit:** the commit whose subject is `feat(p05-g04): expose finances and rule settings`. Verify with `git log --grep="feat(p05-g04): expose finances and rule settings" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p05-g05): explain rule impacts before commits`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase5.md` → this guide. This guide does not record a transfer, a contract, or a ledger row.

## 2. Goal and user-observable result

On Finance, a person can preview a paid signing, a free signing, a wage change, or an offer rejection:

- The result shows `Before` and `After`, each verdict’s word, message, and remedy, and `Preview only — no changes recorded.`
- A €6,000,000 fee against €5,000,000 remaining shows `Blocked` and `Short by €1,000,000.00`.
- `Record this action` is disabled. Reload does not add a ledger row.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P05-G04 sha> HEAD` succeeds, using the SHA from §1.
- `evaluateAction`, `formatCapacity`, `formatWageCommitment`, and the Finance page from `P05-G04` exist. `src/domain/finance/preview.ts` does not. If it does, stop and reconcile before editing.
- Do not edit `schemaV1` or `evaluateAction`. Do not enable the record button.
- Leave `MASTER_PLAN.md` and `plans/phase5.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase5.md` §5 “Preview arithmetic” and the action-preview bullets under “Screens”, and the `P05-G05` block in §6.
- `src/domain/rules/evaluate-action.ts` — call it. Do not copy its comparisons into the component.
- `src/domain/models/money.ts` — `parseMoneyCents`. The form speaks euros. The action speaks cents. `6000000` is €6,000,000.00, which is 600_000_000 cents.
- `src/features/finance/FinancePage.tsx` — the loaded constitution, breakdown, wage commitment, and club prestige.
- `src/components/ui/StatusPill.tsx` — tones `blocked`, `warning`, and `informational` render `Blocked`, `Warning`, and `Informational`.
- `src/domain/models/money.ts` — `invalidMoneyMessage`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/finance/preview.ts` | `previewAction` |
| `src/features/finance/ActionPreview.tsx` | The form and the result |
| `src/features/finance/FinancePage.tsx` | Render the region under the ledger |
| `src/test/action-preview.test.tsx` | Pure shortfall and a click that does not write |

Do not edit `TransfersPage.tsx`. Do not add a command.

### Public API

```ts
export type PreviewResult = {
  report: RuleReport
  beforeCapacity: string
  afterCapacity: string
  beforeWages: string
  afterWages: string
}

export function previewAction(input: {
  action: PolicyAction
  snapshot: PolicySnapshot
  constitution: Constitution
  effectiveDate: DateOnly
  wages: { knownCents: number; unknownCount: number }
}): PreviewResult
```

`beforeCapacity` is `formatCapacity(snapshot.remainingCapacityCents)`. `beforeWages` is `formatWageCommitment(input.wages)`.

## 6. Implementation steps

1. `previewAction` calls `evaluateAction` and returns that report unchanged. It does not write and does not import `src/data`.
2. A paid `incoming-transfer` with a null remaining capacity sets `afterCapacity` to `Unknown`. When `feeCents` is greater than the remaining capacity, `afterCapacity` is `Short by ${formatMoneyEuros(feeCents - remainingCapacityCents)}`. Otherwise it is `formatCapacity(remaining - fee)`. A free signing, a `wage-change`, a `reject-offer`, and a `season-rollover` copy `beforeCapacity` into `afterCapacity`.
3. For `incoming-transfer` and `wage-change`, a null `weeklyWageCents` sets `afterWages` to `Unknown`. A known wage sets it to `formatWageCommitment({ knownCents: wages.knownCents + weeklyWageCents, unknownCount: wages.unknownCount })`. The other action types copy `beforeWages`.
4. `ActionPreview` is a region labeled `Action preview`. The select is labeled `Action` with options `Paid signing`, `Free signing`, `Wage change`, and `Reject offer`.
5. Paid signing shows `Fee`, `Age`, `Weekly wage`, and `Tier`. Free signing does not show `Fee`; the action uses `feeCents: 0` and `isFree: true`. Wage change shows `Weekly wage` and `Tier`. Reject offer shows `Bid`, `Market value`, and `Bidder prestige`. Seller prestige is the `prestige` prop, which Finance passes from the managed club. It is not an input.
6. Blank age, wage, market value, or bidder prestige becomes null. An empty tier option submits `squadTier: null`. Tier labels are `Key`, `Rotation`, and `Youth`, and the values are `key`, `rotation`, and `youth`.
7. Parse money with `parseMoneyCents`. Fee and bid are required. Wage and market value may be blank. A failed parse shows `invalidMoneyMessage` and does not replace the previous result. A non-integer age, or an age outside 0–99, shows `Enter a whole number of years or leave age blank.` A non-integer bidder prestige, or a prestige outside 0–100, shows `Enter a prestige from 0 to 100 or leave it blank.`
8. Button `Preview action` calls `previewAction` with `effectiveDate` `2026-10-19` only in tests. The page passes the `DateOnly` already used for the prize form’s initial date, taken from `systemClock()` at the UI edge. The domain function does not read the clock.
9. The result includes the exact sentence `Preview only — no changes recorded.` Lines are labeled `Before` and `After` and include the capacity and wage strings. Each verdict renders `StatusPill` with tone `blocked` for `BLOCK`, `warning` for `WARN`, and `informational` for `INFO`, then the message and the remedy. When `report.allowed` is true and `verdicts` is empty, show `No rule blocked this action.`
10. Button `Record this action` has the `disabled` attribute. Beside it, the text is `Transfers and contracts are not recorded in this build.` Do not add an `onClick` that calls a command.
11. Finance renders `ActionPreview` only when a constitution is loaded. Pass `remainingCapacityCents` from the breakdown, or null when no constitution exists. When no constitution exists, do not render the preview. The snapshot revision is the campaign revision already loaded with the page.

## 7. Tests to add/change

`src/test/action-preview.test.tsx`:

- Pure: Balanced constitution, revision 4, remaining 500_000_000, wages `{ knownCents: 0, unknownCount: 0 }`, paid fee 600_000_000, age 24, wage 1_000_000, tier `rotation`. The report code is `FEE_EXCEEDS_CAPACITY`. `afterCapacity` is `Short by €1,000,000.00`. `beforeCapacity` is `€5,000,000.00`.
- The same preview with fee 100_000_000 has `allowed` true, `afterCapacity` `€4,000,000.00`, and `afterWages` `€10,000.00`.
- A `wage-change` with `weeklyWageCents: null` sets `afterWages` to `Unknown` and does not change capacity.
- Render Finance for a campaign created with `preset: 'balanced'`. Fill fee `6000000`, age `24`, weekly wage `10000`, and tier `Rotation`. Activate `Preview action`. The page shows `Blocked`, `The fee is above the remaining transfer capacity.`, and `Preview only — no changes recorded.`
- After that click, `listLedgerEntries` still returns one opening allocation. The campaign revision is unchanged.
- `Record this action` is disabled.
- Change the action to `Reject offer`. Fill bid `150000`, market value blank, bidder prestige `80`. The result shows `Warning` and `Valuation or prestige is unknown, so this bid needs a manual review.` It does not show a second ledger row.
- Fill market value `100000` as well. Bidder prestige 80 against Harbor’s stored prestige 50 and Balanced’s 3/2 rule shows `Blocked` and `This bid qualifies and cannot be rejected while the rule is on.` Bid cents are 15_000_000 and value cents are 10_000_000.
- The preview region’s text does not include a transfer id. The test does not import `postLedgerEntry`.

Use `renderAt` and `deleteDatabaseForTests('touchline-os-test')`.

## 8. Verification commands

Run from the repository root:

```bash
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
- `pnpm test` includes the previous files plus `action-preview.test.tsx`.
- `pnpm test:e2e` still runs the three existing specs. This guide does not add a Playwright file.

## 9. Manual acceptance check

1. `pnpm dev`. Start the fictional demo, choose `Ashbridge`, and save Balanced on Constitution.
2. Open Finance. Capacity is `€5,000,000.00`.
3. Preview a paid signing with fee `6000000`, age `24`, wage `10000`, and tier Rotation. `Blocked` and the fee message are visible. `Preview only — no changes recorded.` is visible. `Record this action` does not activate.
4. Reload. The ledger still has one row. Capacity is unchanged.
5. Preview a wage change with the wage left blank. The result says the weekly wage is unknown. It does not say `€0.00` for that after-wage line.
6. Open Transfers. The preview banner is still there. Squad wage cells still say `Unknown`.

Keyboard: Tab to `Preview action` and press Enter. The same result appears.

## 10. Definition of done

- [ ] `previewAction` is the only before/after math, and it calls `evaluateAction`.
- [ ] The €6,000,000 preview shows the shortfall and writes nothing.
- [ ] A null wage previews as `Unknown`, not as zero.
- [ ] A qualifying rejection shows `Blocked`. An unknown value shows `Warning` and `allowed` stays true.
- [ ] `Record this action` is disabled and has no command handler.
- [ ] Transfers remains a preview. Squad wages remain `Unknown`.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase5.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5, and `plans/phase5/guide5.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase5.md`, or `e2e/finance.spec.ts`.

Suggested message:

```text
feat(p05-g05): explain rule impacts before commits
```

Do not commit when §8 is failing. Do not amend the `P05-G04` commit. After the commit succeeds, record its full SHA on the `P05-G05` row of the progress log in `plans/phase5.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P05-G06` locks the invariants and adds the browser journey. It should not change a threshold to make a test pass.

Known limitations this guide leaves on purpose:

- The preview does not load a player. Age, fee, wage, and bidder prestige are typed.
- `season-rollover` is not on the form.
- The record button cannot commit, including when the report is `allowed`.
