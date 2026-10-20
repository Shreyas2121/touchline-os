# P06-G02 — Record completed player moves

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §4.4, §5.3, §5.4, and §12.2 invariants 4 and 5.
- **Parent phase:** `plans/phase6.md`, guide **P06-G02**. The transfer table is phase §5 “Completed transfer”.
- **Predecessor guide:** `plans/phase6/guide1.md`.
- **Predecessor commit:** the commit whose subject is `feat(p06-g01): plan transfer scenarios`. Verify with `git log --grep="feat(p06-g01): plan transfer scenarios" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p06-g02): record completed player moves`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase6.md` → this guide. This guide does not record an offer or a registration. It does not teach `postLedgerEntry` to accept `player_sale` or `incoming_fee`.

## 2. Goal and user-observable result

Transfers can record a purchase, a free signing, a sale, or a free departure.

- A blocked purchase leaves the player, the ledger, the contracts, and the revision unchanged.
- A stored sale keeps the gross fee. Capacity then credits 70% through the existing calculator.
- A free signing writes no fee row.
- Finance `Record this action` stays disabled.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P06-G01 sha> HEAD` succeeds, using the SHA from §1.
- `saveShortlistItem`, `previewOutgoingSale`, and the disabled `Record this transfer` button exist.
- `insertLedgerEntry` exists. `postLedgerEntry` still rejects `player_sale`.
- Do not install a package. Do not edit `schemaV1` or `DATABASE_VERSION`.
- Leave `MASTER_PLAN.md` and `plans/phase6.md` unchanged in this commit. Stage this guide only, not the other uncommitted Phase 6 guides.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase6.md` §5 “Completed transfer” and the `P06-G02` block in §6.
- `src/domain/validation/schemas.ts` — `transferSchema`, `contractSchema`, `ledgerEntrySchema`. A free transfer already requires `feeCents === 0`. One of `fromClubId` or `toClubId` is required.
- `src/data/commands/post-ledger-entry.ts` — the kind union is still `initial_allocation` or `prize_income`. Copy its `PersistenceError('SCOPE', message)` pattern for a rule failure.
- `src/data/repositories/ledger-entries.ts` — `insertLedgerEntry`.
- `src/data/repositories/players.ts` — `updateStoredPlayer`.
- `src/data/repositories/lineups.ts` — `listLineups`, `updateLineup`.
- `src/data/repositories/contracts.ts` — `listContractsByClub` only.
- `src/domain/rules/evaluate-action.ts` — incoming rules. Do not change their messages.
- `src/domain/player/squad-view.ts` — `displayAge`. The command recomputes age. It does not take an age field.
- `src/features/transfers/ScenarioPreview.tsx` and `src/features/finance/ActionPreview.tsx`.
- `src/test/ledger-commands.test.ts` — the assertion that `postLedgerEntry` rejects `player_sale`.

`src/data/commands/record-offer.ts` does not exist. Do not create it.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/data/repositories/transfers.ts` | `listTransfers`, `insertTransfer` |
| `src/data/repositories/contracts.ts` | `listContractsByPlayer`, `insertContract`, `updateContract` |
| `src/data/commands/record-transfer.ts` | `recordTransfer` |
| `src/features/transfers/ScenarioPreview.tsx` | Enable Record and add the free departure |
| `src/features/finance/ActionPreview.tsx` | Sentence only |
| `src/domain/validation/schemas.ts` | Audit type `transfer.record` only |
| `src/test/record-transfer.test.ts` | Atomic success and rollback |
| `README.md` | Completed transfers |

### Public API

```ts
export function recordTransfer(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Transfer>>
```

Strict input:

- `campaignId`, `expectedRevision`, `now`, `seasonId`, `playerId`, `effectiveOn`
- `direction`: `'purchase' | 'free-in' | 'sale' | 'free-out'`
- `feeCents`
- `weeklyWageCents`: nonnegative integer or null
- `squadTier`: `'key' | 'rotation' | 'youth'` or null
- `startsOn`, `expiresOn`: `DateOnly` or null
- `destinationClubId`: id or null
- `transferId`
- `ledgerEntryId`: id or null
- `contractId`: id or null
- `auditEventId`, `actionId`
- `acknowledgedWarnings`: boolean

Parse rules, before the transaction, all failing as `VALIDATION` with message `Command input is not valid.`:

- `purchase` and `sale` require `feeCents > 0`. `free-in` and `free-out` require `feeCents === 0`.
- `purchase` requires `ledgerEntryId` and `contractId`.
- `free-in` requires `contractId` and `ledgerEntryId === null`.
- `sale` requires `ledgerEntryId`, `destinationClubId`, and `contractId === null`.
- `free-out` requires `ledgerEntryId === null`, `destinationClubId === null`, and `contractId === null`.

`listTransfers(database, campaignId, seasonId)` returns that campaign and season only.

## 6. Implementation steps

1. Add the transfer repository. `insertTransfer` rejects a foreign `campaignId` with `PersistenceError`. Parse with `transferSchema` before insert.
2. Add `listContractsByPlayer` on `[campaignId+playerId]`. Add `insertContract` and `updateContract` with the same scope check the lineup repository uses.
3. `recordTransfer` lists every table it reads or writes in the `runCommand` table array: campaigns, seasons, clubs, players, contracts, constitutions, ledger entries, lineups, transfers, audit events. A missing table in that list is a bug even if the test passes on one browser.
4. Inside the transaction, reload the campaign, the active season, the player, the constitution, the ledger, the player's contracts, and the season's lineups. `seasonId` must be the active season. Otherwise throw `PersistenceError('SCOPE', 'Season is not the active season.')`. A missing player is `NOT_FOUND` with message `Player not found.`
5. Movement rules, throwing `PersistenceError('SCOPE', 'That player cannot take this move.')` and writing nothing:
   - `sale` and `free-out`: `player.clubId` is the managed club.
   - `purchase` and `free-in`: `player.clubId` is not the managed club.
   - `sale`: `destinationClubId` is a different club in this campaign.
6. For `purchase` and `free-in`, build `incoming-transfer`. Age is `displayAge(player, season)` and null when the kind is `unknown`. `isFree` is true only for `free-in`. When a constitution exists, `remainingCapacityCents` is `transferCapacity(...).remainingCents` using that constitution's sell-to-buy percents. When it does not, `remainingCapacityCents` is null and there are no verdicts. Call `evaluateAction` only when a constitution exists.
7. Any `BLOCK` throws `PersistenceError('SCOPE', verdict.message)` for the first blocking verdict. A `WARN` with `acknowledgedWarnings === false` throws `PersistenceError('SCOPE', 'Acknowledge the warning before recording.')`. `acknowledgedWarnings: true` does not override a block. The current incoming rules do not warn. Keep the check anyway.
8. On success, in that same transaction:
   - Insert the transfer. `fromClubId` for an arrival is the player's stored `clubId`, including null. `toClubId` for an arrival is the managed club. `fromClubId` for a departure is the managed club. `toClubId` for `sale` is `destinationClubId` and for `free-out` is null. `kind` is `purchase`, `sale`, or `free` as in phase §5. `sourceActionId` is `actionId`. `feeCents` is the input fee.
   - Insert `incoming_fee` or `player_sale` only for `purchase` and `sale`. `amountCents` is the gross fee, not 70% of it. `note` is the player name. `reversesEntryId` is null. `sourceActionId` is `actionId`. `clubId` is the managed club.
   - Arrival: insert one active contract with the supplied wage, tier, `startsOn`, and `expiresOn`. Do not end a contract that belongs to the previous club.
   - Departure: load active contracts for this player and the managed club. More than one throws `PersistenceError('SCOPE', 'More than one active contract exists for this player.')` before any write. One active contract is updated to `status: 'ended'`. Zero is allowed.
   - Departure: remove the player id from `starters` and `benchPlayerIds` on each lineup in the active season that names the player. Keep the lineup. Set `updatedAt` to `now`. Do not write a `lineup.save` audit.
   - Do not change `source`, `isNewgen`, market value, shortlist rows, or offers. Update `clubId` through `updateStoredPlayer`.
   - One audit, `actionType` `transfer.record`, `seasonId` the active season, `payload` the parsed input. Summaries, exact:
     - `Recorded purchase of ${playerName} for ${euros}`
     - `Recorded free signing of ${playerName}`
     - `Recorded sale of ${playerName} for ${euros}`
     - `Recorded free departure of ${playerName}`
9. Euros in those summaries use `formatMoneyEuros`. The revision increases by 1 only when the transaction commits.
10. In `ScenarioPreview`, add `Outgoing free departure`. Its preview is `previewOutgoingSale` with `feeCents: 0`. Add `Destination club` for `Outgoing sale` only, listing other clubs in the campaign. `Record this transfer` is enabled only when a player is chosen, the latest preview has no `BLOCK`, a sale has a destination, and a warning checkbox is checked when a warning is present. The checkbox label is `I have reviewed this warning.` The click builds a new `recordTransfer` input from the form. It does not reuse a preview object as permission. Disable the button while the command is in flight. Success text is `Recorded the transfer.` A `CONFLICT` shows `staleSave`. A `VALIDATION` shows `result.message`. After success, reload the page data and clear the scenario.
11. A blocker still renders `StatusPill` `Blocked`, the message, and the remedy, and the record button stays disabled.
12. Replace the Finance sentence `Transfers and contracts are not recorded in this build.` with `Choose a player on Transfers to record a move.` Leave the Finance button disabled and without an `onClick`.
13. Extend the README write list with recording a completed transfer. Registration remains in the preview sentence.

## 7. Tests to add/change

`src/test/record-transfer.test.ts`, database `touchline-os-test`, cleanup with `deleteDatabaseForTests`:

- Create Harbor with `preset: 'balanced'` and the extra ids `createCampaign` requires. Add a second club in that campaign and two players: one at the managed club, one at the second club. Give the managed player one active contract and save a lineup that names that player.
- Purchase the other player for 600_000_000 cents with age under the cap and rotation wage 1_000_000. The result is `VALIDATION` and message `The fee is above the remaining transfer capacity.` `clubId`, ledger count, contract count, and revision are unchanged.
- Sale of the managed player for 1_000_000_000 cents returns `ok`. The ledger row kind is `player_sale` and `amountCents` is 1_000_000_000. `transferCapacity` at 70% and 100% prize has `saleCreditCents` 700_000_000. `clubId` is the destination. The managed contract is `ended`. The lineup no longer contains the player. Audits of type `lineup.save` did not increase. The transfer audit summary is `Recorded sale of ${playerName} for €10,000,000.00`.
- Repeat the blocked purchase with the new revision. It returns `ok`, writes one `incoming_fee` of 600_000_000, one `purchase` transfer, and one active contract at the managed club. A second call with the revision from before that success returns `CONFLICT` and message `Campaign revision is stale.` The incoming-fee count stays 1.
- A free signing of a new free agent writes a contract, writes no ledger row, and uses summary `Recorded free signing of ${playerName}`.
- A free departure writes no ledger row, ends the managed contract, and sets `clubId` to null.
- Two active managed contracts for the departing player return `VALIDATION` with message `More than one active contract exists for this player.` and write nothing.
- `postLedgerEntry` with `kind: 'player_sale'` still returns `VALIDATION` and message `Command input is not valid.`
- Campaign B's `listTransfers` does not include campaign A's transfer.
- A command body that updates `clubId` and then throws returns `ABORTED`. `clubId` and revision match the pre-command state.

Update the Finance preview test if it asserts the old sentence. The button named `Record this action` stays disabled.

Do not weaken `src/test/finance-invariants.test.ts`.

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

Expected: each command exits 0. `pnpm test` includes the previous files plus `record-transfer.test.ts`.

## 9. Manual acceptance check

1. Open the fictional demo, choose `Ashbridge`, and save Balanced on Constitution.
2. On Transfers, preview an incoming purchase with fee `6000000`. `Blocked` and `The fee is above the remaining transfer capacity.` are visible. `Record this transfer` is disabled. Reload. The player is unmoved and Finance shows no incoming fee.
3. Open Finance. `Record this action` is disabled. The sentence is `Choose a player on Transfers to record a move.`
4. Tab to the blocked verdict. The word `Blocked` is in the text, not only a color.

Do not need a successful sale in the browser for this guide. The Vitest sale covers the 70% credit.

## 10. Definition of done

- [ ] A blocked purchase writes no player move, contract, ledger row, or audit.
- [ ] A €10,000,000 sale stores 1_000_000_000 cents and credits 700_000_000 cents.
- [ ] A free signing stores no fee. A stale second purchase stores no second fee.
- [ ] Departing players leave lineup slots and the managed active contract ends.
- [ ] `postLedgerEntry` still rejects `player_sale` and `incoming_fee`.
- [ ] Finance Record stays disabled.
- [ ] `schemaV1` is unchanged. No package was added.
- [ ] The §8 commands exit 0.

## 11. Commit instructions

Stage the files in §5, and `plans/phase6/guide2.md` if it is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase6.md`, or other Phase 6 guides.

Suggested message:

```text
feat(p06-g02): record completed player moves
```

Do not commit when §8 is failing. After the commit succeeds, record its full SHA on the `P06-G02` row of the progress log in `plans/phase6.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P06-G03` accepts an offer by performing these sale writes in its own transaction. It must not call `recordTransfer` and then accept the offer in a second transaction.

`P06-G04` may use `insertContract` and `updateContract`. Renewing a contract is not a transfer.

Known limitations this guide leaves on purpose:

- Offers are not stored.
- Squad cells still render `Unknown` even after a contract exists.
- Other open offers are not closed by a sale, because no offer command exists yet.
- Registration is still a preview.
