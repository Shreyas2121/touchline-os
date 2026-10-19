# P05-G03 — Club constitution rules

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.1, §5.2, and §12.2 invariants 2, 3, and 6.
- **Parent phase:** `plans/phase5.md`, guide **P05-G03**. The verdict table is phase §5 “Evaluation”. The work block is phase §6 `P05-G03`.
- **Predecessor guide:** `plans/phase5/guide2.md`.
- **Predecessor commit:** the commit whose subject is `feat(p05-g02): calculate auditable club finances`. Verify with `git log --grep="feat(p05-g02): calculate auditable club finances" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p05-g03): enforce club constitution rules`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase5.md` → this guide. This guide does not save a constitution, post a ledger row, or change a screen.

## 2. Goal and user-observable result

Nothing a person can click changes.

`evaluateAction` returns the same report for the same inputs. A €6,000,000 fee against €5,000,000 remaining is blocked. Age 27 is blocked on a paid signing and allowed on an exempt free signing. A €46,000 key wage is blocked. An unknown wage is blocked and is not described as zero.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P05-G02 sha> HEAD` succeeds, using the SHA from §1.
- `constitutionPreset`, `parsePolicyAction`, `PolicyAction`, and `PolicySnapshot` exist. `src/domain/rules/evaluate-action.ts` does not. If it does, stop and reconcile before editing.
- Do not edit `schemaV1`. Do not add a registration action to `PolicyAction`.
- Leave `MASTER_PLAN.md` and `plans/phase5.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase5.md` §5 “Evaluation”, and the `P05-G03` block in §6.
- `src/domain/rules/types.ts` — the action union and `RuleReport`.
- `src/domain/rules/presets.ts` — `constitutionPreset('balanced')`.
- `src/domain/finance/capacity.ts` — the tests pass a remaining-capacity number. This guide does not call `transferCapacity` from the evaluator. The caller computes it.
- `src/domain/validation/schemas.ts` — `Constitution` and `constitutionSchema`.
- `src/test/constitution-presets.test.ts` — how a full constitution object is built. Reuse that shape in this guide’s fixtures.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/rules/evaluate-action.ts` | `evaluateAction` |
| `src/test/evaluate-action.test.ts` | The verdict fixtures |

Do not edit `src/features/**`, `src/data/**`, or the preset numbers.

### Public API

```ts
export function evaluateAction(
  action: PolicyAction,
  snapshot: PolicySnapshot,
  constitution: Constitution,
  effectiveDate: DateOnly,
): RuleReport
```

`allowed` is false when any verdict has severity `BLOCK`. `snapshotRevision` copies `snapshot.revision`. Verdicts follow sell-to-buy, then age, then wage tier, then prestige. A disabled rule adds nothing. A passing check adds nothing. `effectiveDate` is accepted and is not read.

## 6. Implementation steps

1. Find each rule by `id` on `constitution.rules`. Do not assume the array index without checking the id.
2. A signing is free only when `action.type === 'incoming-transfer'`, `isFree` is true, and `feeCents` is 0. Any other incoming transfer is paid, including `isFree: true` with a nonzero fee.
3. Implement the codes, severities, messages, and remedies in phase §5 “Evaluation”. The wage-tier sentence interpolates the display word `Key`, `Rotation`, or `Youth`, so the €46,000 case reads `The weekly wage is above the Key cap.`
4. Capacity and age run only for `incoming-transfer`. Wage tier runs for `incoming-transfer` and `wage-change`. Prestige runs for `reject-offer` and `season-rollover`. Rollover uses only `UNRESOLVED_QUALIFYING_OFFER`.
5. The age exemption applies only to a free signing when `freeTransfersExempt` is true. A null age on an enabled age rule is `INSUFFICIENT_DATA` even when the signing is free.
6. Compare a qualifying fee with `BigInt(feeCents) * BigInt(requiredFeeDenominator) >= BigInt(marketValueCents) * BigInt(requiredFeeNumerator)`. Do not use a float. When `requireHigherPrestige` is true, bidder prestige must be greater than seller prestige. Equal prestige does not qualify. A bid that fails the test adds no prestige verdict.
7. `UNKNOWN_VALUATION` is `WARN`. Every other code in the phase table is `BLOCK`. A report that contains only that warning has `allowed: true`.
8. Evidence keys, using `null` for an unknown input:
   - Capacity codes: `feeCents`, `remainingCapacityCents`.
   - Age codes: `age`, `maxAge`.
   - Wage codes: `weeklyWageCents`, `squadTier`, and `capCents` when a tier cap was selected.
   - Prestige codes: `feeCents`, `marketValueCents`, `bidderPrestige`, `sellerPrestige`. `QUALIFYING_OFFER` also includes `requiredFeeNumerator` and `requiredFeeDenominator`.
   - Rollover: `unresolvedQualifyingOffers`.
9. Do not import Dexie, React, or `src/data`. Do not call `transferCapacity`, `wageCommitment`, or the clock inside `evaluateAction`.

## 7. Tests to add/change

`src/test/evaluate-action.test.ts` builds one Balanced constitution and a copy with `SELL_TO_BUY` disabled. `effectiveDate` is `2026-10-19`. `snapshot.revision` is 4. No database.

- Two calls with the same action, snapshot, constitution, and date deep-equal.
- Remaining 500_000_000 and fee 600_000_000, age 24, wage 1_000_000, tier `rotation`, `isFree: false`: one verdict, code `FEE_EXCEEDS_CAPACITY`, `allowed` false.
- Fee 100_000_000, age 24, wage 1_000_000, tier `rotation`: `allowed` true and `verdicts` empty.
- Fee 0, `isFree: true`, age 27, wage 1_000_000, tier `rotation`: no age verdict.
- The same age with `isFree: false` and fee 1: code `AGE_ABOVE_CAP`, message `Age 27 is above the cap of 26.`
- Age `null` on a paid signing: code `INSUFFICIENT_DATA` and message `Age is unknown, so this signing cannot be checked.`
- `wage-change` with `weeklyWageCents` 4_600_000 and tier `key`: code `WAGE_ABOVE_TIER_CAP`, message `The weekly wage is above the Key cap.`, evidence `capCents` 4_500_000.
- `wage-change` with `weeklyWageCents: null` and tier `key`: code `INSUFFICIENT_DATA`, evidence `weeklyWageCents` null.
- `wage-change` with wage 1_000_000 and `squadTier: null`: code `INSUFFICIENT_DATA` and message `Squad tier is unknown, so the wage cap cannot be checked.`
- `reject-offer` with market value 10_000_000, fee 15_000_000, bidder 80, seller 50: code `QUALIFYING_OFFER` and `allowed` false. Fee 14_999_999 produces no verdict. Bidder 50 against seller 50 produces no verdict.
- The same qualifying bid with `marketValueCents: null`: code `UNKNOWN_VALUATION`, severity `WARN`, `allowed` true.
- `season-rollover` with `unresolvedQualifyingOffers` 1: code `UNRESOLVED_QUALIFYING_OFFER`. With 0: no verdict.
- Disabling `SELL_TO_BUY` on the over-capacity signing removes the capacity verdict and leaves the other checks.
- `parsePolicyAction({ type: 'registration' })` is still `ok: false`. This file does not call `evaluateAction` with that object.
- Remaining capacity `null` on a paid signing: code `INSUFFICIENT_DATA` and message `Transfer capacity is unknown, so this fee cannot be checked.`

## 8. Verification commands

Run from the repository root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: each command exits 0. `pnpm test` includes the previous files plus `evaluate-action.test.ts`.

Do not run Playwright. This guide must not change a screen.

## 9. Manual acceptance check

There is no screen change. Constitution still says `Rules are not active in this build.`

The verdicts are proven by `src/test/evaluate-action.test.ts`.

## 10. Definition of done

- [ ] The same inputs return the same report.
- [ ] The fee, age, free-transfer, wage, unknown-wage, qualifying-bid, and unknown-valuation cases match §7.
- [ ] `effectiveDate` does not change a verdict. The function does not compute an age.
- [ ] There is still no registration action and no constitution write.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase5.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5, and `plans/phase5/guide3.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase5.md`, or later guide files.

Suggested message:

```text
feat(p05-g03): enforce club constitution rules
```

Do not commit when §8 is failing. Do not amend the `P05-G02` commit. After the commit succeeds, record its full SHA on the `P05-G03` row of the progress log in `plans/phase5.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P05-G04` stores the rules this function reads. It does not need to call `evaluateAction`.

`P05-G05` calls `evaluateAction` only through `previewAction`. The component must not restate these messages.

Known limitations this guide leaves on purpose:

- The function does not load a campaign, a ledger, or a player.
- Rollover is callable and has no screen.
- A disabled registration rule is ignored because no action selects it.
