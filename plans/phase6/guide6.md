# P06-G06 — Controlled market workflows

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §12.2 invariants 4, 5, 6, and 10, and the Phase 6 exit in §9.
- **Parent phase:** `plans/phase6.md`, guide **P06-G06**. The data scenario and the browser journey are phase §6 `P06-G06`. The exit checks are phase §7 and §8.
- **Predecessor guide:** `plans/phase6/guide5.md`. `P06-G03` must also be an ancestor, because this guide accepts and rejects offers.
- **Predecessor commit:** the commit whose subject is `feat(p06-g05): validate squad registration`. Verify with `git log --grep="feat(p06-g05): validate squad registration" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `test(p06-g06): verify controlled market workflows`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase6.md` → this guide. This guide does not change a formula, a verdict message, or a screen except to fix a defect the new tests expose. A defect fix stays inside this commit only when it makes the existing contract true. Do not weaken the €7,000,000 credit or the €45,000 cap.

## 2. Goal and user-observable result

The market rules are proven together, and a browser journey can shortlist a player, see a blocked signing, and see a registration blocker:

- A purchase above the remaining capacity writes nothing.
- A €10,000,000 sale stores the gross fee and credits €7,000,000.
- The same purchase then succeeds once. A stale retry does not charge it again.
- A qualifying offer stays open when rejected.
- An unknown homegrown flag writes no registration. Supplying the flag does.
- After the journey, the shortlist remains, Scouting still shows the preview banner, and Finance Record stays disabled.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P06-G05 sha> HEAD` succeeds, using the SHA from §1.
- `recordTransfer`, `recordOffer`, `rejectOffer`, `acceptOffer`, `saveContract`, and `saveRegistration` exist.
- `e2e/transfers.spec.ts` does not exist. If it does, stop and reconcile before editing.
- `playwright.config.ts` has no `storageState`. Leave it that way.
- Do not install a package. Do not edit `schemaV1`, `DATABASE_VERSION`, or `seedDemoCampaign`.
- Leave `MASTER_PLAN.md` and `plans/phase6.md` unchanged in this commit. Stage this guide only. Do not stage unrelated Phase 6 guide files that are already committed.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase6.md` §6 `P06-G06`, §7, and §8.
- `src/data/commands/record-transfer.ts`, `reject-offer.ts`, and `save-registration.ts` — expected messages. Do not edit them to drop a block.
- `src/domain/finance/capacity.ts` — 70% stays `Math.floor(gross * percent / 100)`.
- `src/data/commands/save-lineup.ts` — the departure test saves a lineup before the sale.
- `src/data/repositories/clubs.ts` — `insertClub` for the buyer. `createCampaign` only creates the managed club.
- `src/test/fixtures/campaign.ts` — `harborInput`.
- `src/test/record-transfer.test.ts` — cleanup and the fixed clock `2026-10-19T00:00:00.000Z`.
- `e2e/finance.spec.ts` — copy its fresh-context style and the `kpi` helper if one exists. Do not add `storageState`.
- `src/features/finance/ActionPreview.tsx` — `Record this action` is still disabled.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/test/market-workflows.test.ts` | The nine-step data scenario |
| `e2e/transfers.spec.ts` | The phase-exit browser journey |

Do not edit the domain formulas or the transfer commands unless a new test shows they already violate phase §5. If that happens, fix the implementation in this commit and say so in the progress-log note. Do not change the expected 700_000_000 credit.

## 6. Implementation steps

1. Add one `touchline-os-test` scenario. Clean up with `deleteDatabaseForTests` in `afterEach`. Use the fixed timestamp `2026-10-19T00:00:00.000Z` and date `2026-10-19`. Do not call `systemClock()`.
2. Create campaign A with `preset: 'balanced'` and the extra constitution and ledger ids. Create campaign B with different ids and no preset. In A, insert a second club and add three players through `addPlayer`: one at the managed club, one at the second club, and one free agent. Give the managed player a birth date that makes `displayAge` 24, a market value of 10_000_000 cents, and one active contract. Save a lineup that names that player.
3. `recordTransfer` purchases the second club's player for 600_000_000 cents at rotation wage 1_000_000. The result is `VALIDATION`. `clubId`, the ledger count, and the revision are unchanged.
4. `recordTransfer` sells the managed player for 1_000_000_000 cents to the second club. `transferCapacity` `saleCreditCents` is 700_000_000. The ledger `amountCents` is 1_000_000_000. `clubId` is the buyer. The managed contract is `ended`. The lineup no longer names the player.
5. Repeat the purchase from step 3 with the revision returned by the sale. It succeeds and writes one `incoming_fee`. Call it again with the revision from before that success. The result is `CONFLICT` and message `Campaign revision is stale.` The incoming-fee count stays 1.
6. Put a player back at the managed club, or use the free agent after a free signing that returns them to the managed squad, and record a qualifying offer: bidder prestige above the seller, fee 15_000_000, market value 10_000_000. `rejectOffer` leaves `status` `open`. `acceptOffer` then writes one sale and one accepted offer. The accept audit type is `offer.accept`. There is not a second `transfer.record` audit for that accept.
7. `saveContract` with key wage 4_600_000 writes nothing. `saveContract` with rotation wage 1_000_000 succeeds. Format that wage with `formatMoneyEuros` and expect `€10,000.00`.
8. `saveRegistration` for one non-exempt registered player with both homegrown flags null writes nothing and returns the unknown-homegrown message. The same player with `homegrownClub: true` still fails the Balanced minimum of 8 if that is the only homegrown player. Then submit eight non-exempt homegrown registered players and expect `ok`, provenance `user-entered`, and no partial row from the failed call. The failed call's registration count is 0.
9. `listTransfers`, `listOffers`, `listContractsByClub`, and `listRegistrations` for B do not include A's rows.
10. Drive a `recordTransfer` path that throws after a write inside the transaction, using the same `ABORTED` technique as `src/test/ledger-commands.test.ts`. Revision and `clubId` match the pre-command state. If the only way to throw is a test double around a repository used by the command, keep that double local to this test and restore it.
11. Add `e2e/transfers.spec.ts` with the journey in §7. Set `test.setTimeout(120_000)`. Do not set `storageState`. Do not shrink the seed. Do not hardcode a generated player name. Do not turn a rule off.

The form speaks euros. `6000000` means €6,000,000.00. `10000` means €10,000.00.

## 7. Tests to add/change

`src/test/market-workflows.test.ts` covers §6 steps 2 through 10. Name the test `controlled market workflows`. Include the 700_000_000 assertion and the qualifying-offer assertion in that test, not only in the earlier guide files.

`e2e/transfers.spec.ts` covers this journey, in order:

1. Open `/`. Start the fictional demo. Choose `Ashbridge`.
2. Open Transfers. The preview banner is absent. Fill `Player search` with one character. `Search the player pool to plan a move.` is visible.
3. Search with at least two characters. In the list named `Search results`, choose the first row whose text does not include `Ashbridge`. If every visible row is Ashbridge, try another two-letter query until one is not. Click `Add to shortlist`. Reload. `On the shortlist` is visible.
4. Open that shortlist row's scenario as `Incoming purchase` with fee `6000000` and tier `Rotation`. Before a constitution exists, `No constitution is saved, so no rule was checked.` and `Preview only — no changes recorded.` are visible. Do not click Record.
5. Open Constitution and save the default Balanced preset. Return to Transfers and preview the same fee. `Blocked` and `The fee is above the remaining transfer capacity.` are visible. The button `Record this transfer` is disabled.
6. Open Squad. A minutes cell reads `Unknown`.
7. Open Registration. The preview banner is absent. `These checks are your saved challenge rules. They do not certify a real competition.` is visible. Preview a selection that is empty or left on `Unknown`. A blocker is visible. `Saved registration.` is absent.
8. Reload Transfers. The shortlisted player is still listed. `No completed deals for this season.` is visible.
9. Open Scouting. The preview banner is visible.
10. Open Finance. The button `Record this action` is disabled.

Do not complete a sale in this spec. The Vitest scenario owns the €7,000,000 figure.

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

Expected: each command exits 0. `pnpm test` includes the previous files plus `market-workflows.test.ts`. `pnpm test:e2e` includes the existing specs plus `e2e/transfers.spec.ts`.

This guide does not replace the manual pass in `plans/phase6.md` §8. Run that pass before calling the phase done. The 12 browser steps there are the phase exit, not a substitute for §8 of this guide.

## 9. Manual acceptance check

The automated journey in §7 is the check for this guide. In addition, on the same demo save:

1. Confirm Finance `Record this action` is disabled.
2. Confirm Transfers has no control whose name turns off `SELL_TO_BUY`, `MAX_SIGNING_AGE`, `WAGE_TIER_CAP`, `PRESTIGE_BID_SALE`, or `REGISTRATION_QUOTA`.
3. Open `/app/does-not-exist/transfers`. The missing-campaign state is visible and the squad link is absent.

## 10. Definition of done

- [ ] The data scenario proves the blocked purchase, the 70% credit, the single stale retry, the qualifying rejection, the wage cap, and the homegrown correction.
- [ ] Campaign B cannot read campaign A's market rows.
- [ ] The browser journey shortlists a player, blocks the €6,000,000 preview after Balanced is saved, and blocks an incomplete registration.
- [ ] No expected euro amount or verdict message was weakened.
- [ ] `schemaV1` is unchanged. No package was added. The seed was not shrunk.
- [ ] The §8 commands exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase6.md` have no edits in this commit.

## 11. Commit instructions

Stage `src/test/market-workflows.test.ts`, `e2e/transfers.spec.ts`, any defect fix required to make those tests match phase §5, and `plans/phase6/guide6.md` if it is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase6.md`.

Suggested message:

```text
test(p06-g06): verify controlled market workflows
```

Do not commit when §8 is failing. After the commit succeeds, record its full SHA and the check results on the `P06-G06` row of the progress log in `plans/phase6.md` §10. That log edit is not part of this commit. The phase is not done until the exit checklist in that section is true.

## 12. Handoff

Phase 7 may assume every handoff bullet in `plans/phase6.md` §10. In particular:

- Registration is evaluated. Match entry is a new command.
- `countUnresolvedQualifyingOffers` is the rollover count. This phase never called it from a screen.
- `postLedgerEntry` still refuses sale, incoming-fee, carryover, and reversal kinds.
- Squad minutes are still `Unknown`.
- A leftover qualifying offer can outlive the player's departure. Rollover must keep blocking.

Phase 7 must not add backup import, scouting charts, or the PWA plugin.
