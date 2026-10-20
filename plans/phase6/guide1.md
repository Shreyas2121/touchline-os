# P06-G01 — Plan transfer scenarios

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §4.1, §7.4, and §8.
- **Parent phase:** `plans/phase6.md`, guide **P06-G01**. Shortlist, scenario, and banner rules are phase §5. The work block is phase §6 `P06-G01`.
- **Predecessor guide:** none in Phase 6. Phase 5 is complete.
- **Predecessor commit:** `db03504c69ade519944797642be18fba63c8774f` (`phase 5 done`). Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p06-g01): plan transfer scenarios`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase6.md` → this guide. This guide does not record a transfer, an offer, a contract, or a registration. It does not enable a commit button.

## 2. Goal and user-observable result

On Transfers, a person can search the player pool, shortlist a player, and preview an incoming purchase, an incoming free signing, or an outgoing sale.

- Reload keeps the shortlist and clears the scenario.
- The player's club does not change.
- The preview says `Preview only — no changes recorded.`
- `Record this transfer` is disabled.
- Transfers no longer shows `Static preview — not save data`. Registration still does.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor db03504c69ade519944797642be18fba63c8774f HEAD` succeeds.
- `src/features/transfers/TransfersPage.tsx` still renders two `EmptyState` blocks. If the shortlist command already exists, stop and reconcile with this guide before editing.
- Do not install a package. Do not edit `schemaV1`, `src/data/migrations/v1.ts`, or `DATABASE_VERSION`.
- Do not add a policy action type. `{ type: 'registration' }` stays invalid.
- Leave `MASTER_PLAN.md` and `plans/phase6.md` unchanged in this commit. Stage this guide only, not `plans/phase6/guide2.md` or later guides.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase6.md` §5 “Shortlist”, “Scenario preview”, “Banner”, and “Screens”, and the `P06-G01` block in §6.
- `src/domain/validation/schemas.ts` — `shortlistItemSchema`, `auditEventSchema`. Do not change the shortlist shape.
- `src/domain/finance/preview.ts` — `previewAction` and `PreviewResult`.
- `src/domain/player/squad-view.ts` — `displayAge`. `unknown` becomes a null age. Do not compute age inside `preview.ts`.
- `src/data/transactions/run-command.ts` — `CONFLICT` message is `Campaign revision is stale.`
- `src/data/repositories/players.ts` — `listPlayers`, `getPlayer`.
- `src/data/repositories/contracts.ts` — `listContractsByClub`. There is no insert export. Do not add one.
- `src/features/squad/PlayerProfile.tsx` — the contracts sentence stays. Add the shortlist button above it.
- `src/app/layout/WorkspaceLayout.tsx` — banner paths.
- `src/test/shell-nav.test.tsx` and `src/test/finance-page.test.tsx` — both still witness the banner on Transfers.
- `e2e/smoke.spec.ts`, `e2e/demo-journey.spec.ts`, `e2e/tactics.spec.ts`, `e2e/finance.spec.ts` — same witness.
- `README.md` — the local-database paragraph.
- `src/test/fixtures/campaign.ts` — `harborInput`.
- `eslint.config.js` — domain code cannot import React, Dexie, `Math.random`, or `Date`.

`src/data/commands/record-transfer.ts` does not exist. Do not create it.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/finance/preview.ts` | `previewOutgoingSale` |
| `src/data/repositories/shortlist.ts` | List, insert, update |
| `src/data/commands/save-shortlist-item.ts` | `saveShortlistItem` |
| `src/data/commands/close-shortlist-item.ts` | `closeShortlistItem` |
| `src/features/transfers/PlayerSearch.tsx` | Search and shortlist |
| `src/features/transfers/ScenarioPreview.tsx` | Unsaved preview |
| `src/features/transfers/TransfersPage.tsx` | Replace the empty preview |
| `src/features/squad/PlayerProfile.tsx` | `Add to shortlist` |
| `src/domain/validation/schemas.ts` | Audit types `shortlist.save` and `shortlist.close` only |
| `src/app/layout/WorkspaceLayout.tsx` | Hide the banner on `/transfers` |
| `src/test/shortlist.test.ts` | Command tests |
| `src/test/transfer-scenario.test.tsx` | Preview and screen tests |
| `src/test/shell-nav.test.tsx` | Banner witness moves to Registration |
| `src/test/finance-page.test.tsx` | Same witness move |
| `e2e/smoke.spec.ts`, `e2e/demo-journey.spec.ts`, `e2e/tactics.spec.ts`, `e2e/finance.spec.ts` | Same witness move |
| `README.md` | Shortlist writes |

### Public API

```ts
export function previewOutgoingSale(input: {
  feeCents: number
  salesReinvestmentPct: number
  snapshot: PolicySnapshot
  wages: { knownCents: number; unknownCount: number }
  activeWageCents: number | null
}): PreviewResult

export function saveShortlistItem(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<ShortlistItem>>

export function closeShortlistItem(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<ShortlistItem>>
```

`saveShortlistItem` input, strict object:

- `campaignId`, `itemId`, `playerId`, `expectedRevision`, `now`, `auditEventId`, `actionId`
- `priority` integer 1–5
- `notes`: trimmed string of 1–4,000 characters, or null
- `status`: `'open' | 'closed'`

`closeShortlistItem` input, strict object: `campaignId`, `itemId`, `expectedRevision`, `now`, `auditEventId`, `actionId`.

Repository exports: `listShortlist(database, campaignId)`, `insertShortlistItem`, `updateShortlistItem`. A row whose `campaignId` does not match throws `PersistenceError('SCOPE', ...)`.

## 6. Implementation steps

1. Add `previewOutgoingSale` in `preview.ts`. Do not call `evaluateAction`. The report is `{ allowed: true, verdicts: [], snapshotRevision: snapshot.revision }`. Before capacity uses `formatCapacity`. When `snapshot.remainingCapacityCents` is null, after capacity is `Unknown`. Otherwise after capacity is `formatCapacity(remaining + Math.floor(feeCents * salesReinvestmentPct / 100))`. Use integer arithmetic. Before wages use `formatWageCommitment`. When `activeWageCents` is null, after wages is `Unknown`. When it is a number and `wages.knownCents >= activeWageCents`, subtract it from `knownCents` and keep `unknownCount`. When it is greater than `knownCents`, after wages is `Unknown`. Do not produce a negative cent value.
2. Add the shortlist repository. `listShortlist` returns rows for that `campaignId` only, parsed with `shortlistItemSchema`, sorted by `priority` ascending and then `playerId` ascending.
3. `saveShortlistItem` uses `runCommand` on `shortlistItems`, `players`, `campaigns`, and `auditEvents`. Inside the transaction, load the player with `getPlayer`. A missing player is `NOT_FOUND` with message `Player not found.` If another row already exists for that campaign and player and its id is not `itemId`, throw `PersistenceError('SCOPE', 'This player is already on the shortlist.')`. Insert or update the parsed shortlist row. `addedAt` on insert is `now`. On update, keep the stored `addedAt`. Bump the campaign revision. One audit, `actionType` `shortlist.save`, summary `Shortlisted ${playerName}`, `seasonId` null, `payload` the parsed input. Do not write a player, contract, ledger row, lineup, or transfer.
4. `closeShortlistItem` loads the row in the campaign. A missing row is `NOT_FOUND` with message `Shortlist entry not found.` Set `status` to `closed` and leave `priority`, `notes`, `playerId`, and `addedAt` unchanged. Audit `actionType` `shortlist.close`, summary `Closed shortlist entry for ${playerName}`.
5. A stale `expectedRevision` still returns `CONFLICT` and message `Campaign revision is stale.` A thrown body returns `ABORTED` and leaves the shortlist count and revision unchanged.
6. Replace the Transfers empty states. Keep `SectionPage`. The page reads the campaign, active season, managed club, `listPlayers`, `listShortlist`, `listContractsByClub`, the active constitution, and the active season ledger. Capacity uses the same percent arguments Finance uses. No constitution means remaining capacity is null.
7. Search label `Player search`. Fewer than 2 trimmed characters shows `Search the player pool to plan a move.` and no result list. At 2 or more, filter `listPlayers` by name with `toLocaleLowerCase('en')` and render at most 50 matches in a list named `Search results`. When more than 50 match, also show `Showing 50 matches. Narrow the search.` Each row shows the player name and the club name, or `Free agent` when `clubId` is null. Button `Add to shortlist`. When that player already has an open shortlist row, the button is disabled and its accessible name is `On the shortlist`. A closed row uses `Reopen shortlist`. Adding sends priority `3`, notes null, and status `open`, reusing the stored id when a row exists. The profile button does the same.
8. Region `Shortlist`. Empty copy `No players are shortlisted.` Each open or closed row shows the player name, a priority select labeled `Priority for ${name}`, a notes field labeled `Notes for ${name}`, `Preview scenario`, and `Close shortlist entry`. Closing calls `closeShortlistItem`. Saving priority or notes calls `saveShortlistItem` with the stored id and status.
9. Region `Scenario`. Until a player is chosen, show `Choose a player to preview a move.` Select `Move` with `Incoming purchase`, `Incoming free signing`, and `Outgoing sale`. Incoming purchase fields: `Fee`, `Weekly wage`, `Tier`, `Effective date`. Free signing hides `Fee` and submits `feeCents: 0` with `isFree: true`. Outgoing sale fields: `Fee` and `Effective date`. Age is `displayAge` for that player and season; do not render an age input. Tier options are `Key`, `Rotation`, `Youth`, and an empty option that submits null. Blank wage is null. Button `Preview scenario`.
10. The result includes `Preview only — no changes recorded.`, `Before`, and `After`. Verdicts use `StatusPill` with `Blocked`, `Warning`, or `Informational`, then the message and the remedy. No verdicts shows `No rule blocked this action.` No constitution shows `No constitution is saved, so no rule was checked.` and does not call `evaluateAction`. Outgoing sale calls `previewOutgoingSale` with the constitution's `salesReinvestmentPct`, or does not pretend a credit when no constitution exists: after capacity stays `Unknown`. Button `Record this transfer` is disabled. Do not give it an `onClick`.
11. Pass `systemClock()` and `createEntityId()` only at the click handler. Commands receive those values. Do not call them inside the command.
12. `WorkspaceLayout` also omits `previewBanner` when the path ends with `/transfers`.
13. Move the banner witness from Transfers to Registration in `shell-nav.test.tsx`, `finance-page.test.tsx`, and the four e2e specs. Registration's heading is `Registration`. Do not remove the banner from Registration, Scouting, Match Journal, or Seasons. Do not save a constitution inside `demo-journey.spec.ts` or `tactics.spec.ts`.
14. Replace the README local-database paragraph's write list so it also says saving a shortlist writes to `touchline-os`. The preview sentence becomes: registration, scouting, matches, seasons, import, and backup remain previews. Keep the existing sentences about the demo club choice and reset.

## 7. Tests to add/change

`src/test/shortlist.test.ts`, database `touchline-os-test`, cleanup with `deleteDatabaseForTests`, clock `2026-10-19T00:00:00.000Z`:

- Create Harbor with `harborInput` and add one player with `addPlayer`. `saveShortlistItem` returns `ok`, revision increases by 1, one shortlist row exists, `clubId` is unchanged, and the ledger count is unchanged. The audit summary is `Shortlisted ${playerName}`.
- A second `itemId` for that player returns `VALIDATION` and message `This player is already on the shortlist.` The row count stays 1.
- `closeShortlistItem` sets `status` to `closed` and keeps the row. The audit summary is `Closed shortlist entry for ${playerName}`.
- A stale `expectedRevision` returns `CONFLICT` and message `Campaign revision is stale.` No second row appears.
- Create campaign B. Its `listShortlist` does not include campaign A's row.
- A `runCommand` body that inserts a shortlist row and then throws returns `ABORTED`. Count and revision match the pre-command state.

`src/test/transfer-scenario.test.tsx`:

- `previewOutgoingSale` of fee 1_000_000_000, percent 70, and remaining 500_000_000 returns after capacity `€12,000,000.00`, `allowed: true`, and no verdicts.
- The same call with `remainingCapacityCents: null` returns after capacity `Unknown`.
- `activeWageCents: null` returns after wages `Unknown`. A known 1_000_000 inside `knownCents` 5_000_000 returns known cents 4_000_000 in the formatted after wages.
- Render Transfers for a campaign with no constitution. Search `a`. The pool sentence is visible and no `Add to shortlist` button is visible. Search a two-character name that matches the added player. `Add to shortlist` is visible. After the click and a reload of the route, `On the shortlist` is visible. `player.clubId` is unchanged.
- Preview an incoming purchase of fee `6000000` against a Balanced campaign whose remaining capacity is 500_000_000. `Blocked` and `The fee is above the remaining transfer capacity.` are visible, plus `Preview only — no changes recorded.`
- `Record this transfer` is disabled. The ledger count is unchanged after the preview click.
- Render `/app/campaign-a/registration` and expect `previewBanner`. Render `/app/campaign-a/transfers` and expect no `previewBanner`.

Do not call `postLedgerEntry`, `insertLedgerEntry`, or `insertTransfer` from these tests.

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

Expected: each command exits 0. `pnpm test` includes the previous files plus `shortlist.test.ts` and `transfer-scenario.test.tsx`. `pnpm test:e2e` still has four specs. Smoke reaches Registration and sees the preview banner there, and Transfers has no banner.

## 9. Manual acceptance check

1. `pnpm dev`, open `/`, and start the fictional demo. Choose `Ashbridge`.
2. Open Transfers. The preview banner is absent. Type one letter in `Player search`. The text is `Search the player pool to plan a move.`
3. Type two letters, shortlist a player whose row does not say `Ashbridge`, and reload. That player is still shortlisted. Open Squad and confirm that player is not on the Ashbridge squad.
4. Choose the shortlisted player, preview an incoming purchase with fee `6000000`, and confirm `Preview only — no changes recorded.` `Record this transfer` does not activate. Reload. The scenario is gone and no completed deal exists.
5. Open the player's profile. `Add to shortlist` is disabled or reads `On the shortlist`. `Contracts are not recorded in this build.` is still visible.
6. Open Registration. The preview banner is visible.
7. Tab to `Player search`, then to `Add to shortlist` on a result. Focus is visible.

## 10. Definition of done

- [ ] Shortlist survives reload and does not change `clubId` or the ledger.
- [ ] A scenario is not stored. `Record this transfer` is disabled.
- [ ] Outgoing preview of €10,000,000 at 70% against €5,000,000 remaining shows €12,000,000.00 after capacity.
- [ ] The preview banner is gone from Transfers and still present on Registration.
- [ ] `{ type: 'registration' }` still fails `parsePolicyAction`.
- [ ] `schemaV1` is unchanged. No package was added.
- [ ] The §8 commands exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase6.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5, and `plans/phase6/guide1.md` if it is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase6.md`, or `plans/phase6/guide2.md` through `guide6.md`.

Suggested message:

```text
feat(p06-g01): plan transfer scenarios
```

Do not commit when §8 is failing. Do not amend `db03504c69ade519944797642be18fba63c8774f`. After the commit succeeds, record its full SHA on the `P06-G01` row of the progress log in `plans/phase6.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P06-G02` may enable `Record this transfer` and add `recordTransfer`. It must not enable Finance `Record this action`.

Known limitations this guide leaves on purpose:

- No transfer, offer, contract, or registration row is written.
- Outgoing free departure is not on the form yet.
- A sale preview has no destination club yet.
- Squad wage, tier, contract end, and minutes stay `Unknown`.
- Registration is still a preview, and its constitution sentence still says the checks are not enforced.
