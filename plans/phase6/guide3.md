# P06-G03 — External transfer offers

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.2 `PRESTIGE_BID_SALE`, §7.1, and §7.4.
- **Parent phase:** `plans/phase6.md`, guide **P06-G03**. Offer behavior is phase §5 “Offers”.
- **Predecessor guide:** `plans/phase6/guide2.md`.
- **Predecessor commit:** the commit whose subject is `feat(p06-g02): record completed player moves`. Verify with `git log --grep="feat(p06-g02): record completed player moves" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p06-g03): manage external transfer offers`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase6.md` → this guide. This guide does not roll over a season, post `approved_carryover`, or add a control that disables `PRESTIGE_BID_SALE`.

## 2. Goal and user-observable result

Transfers shows an offer inbox and a completed-deals list.

- A qualifying bid cannot be rejected. It stays `open`.
- A bid that does not qualify can be rejected.
- Accepting an open offer completes the sale in the same save.
- The command center shows `Active bids`, including `0`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P06-G02 sha> HEAD` succeeds, using the SHA from §1.
- `recordTransfer` exists and already writes a gross `player_sale`.
- `evaluateAction` already returns `QUALIFYING_OFFER` and `UNKNOWN_VALUATION`. Do not change those messages.
- Do not install a package. Do not edit `schemaV1` or `DATABASE_VERSION`.
- Leave `MASTER_PLAN.md` and `plans/phase6.md` unchanged in this commit. Stage this guide only, not the other uncommitted Phase 6 guides.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase6.md` §5 “Offers” and the `P06-G03` block in §6.
- `src/domain/rules/evaluate-action.ts` — the prestige comparison uses `BigInt`. Copy that test into `offerQualifies`. Do not export a second copy of the threshold numbers.
- `src/domain/validation/schemas.ts` — `offerSchema`. `open` requires `resolvedOn === null`.
- `src/data/commands/record-transfer.ts` — sale writes to reuse inside `acceptOffer`. Do not call `recordTransfer` from `acceptOffer`.
- `src/features/dashboard/CommandCenterPage.tsx` — `KpiRibbon`. Registration stays `Unknown` in this guide.
- `src/test/command-center.test.tsx` — the unadopted demo still has three `Unknown` values and no `€`. A new `0` must not add a euro sign.
- `src/components/ui/KpiRibbon.tsx` — the label is a `p` and the value is the next sibling. New KPIs must keep that shape.

`src/domain/rules/qualify-offer.ts` does not exist. Create it in this guide.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/rules/qualify-offer.ts` | `offerQualifies`, `countUnresolvedQualifyingOffers` |
| `src/data/repositories/offers.ts` | `listOffers`, `insertOffer`, `updateOffer` |
| `src/data/commands/record-offer.ts` | `recordOffer` |
| `src/data/commands/reject-offer.ts` | `rejectOffer` |
| `src/data/commands/accept-offer.ts` | `acceptOffer` |
| `src/features/transfers/OfferInbox.tsx` | Record, reject, accept |
| `src/features/transfers/TransfersPage.tsx` | Inbox and completed deals |
| `src/features/dashboard/CommandCenterPage.tsx` | `Active bids` |
| `src/domain/validation/schemas.ts` | `offer.record`, `offer.accept`, `offer.reject` |
| `src/test/offers.test.ts` | Prestige and sale coupling |
| `README.md` | Offer writes |

### Public API

```ts
export function offerQualifies(
  offer: { feeCents: number },
  marketValueCents: number | null,
  bidderPrestige: number | null,
  sellerPrestige: number | null,
  rule: {
    requiredFeeNumerator: number
    requiredFeeDenominator: number
    requireHigherPrestige: boolean
  },
): 'qualifies' | 'does-not-qualify' | 'unknown'

export function countUnresolvedQualifyingOffers(
  offers: readonly { status: 'open' | 'accepted' | 'rejected'; feeCents: number; playerId: string; bidderClubId: string }[],
  marketValueByPlayerId: ReadonlyMap<string, number | null>,
  prestigeByClubId: ReadonlyMap<string, number | null>,
  sellerPrestige: number | null,
  rule: {
    requiredFeeNumerator: number
    requiredFeeDenominator: number
    requireHigherPrestige: boolean
  },
): number
```

`recordOffer` input: `campaignId`, `offerId`, `seasonId`, `playerId`, `bidderClubId`, `feeCents`, `receivedOn`, `expectedRevision`, `now`, `auditEventId`, `actionId`.

`rejectOffer` input: `campaignId`, `offerId`, `resolvedOn`, `expectedRevision`, `now`, `auditEventId`, `actionId`, `acknowledgedWarnings`.

`acceptOffer` input: `campaignId`, `offerId`, `resolvedOn`, `effectiveOn`, `expectedRevision`, `now`, `transferId`, `ledgerEntryId`, `auditEventId`, `actionId`. Accept does not take a wage. A sale does not create a destination contract.

`listOffers(database, campaignId, seasonId)` returns that campaign and season only.

## 6. Implementation steps

1. `offerQualifies` returns `'unknown'` when `marketValueCents`, `bidderPrestige`, or `sellerPrestige` is null. Otherwise it uses the same `BigInt` fee test and higher-prestige test as `evaluateAction`. Equal prestige does not qualify when `requireHigherPrestige` is true. Do not import Dexie or React.
2. `countUnresolvedQualifyingOffers` counts offers with `status: 'open'` whose result is `'qualifies'`. `'unknown'` and `'does-not-qualify'` do not count. Accepted and rejected offers do not count. No screen calls this function in this guide. Export it for Phase 7.
3. `recordOffer` runs on offers, players, clubs, seasons, campaigns, and audit events. The player must be at the managed club. Otherwise `PersistenceError('SCOPE', 'That player is not at the managed club.')`. `bidderClubId` must be another club in this campaign. `feeCents` must be greater than 0; a zero fee fails the input parse with `Command input is not valid.` An existing `open` offer for the same campaign, season, player, and bidder throws `PersistenceError('SCOPE', 'That club already has an open offer for this player.')`. Insert `status: 'open'` and `resolvedOn: null`. Audit `offer.record`, summary `Recorded offer for ${playerName}`. No ledger row and no `clubId` change.
4. `rejectOffer` reloads the offer, player, bidder club, managed club, and constitution. A missing offer is `NOT_FOUND` with message `Offer not found.` A status other than `open` throws `PersistenceError('SCOPE', 'That offer is already resolved.')`. Build `reject-offer` from the stored market value and the two prestige figures. `sellerPrestige` is the managed club. Call `evaluateAction`. `QUALIFYING_OFFER` throws that verdict message and writes nothing. `UNKNOWN_VALUATION` with `acknowledgedWarnings === false` throws `Acknowledge the warning before recording.` With `true`, set `status` to `rejected` and `resolvedOn` to the caller's date. A bid that does not qualify has no prestige verdict and may be rejected. Audit `offer.reject`, summary `Rejected offer for ${playerName}`.
5. `acceptOffer` requires the player to still be at the managed club. The same move failure message is `That player cannot take this move.` It writes the sale transfer, the gross `player_sale`, the ended managed contract, and the lineup cleanup described in `plans/phase6/guide2.md`, then sets the offer to `accepted` with `resolvedOn`. One transaction. One audit, `offer.accept`, summary `Accepted offer for ${playerName}`. The transfer and the ledger row use this command's `actionId` as `sourceActionId`. Do not also write `transfer.record`. Other open offers stay open. Do not call `evaluateAction` for the reject rule on accept.
6. More than one active managed contract aborts the accept with `More than one active contract exists for this player.` and leaves the offer `open`.
7. `OfferInbox` region is `Offers`. Empty copy `No offers are recorded.` Fields `Player`, `Bidding club`, `Fee`, and `Received on`. `Player` lists the managed squad. `Bidding club` lists other clubs in the campaign. Button `Record offer`. Each open offer shows the player name, the bidder name, `formatMoneyEuros(feeCents)`, `Reject offer`, and `Accept offer`. A warning shows checkbox `I have reviewed this warning.` and `Reject offer` stays disabled until it is checked. Success text is `Recorded the offer.`, `Rejected the offer.`, or `Accepted the offer.` A blocker shows `Blocked`, the message, and the remedy. There is no constitution toggle. A text link `Change a rule on Constitution.` points at `/app/${campaignId}/constitution`.
8. Region `Completed deals`, fed by `listTransfers`. Columns `Date`, `Player`, `Kind`, `Fee`. Kind text is `Sale`, `Purchase`, or `Free`. Fee uses `formatMoneyEuros`, including `€0.00` for a free transfer. Empty copy `No completed deals for this season.`
9. Command center `KpiRibbon` gains `{ label: 'Active bids', value: String(count) }` after `Weekly wages` and before `Registration`. Count open offers for the active season whose player is currently at the managed club. Empty is `0`, not `Unknown`. Registration stays the literal `Unknown`.
10. Extend the README write list with recording, accepting, and rejecting an offer.

## 7. Tests to add/change

`src/test/offers.test.ts`, database `touchline-os-test`:

- Balanced Harbor, managed prestige 50, a second club with prestige 80, and a managed player whose `marketValueCents` is 10_000_000. Offer fee 15_000_000. `offerQualifies` returns `'qualifies'`. `rejectOffer` returns `VALIDATION`, message `This bid qualifies and cannot be rejected while the rule is on.`, and the offer stays `open` with `resolvedOn` null. No transfer row exists.
- Fee 14_999_999 rejects. `resolvedOn` is set. No transfer row exists. The audit summary is `Rejected offer for ${playerName}`.
- A null market value with `acknowledgedWarnings: false` writes nothing. With `true`, the offer becomes `rejected`.
- Accept of the 15_000_000 offer writes one `sale`, one `player_sale` of 15_000_000, one accepted offer, and one `offer.accept` audit. It does not write `transfer.record`. `clubId` is the bidder. `countUnresolvedQualifyingOffers` for that now-accepted offer is 0.
- A second open offer from the same bidder returns `VALIDATION` and message `That club already has an open offer for this player.`
- An unknown-value open offer is not counted by `countUnresolvedQualifyingOffers`. A qualifying open offer is counted.
- After the player has left, accepting a second offer returns `VALIDATION` and message `That player cannot take this move.` That second offer stays `open`.
- Campaign B cannot read campaign A's offers.
- Render the command center for Balanced Harbor before any offer. `Active bids` is `0`. The unadopted demo command-center test still sees three `Unknown` values and no `€`.

Add a rendered inbox test in the same file or in `transfer-scenario.test.tsx`: a qualifying offer shows `Blocked` and `This bid qualifies and cannot be rejected while the rule is on.` The offer row remains.

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

Expected: each command exits 0. `pnpm test` includes the previous files plus `offers.test.ts`.

## 9. Manual acceptance check

1. On a Balanced save, open Transfers and record an offer from another club for a managed player.
2. If the bid does not qualify, `Reject offer` removes it from the open list and `Rejected the offer.` appears.
3. Record a bid at or above 1.5 times the player's market value from a higher-prestige club. `Reject offer` shows `Blocked` and the qualifying message. Reload. The offer is still open. No sale row appears.
4. `Accept offer` on that bid. The player leaves the squad. Completed deals shows `Sale` and the fee. Activity shows one accept summary, not a second transfer summary.
5. The command center `Active bids` value is a number. The page does not show `Blocked`.

## 10. Definition of done

- [ ] A qualifying rejection writes nothing.
- [ ] An unknown valuation rejects only after the warning checkbox.
- [ ] Accept writes the sale and the accepted offer in one audit.
- [ ] A second open offer from the same bidder writes nothing.
- [ ] `Active bids` is `0` when there are none, and the unadopted demo still has no euro sign.
- [ ] No screen control disables the prestige rule.
- [ ] `schemaV1` is unchanged. No package was added.
- [ ] The §8 commands exit 0.

## 11. Commit instructions

Stage the files in §5, and `plans/phase6/guide3.md` if it is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase6.md`, or other Phase 6 guides.

Suggested message:

```text
feat(p06-g03): manage external transfer offers
```

Do not commit when §8 is failing. After the commit succeeds, record its full SHA on the `P06-G03` row of the progress log in `plans/phase6.md` §10. That log edit is not part of this commit.

## 12. Handoff

Phase 7 may pass `countUnresolvedQualifyingOffers` into the existing `season-rollover` action. This phase does not call it from a screen.

`P06-G04` does not need the offer commands. It must not treat an accepted offer as a contract at the buying club.

Known limitations this guide leaves on purpose:

- A leftover open qualifying offer after the player has left stays open. The escape is still an audited constitution change.
- Squad wage cells still say `Unknown`.
- Registration is still not evaluated.
