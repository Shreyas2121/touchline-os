# P05-G06 — Financial policy invariants

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.3, §5.4, and §12.2 invariants 1, 2, 3, 4, and 6.
- **Parent phase:** `plans/phase5.md`, guide **P05-G06**. The data scenario and the browser journey are phase §6 `P05-G06`. The exit checks are phase §7 and §8.
- **Predecessor guide:** `plans/phase5/guide5.md`.
- **Predecessor commit:** the commit whose subject is `feat(p05-g05): explain rule impacts before commits`. Verify with `git log --grep="feat(p05-g05): explain rule impacts before commits" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `test(p05-g06): lock financial policy invariants`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase5.md` → this guide. This guide does not change a formula, a verdict message, or a screen except to fix a defect the new tests expose. A defect fix stays inside this commit only when it makes the existing contract true. Do not weaken an expected euro amount.

## 2. Goal and user-observable result

The financial properties are proven together, and a browser journey can adopt Balanced, see a blocked preview, post a prize, and reverse it:

- €10,000,000 of completed sales at 70% adds €7,000,000 of capacity.
- Age 27, a €46,000 key wage, and an unknown wage behave as Phase 5 already specified.
- A stale second post does not spend the prize twice. A reversal cannot be reversed again.
- After the journey, Finance still shows €5,000,000.00 and no incoming fee. Transfers still shows the preview banner. Squad wages still say `Unknown`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P05-G05 sha> HEAD` succeeds, using the SHA from §1.
- `evaluateAction`, `previewAction`, `transferCapacity`, `postLedgerEntry`, `reverseLedgerEntry`, `saveConstitution`, and `insertLedgerEntry` exist.
- `e2e/finance.spec.ts` does not exist. If it does, stop and reconcile before editing.
- `playwright.config.ts` has `reuseExistingServer: false` and no `storageState`. Leave it that way.
- Do not install `fast-check` or any other package. Do not edit `schemaV1` or `seedDemoCampaign`.
- Leave `MASTER_PLAN.md` and `plans/phase5.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase5.md` §6 `P05-G06`, §7, and §8.
- `src/domain/finance/capacity.ts` and `src/domain/rules/evaluate-action.ts` — expected results. Do not edit them to shrink a credit or drop a block.
- `src/data/repositories/ledger-entries.ts` — `insertLedgerEntry` is how the test records a sale the public post command must keep refusing.
- `src/data/commands/save-lineup.ts` — the lineup comparison uses the stored lineup, not the campaign revision.
- `src/test/ledger-commands.test.ts` — cleanup and the fixed clock `2026-10-19T00:00:00.000Z`.
- `e2e/tactics.spec.ts` — copy its fresh-context style. Do not add `storageState`.
- `src/test/fixtures/campaign.ts` — `harborInput`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/test/finance-invariants.test.ts` | The ten-step data scenario |
| `e2e/finance.spec.ts` | The phase-exit browser journey |

Do not edit the domain formulas or the Finance component unless a new test shows they already violate phase §5. If that happens, fix the implementation in this commit and say so in the progress-log note. Do not change the expected 700_000_000 credit.

## 6. Implementation steps

1. Add the data scenario in one `touchline-os-test` database. Clean up with `deleteDatabaseForTests` in `afterEach`. Use `harborInput` for campaign A. Create campaign B with different ids and no `preset`.
2. Create campaign A with `preset: 'balanced'` and the extra ids that command requires. Its remaining capacity is 500_000_000. `getActiveConstitution` for B is `undefined`.
3. Inside `runCommand`, insert a `player_sale` of 1_000_000_000 cents for A’s active season and managed club through `insertLedgerEntry`. In that same transaction, `updateCampaign` to the revision the runner passed in, and add one audit with `actionType` `ledger.post` and summary `Test sale`. Do not call `postLedgerEntry` for this row. Assert `saleCreditCents` is 700_000_000 and `authorizedCents` is 1_200_000_000. In a separate assertion, `postLedgerEntry` with `kind: 'player_sale'` returns `VALIDATION` and writes no row.
4. Evaluate a paid incoming transfer of age 27 and fee 1. The report contains `AGE_ABOVE_CAP`. Evaluate a free signing of age 27 with fee 0 and a wage under the cap. The report does not contain `AGE_ABOVE_CAP`.
5. Evaluate a key wage of 4_600_000. The report contains `WAGE_ABOVE_TIER_CAP`. Insert an active contract with `weeklyWageCents: null` through the table API. `wageCommitment` for the club has `unknownCount` at least 1 and does not increase `knownCents` by that null. Evaluating that null wage returns `INSUFFICIENT_DATA`.
6. Post prize income of 100_000_000 with the current revision. Post the same amount again with the revision from before that success. The second result is `CONFLICT`. The prize bucket counts 100_000_000 once.
7. Reverse the sale through `reverseLedgerEntry`. The sale credit becomes 0. Reverse that reversal and expect `VALIDATION` with message `This entry cannot be reversed.`
8. Add a ledger row for `seasonId` `season-other` with the table API, not through `postLedgerEntry`. It may use kind `player_sale` and amount 1_000_000_000. Season 1’s `transferCapacity` result is unchanged from the value after step 7.
9. `listLedgerEntries` and `getActiveConstitution` for B do not return A’s rows.
10. Before the constitution work in a second case, save a lineup, then save a constitution, then read the lineup again. The lineup deep-equals the first read. Campaign A in step 2 already saved a constitution at create, so use a campaign created without a preset for this comparison.
11. Add `e2e/finance.spec.ts` with the journey in §7. Set `test.setTimeout(120_000)`. Do not set `storageState`. Do not shrink the seed. Do not write a transfer from the spec.

The form speaks euros. `6000000` means €6,000,000.00. `10000` means €10,000.00. `1000000` means €1,000,000.00.

## 7. Tests to add/change

`src/test/finance-invariants.test.ts` covers §6 steps 2 through 10. Name the test `financial policy invariants`. Include one assertion that `postLedgerEntry` with `kind: 'player_sale'` is `VALIDATION`.

`e2e/finance.spec.ts` covers this journey, in order:

1. Open `/`. Start the fictional demo. Choose `Ashbridge`.
2. On the command center, transfer capacity is `Unknown`, and `page.locator('body')` does not contain `€`.
3. Open Constitution. The preview banner is absent. `Rules are not active in this build.` is absent. Save the default Balanced preset.
4. Reload. `Version 1` is visible. The sell-to-buy sales field, or the Balanced description shown before save, has already been saved; after reload the sales percent value is `70` and the age cap value is `26`.
5. Open Finance. The preview banner is absent. Transfer capacity is `€5,000,000.00`. The ledger shows `Opening allocation`.
6. Preview a paid signing with fee `6000000`, age `24`, weekly wage `10000`, and tier `Rotation`. `Blocked` and `The fee is above the remaining transfer capacity.` are visible. `Preview only — no changes recorded.` is visible.
7. Preview fee `1000000`, age `27`, wage `10000`, tier `Rotation`. `Age 27 is above the cap of 26.` is visible.
8. Preview fee `1000000`, age `24`, wage `10000`, tier `Rotation`. `No rule blocked this action.` is visible. `Record this action` is disabled.
9. Reload Finance. Capacity is `€5,000,000.00`. The ledger text does not include `Incoming fee`.
10. Post prize amount `1000000` and leave the effective date as shown. Capacity becomes `€6,000,000.00`. Reverse that prize. Capacity returns to `€5,000,000.00`.
11. Open Transfers. The preview banner is visible.
12. Open Squad. The preview banner is absent. A wage cell reads `Unknown`.

Do not add the journey to `smoke.spec.ts`. The existing three specs stay green.

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
- `pnpm test` includes the previous files plus `finance-invariants.test.ts`.
- `pnpm test:e2e` includes `e2e/smoke.spec.ts`, `e2e/demo-journey.spec.ts`, `e2e/tactics.spec.ts`, and `e2e/finance.spec.ts`.

This is the phase exit. The manual pass in `plans/phase5.md` §8 is also required before the phase is marked complete. That pass is not a substitute for these commands.

## 9. Manual acceptance check

Run `plans/phase5.md` §8 “Manual browser pass”, steps 1 through 12. In particular:

- An unadopted demo command center has no euro sign.
- After Balanced, Finance shows `€5,000,000.00`.
- The €6,000,000 preview is blocked and does not survive reload as a fee.
- Prize income of €1,000,000.00 raises capacity to €6,000,000.00, and reversing it restores €5,000,000.00.
- Transfers keeps the preview banner. Squad wages stay `Unknown`.
- Harbor created with the default preset does not change the demo’s capacity.
- Resetting the demo clears the demo constitution and leaves Harbor’s constitution in place.

`pnpm build && pnpm preview`, then repeat the save, the blocked preview, and the prize post on the preview origin.

## 10. Definition of done

- [ ] The data scenario proves the 70% credit, the age exemption, the €46,000 key wage, the null wage, the stale prize post, the reversal, the other season, and campaign isolation.
- [ ] A constitution save does not change a stored lineup.
- [ ] `postLedgerEntry` still refuses `player_sale`.
- [ ] The browser journey passes without a smaller seed and without `storageState`.
- [ ] No threshold, message, or preset number was weakened to make a test pass.
- [ ] `schemaV1` is unchanged. No package was added.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase5.md` have no edits in this commit.

## 11. Commit instructions

Stage `src/test/finance-invariants.test.ts`, `e2e/finance.spec.ts`, and `plans/phase5/guide6.md` if this guide is still untracked. Stage an implementation fix only when §6 required one, and only the files that fix the contract.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase5.md`.

Suggested message:

```text
test(p05-g06): lock financial policy invariants
```

Do not commit when §8 is failing. Do not amend the `P05-G05` commit. After the commit succeeds, record its full SHA and the check evidence on the `P05-G06` row of the progress log in `plans/phase5.md` §10. Mark the phase exit checklist there only when phase §7 and §8 are true. That log edit is not part of this commit.

## 12. Handoff

Phase 6 may call `evaluateAction` again inside a transfer or contract command. It inserts `player_sale` and `incoming_fee` with `insertLedgerEntry`. It does not widen `postLedgerEntry`. It may enable `Record this action` only when that command exists and the fresh report has no `BLOCK`.

Known limitations this phase leaves on purpose:

- Squad wage cells stay `Unknown`.
- Registration is stored and not evaluated.
- The demo seed still has no constitution until someone saves one.
- Season rollover and `approved_carryover` are not on a screen.
- Import, backup, and the PWA plugin are not part of this work.
