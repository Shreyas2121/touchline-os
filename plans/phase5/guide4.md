# P05-G04 — Finances and rule settings

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.2, §5.3, §7.1, and §7.2.
- **Parent phase:** `plans/phase5.md`, guide **P05-G04**. The save, the screens, the banner, and the create-campaign preset are phase §5 “Constitution save” and “Screens”. The work block is phase §6 `P05-G04`.
- **Predecessor guide:** `plans/phase5/guide3.md`.
- **Predecessor commit:** the commit whose subject is `feat(p05-g03): enforce club constitution rules`. Verify with `git log --grep="feat(p05-g03): enforce club constitution rules" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p05-g04): expose finances and rule settings`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase5.md` → this guide. This guide does not render a rule verdict and does not record a transfer.

## 2. Goal and user-observable result

- Constitution on a campaign with no saved rules offers Balanced, Strict Moneyball, and Custom. Saving Balanced shows version 1 after reload and posts one opening allocation of €5,000,000.00.
- Finance shows that capacity, a wage pyramid, and the ledger. Prize income can be posted and reversed.
- The command center shows the same capacity and wage figures. An unadopted demo still shows `Unknown` and no euro sign.
- Squad wage cells stay `Unknown`. Transfers still shows `Static preview — not save data`. Constitution no longer says `Rules are not active in this build.`

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P05-G03 sha> HEAD` succeeds, using the SHA from §1.
- `postLedgerEntry`, `reverseLedgerEntry`, `transferCapacity`, `formatCapacity`, `wageCommitment`, `formatWageCommitment`, `displayLedgerKind`, and `constitutionPreset` exist. `src/data/commands/save-constitution.ts` does not. If it does, stop and reconcile before editing.
- `playwright.config.ts` has `reuseExistingServer: false` and no `storageState`. Leave it that way.
- Do not edit `schemaV1`, `seedDemoCampaign`, or `src/domain/player/squad-view.ts`.
- Leave `MASTER_PLAN.md` and `plans/phase5.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase5.md` §5 “Constitution save”, “Screens”, and “Banner”, and the `P05-G04` block in §6.
- `src/features/finance/FinancePage.tsx` and `src/features/constitution/ConstitutionPage.tsx` — the previews this guide replaces.
- `src/features/squad/SquadPage.tsx` — the campaign load, `campaign.select-club` redirect, and failure sentence. Copy that shape. Do not refactor it onto a shared hook.
- `src/features/dashboard/CommandCenterPage.tsx` — capacity and weekly wages are the literal `Unknown`.
- `src/features/campaigns/CampaignManager.tsx` — `createCampaign` input around the create panel. The three name fields stay.
- `src/data/commands/create-campaign.ts` — one transaction, one `campaign.create` audit, revision 1. Callers that omit a preset must keep that result.
- `src/data/commands/post-ledger-entry.ts` — do not widen its kind enum. The constitution command calls `insertLedgerEntry` in the same transaction instead of calling `postLedgerEntry`, so the revision is bumped once.
- `src/app/layout/WorkspaceLayout.tsx` — the banner is already omitted for command center, choose-club, squad, and tactics.
- `src/app/copy.ts` — `constitutionNote`, `staleSave`, `previewBanner`.
- `src/components/ui/KpiRibbon.tsx` and `src/components/ui/StatusPill.tsx`.
- `src/test/render.tsx` — `renderAt` uses `touchline-os-test`.
- `src/test/fixtures/campaign.ts` — `harborInput`. Do not add `preset` to that object.
- `src/test/command-center.test.tsx` — the demo render forbids `€`.
- `e2e/smoke.spec.ts`, `e2e/demo-journey.spec.ts`, `e2e/tactics.spec.ts` — each still expects `constitutionNote` and the preview banner on Constitution.
- `README.md` — the local-database paragraph.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/data/commands/save-constitution.ts` | `saveConstitution` |
| `src/data/commands/create-campaign.ts` | Optional preset, same write helper |
| `src/domain/validation/schemas.ts` | Allow `constitution.save` |
| `src/features/constitution/ConstitutionPage.tsx` | Preset chooser and editor |
| `src/features/finance/FinancePage.tsx` | Capacity, pyramid, ledger, prize, reverse |
| `src/features/finance/WagePyramid.tsx` | Four tiers and cap text |
| `src/features/finance/LedgerTable.tsx` | Ledger rows and the reverse panel |
| `src/features/dashboard/CommandCenterPage.tsx` | Capacity and wage KPIs |
| `src/features/campaigns/CampaignManager.tsx` | Constitution select, default Balanced |
| `src/app/layout/WorkspaceLayout.tsx` | No preview banner on finance or constitution |
| `src/app/copy.ts` | Loading and failure sentences. Remove `constitutionNote` when unused |
| `src/test/save-constitution.test.ts` | Versions, allocation, create preset |
| `src/test/finance-page.test.tsx` | Pyramid, squad wages, empty capacity |
| `src/test/command-center.test.tsx` | Unadopted demo stays free of euros |
| `e2e/smoke.spec.ts`, `e2e/demo-journey.spec.ts`, `e2e/tactics.spec.ts` | Banner witness moves to Transfers |
| `README.md` | Constitution and ledger writes |

Do not add `ActionPreview`. Do not call `evaluateAction` from a feature. Do not change the Squad wage column.

### Public API

```ts
export function saveConstitution(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Constitution>>
```

The input is strict: `campaignId`, `constitutionId`, `expectedRevision`, `now`, `auditEventId`, `actionId`, `ledgerEntryId`, `effectiveOn`, and `rules` (the five-rule array from `constitutionSchema`). `createCampaign` gains optional `preset: 'balanced' | 'strict' | 'custom'`. When `preset` is present, `constitutionId`, `constitutionActionId`, and `ledgerEntryId` are required. When it is absent, those keys are omitted and the old input still parses.

## 6. Implementation steps

1. Put the shared write in `save-constitution.ts` as a function that runs inside an existing transaction. It inserts the next constitution version, optionally inserts one opening allocation, writes the `constitution.save` audit, and does not call `runCommand` or `updateCampaign`. `saveConstitution` and the preset branch of `createCampaign` both call it.
2. Version is 1 when `listConstitutions` is empty, otherwise one more than the highest version. Insert with the caller-supplied `constitutionId`. Do not update an older row.
3. Post the allocation only when no non-reversed `initial_allocation` exists for the active season and `managedClubId`, and the saved `SELL_TO_BUY` rule is enabled. Amount is that rule’s `initialAllocationCents`. `effectiveOn` is the caller’s date. For `createCampaign`, that date is `now.slice(0, 10)` parsed as a `DateOnly`. `sourceActionId` is the constitution action id. `note` is null. Kind is `initial_allocation`. A disabled sell-to-buy rule does not post. A later save does not post again.
4. The audit summary is `Saved constitution version ${n}`. `actionType` is `constitution.save`. `saveConstitution` then `updateCampaign` with the revision from `runCommand`. One audit covers the save even when an allocation was inserted. The transaction tables are `constitutions`, `ledgerEntries`, `seasons`, `campaigns`, and `auditEvents`.
5. A stale revision returns `CONFLICT`. A rule array that fails `constitutionSchema` returns `VALIDATION` and message `Command input is not valid.` The active season must exist. `CONFLICT` on the page uses `staleSave`.
6. `createCampaign` lists `constitutions` and `ledgerEntries` in its transaction only when `preset` is present. It still writes the club, season, campaign, and `campaign.create` audit. It then runs the shared write. Balanced and Strict post the allocation. Custom does not. The campaign revision stays the revision `runCommand` already assigned. Do not bump it a second time.
7. Constitution page load follows `SquadPage`: redirect a seeded campaign with no `campaign.select-club` audit, show `Loading constitution.` while the read is in flight, and show `This constitution could not be loaded. Reload and try again.` with `role="alert"` on failure. A missing active season shows that failure sentence.
8. With no constitution, render heading `Choose a constitution`, select label `Preset`, options `Balanced`, `Strict Moneyball`, and `Custom`, initial value `Balanced`, the three descriptions from phase §5, and button `Save constitution`. Saving calls `constitutionPreset` for the selected name. Generate ids and `now` at the UI edge.
9. With a constitution, render `Version ${n}` and one group per rule in preset order. The heading is the rule id. The checkbox label is `Enabled`. Use the five description sentences from phase §5. Fields are `Sales percent`, `Prize percent`, `Carryover percent`, `Opening allocation`, `Age cap`, `Free transfers are exempt`, `Key cap`, `Rotation cap`, `Youth cap`, `Required fee numerator`, `Required fee denominator`, `Require higher prestige`, `Roster limit`, `Minimum homegrown`, `Age exemption`, and `Competition`. Money fields go through `parseMoneyCents`. An invalid money field shows `invalidMoneyMessage` and does not call the command. Helper: `Saving writes a new version. It does not change lineups, players, or transfers.` Success text: `Saved constitution version ${n}.`
10. Remove `Rules are not active in this build.` from the constitution screen. Delete the `constitutionNote` export when no remaining import uses it, and update those imports in this same commit.
11. Finance uses the same load and redirect. Copy: `Loading finance.` and `This finance page could not be loaded. Reload and try again.` With no constitution, the capacity KPI is `Unknown` and the wage KPI is the commitment of the club’s contracts, which is `€0.00` when there are none. With a constitution, capacity is `formatCapacity(transferCapacity(...).remainingCents)` using the sell-to-buy percentages, or 0 and 0 when that rule object is missing. Show `Opening allocation does not match the constitution. Capacity uses the ledger.` only when sell-to-buy is enabled and `initialAllocationCents` on the rule differs from the breakdown’s `initialAllocationCents`.
12. `WagePyramid` caption is `Wage pyramid`. Rows are `Key`, `Rotation`, `Youth`, and `Unknown tier`. Each row shows the count and `formatWageCommitment` of that tier. The cap text is `Cap ${formatMoneyEuros(cap)}` when the wage rule is enabled, otherwise `Cap not set`. The Unknown tier has no cap amount. An enabled rule shows `StatusPill` tone `blocked` on a tier with a known wage above its cap or with a null wage. The word `Blocked` comes from the pill. When no active contract exists, also show `No active contracts are recorded.`
13. `LedgerTable` caption is `Ledger`. Columns are `Date`, `Kind`, `Amount`, and `Note`. Kind is `displayLedgerKind`. Amount is `formatMoneyEuros`. Empty copy is `No ledger entries for this season.` A row whose kind is not `reversal` and which is not already reversed has button `Reverse ${displayLedgerKind(kind)}`. The panel has label `Reversal note` and confirm button `Reverse entry`. Escape closes it without writing. Success text is `Reversed ledger entry.` A `VALIDATION` message from the command is shown as that message.
14. Prize form labels are `Prize amount`, `Effective date`, and `Note`. The date input may start as the `DateOnly` taken from `systemClock()` at render. The command receives that value. Button `Post prize income`. Success text is `Posted prize income.` Disable the submit control while the command runs. Empty note is stored as null. Invalid money does not call the command.
15. Command center loads the active constitution, that season’s ledger for the managed club, and `listContractsByClub`. It does not call `listPlayers` for the whole campaign. Registration stays the literal `Unknown`. Do not render `Blocked`, `Warning`, `Informational`, or `Passed` on this page.
16. The create panel’s select is labeled `Constitution`, id `constitution-preset`, default `balanced`. Submitting the existing Save control sends that preset and new ids from `createEntityId()`.
17. `WorkspaceLayout` also omits `previewBanner` when the path ends with `/finance` or `/constitution`.
18. In the three e2e specs, stop expecting `constitutionNote`. Constitution on the demo, before anyone saves, shows `Choose a constitution` and does not show `previewBanner`. The preview banner assertion moves to Transfers. Keep the demo-journey assertion that the command center body has no `€` before a constitution is saved. Do not save a constitution inside `demo-journey.spec.ts` or `tactics.spec.ts`.
19. Replace the README local-database paragraph with: creating a campaign, opening the fictional demo, renaming, archiving, deleting, correcting a player, saving a development note, saving a tactics lineup, saving a constitution, posting an opening allocation, posting prize income, and reversing a ledger entry write to `touchline-os`. Transfers, registration, scouting, matches, seasons, import, and backup remain previews. Keep the sentence that the demo asks for a club once and reset replaces only that demo.

## 7. Tests to add/change

`src/test/save-constitution.test.ts`, database `touchline-os-test`:

- `saveConstitution` on Harbor writes version 1, one `constitution.save` audit, and one opening allocation of 500_000_000 when the rules are `constitutionPreset('balanced')`. A second save with the same rules writes version 2, leaves the version 1 row in `listConstitutions`, adds no ledger row, and bumps revision by 1 again.
- The same command with `constitutionPreset('custom')` on a fresh campaign writes the constitution and no ledger row.
- A stale `expectedRevision` returns `CONFLICT` and leaves the version count unchanged.
- `createCampaign(harborInput)` still writes one audit and `getActiveConstitution` returns `undefined`.
- `createCampaign` with `preset: 'balanced'` plus the three new ids writes the constitution, the allocation, `campaign.create`, and `Saved constitution version 1`.
- Saving a constitution after `saveLineup` leaves the lineup object deep-equal.

`src/test/finance-page.test.tsx`:

- Render Harbor with no constitution at `/app/campaign-a/finance`. Capacity reads `Unknown`. The preview banner is absent.
- Create a campaign with `preset: 'balanced'` and render Finance. The text includes `€5,000,000.00` and `No active contracts are recorded.`
- Insert one active contract on that club with `weeklyWageCents` 4_600_000 and `squadTier` `'key'`, through `database.contracts.add` in the test, not through a new command. The pyramid shows `Blocked` and `€46,000.00`. Render `/app/${id}/squad` and assert a wage cell is still the literal `Unknown`.
- Render `/app/campaign-a/transfers` and expect `previewBanner`.

`src/test/command-center.test.tsx`:

- The existing unadopted demo assertion still finds `Unknown` for transfer capacity and weekly wages, and the container text still does not match `€`.
- A campaign created with `preset: 'balanced'` shows `€5,000,000.00` and weekly wages `€0.00`. The container text does not match `Blocked`.

Update the three Playwright specs as in §6 step 18. `e2e/demo-journey.spec.ts` can keep filling only the three name fields. The new select has a default, so Save still submits Balanced for Harbor. Do not assert that Harbor’s command center is free of `€`.

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
- `pnpm test` includes the previous files plus `save-constitution.test.ts` and `finance-page.test.tsx`.
- `pnpm test:e2e` runs `e2e/smoke.spec.ts`, `e2e/demo-journey.spec.ts`, and `e2e/tactics.spec.ts`.

## 9. Manual acceptance check

1. `pnpm dev`. Start the fictional demo and choose `Ashbridge`.
2. The command center transfer capacity is `Unknown`. The page text has no `€`.
3. Open Constitution. `Choose a constitution` is visible. The preview banner is absent. `Rules are not active in this build.` is absent. Save the default Balanced preset. Reload. `Version 1` is visible.
4. Open Finance. Capacity is `€5,000,000.00`. The ledger has one opening allocation. The pyramid says `No active contracts are recorded.`
5. Post prize `1000000`. Capacity becomes `€6,000,000.00`. Reverse that prize. Capacity returns to `€5,000,000.00`.
6. Open Transfers. The preview banner is visible. Open Squad. A wage cell reads `Unknown`.
7. Create `Harbor` / `Harbor Athletic` / `HAR` without touching the constitution select. Harbor’s command center shows `€5,000,000.00`. The demo capacity is unchanged after switching back.

There is no action preview on Finance yet.

## 10. Definition of done

- [ ] Balanced saves version 1 and one opening allocation. A second save keeps version 1 and does not post again.
- [ ] Custom and a create call without `preset` write no allocation. Create with `balanced` does.
- [ ] Finance and the command center share `formatCapacity` and `formatWageCommitment`.
- [ ] Squad wage cells stay `Unknown` while the pyramid can show `Blocked`.
- [ ] Finance and Constitution have no preview banner. Transfers still has it.
- [ ] The unadopted demo command center has no euro sign.
- [ ] A constitution save does not change a lineup.
- [ ] `schemaV1` and `seedDemoCampaign` are unchanged.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase5.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5, and `plans/phase5/guide4.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase5.md`, or later guide files.

Suggested message:

```text
feat(p05-g04): expose finances and rule settings
```

Do not commit when §8 is failing. Do not amend the `P05-G03` commit. After the commit succeeds, record its full SHA on the `P05-G04` row of the progress log in `plans/phase5.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P05-G05` adds the preview region under the ledger. It can read the capacity, wages, constitution, and club prestige this page already loaded. It must not enable a control that writes a transfer.

Known limitations this guide leaves on purpose:

- No verdict is visible. `evaluateAction` is still unused by the UI.
- `Record this action` does not exist yet.
- Registration on the command center is still `Unknown`.
- The demo seed still writes no constitution. Reset deletes one that was saved on `demo`.
