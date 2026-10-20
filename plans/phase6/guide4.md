# P06-G04 — Contract decisions

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.2 `WAGE_TIER_CAP`, §7.2, and §12.2 invariant 6.
- **Parent phase:** `plans/phase6.md`, guide **P06-G04**. Squad cells and `saveContract` are phase §5 “Contracts”.
- **Predecessor guide:** `plans/phase6/guide3.md`.
- **Predecessor commit:** the commit whose subject is `feat(p06-g03): manage external transfer offers`. Verify with `git log --grep="feat(p06-g03): manage external transfer offers" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p06-g04): govern contract decisions`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase6.md` → this guide. This guide does not move a player, write a ledger row, or evaluate registration. Minutes stay `Unknown`.

## 2. Goal and user-observable result

A player who is already at the managed club can receive a wage, a tier, and a contract end.

- Squad shows those three cells from the active contract.
- An unknown wage stays `Unknown` and does not pass an enabled cap.
- A €46,000 Key wage writes nothing while Balanced is on.
- The command center shows `Expiring contracts` as a count, including `0`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P06-G03 sha> HEAD` succeeds, using the SHA from §1.
- `insertContract` and `updateContract` exist from `P06-G02`. If they do not, stop. Do not reimplement transfer recording in this guide.
- `updatePlayer` does not accept `weeklyWageCents` or `clubId`. Keep it that way.
- The demo seed still discards generated wages. Do not store them.
- Do not install a package. Do not edit `schemaV1` or `DATABASE_VERSION`.
- Leave `MASTER_PLAN.md` and `plans/phase6.md` unchanged in this commit. Stage this guide only, not the other uncommitted Phase 6 guides.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase6.md` §5 “Contracts” and the `P06-G04` block in §6.
- `src/domain/finance/wages.ts` — `wageCommitment` ignores `ended` and other clubs. Null wages increment `unknownCount`.
- `src/domain/models/money.ts` — `formatMoneyUnknown`, `parseMoneyCents`, `invalidMoneyMessage`.
- `src/domain/rules/evaluate-action.ts` — `wage-change` messages. Do not edit them.
- `src/data/commands/update-player.ts` — the strict input. A test must still reject `weeklyWageCents` and `clubId`.
- `src/features/squad/SquadBrowser.tsx` — wage, tier, and contract-end cells are constant `Unknown`. Minutes stays constant `Unknown`.
- `src/features/squad/PlayerProfile.tsx` — remove `Contracts are not recorded in this build.`
- `src/test/squad-page.test.tsx` and `src/test/player-profile.test.tsx` — both expect that sentence.
- `src/features/dashboard/CommandCenterPage.tsx` — `Active bids` already exists. Registration stays `Unknown`.
- `e2e/finance.spec.ts` — the demo wage cell is still `Unknown` because the seed writes no contract. Leave that assertion.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/data/commands/save-contract.ts` | `saveContract` |
| `src/features/squad/SquadBrowser.tsx` | Wage, tier, and contract end |
| `src/features/squad/PlayerProfile.tsx` | History and the save form |
| `src/features/dashboard/CommandCenterPage.tsx` | `Expiring contracts` |
| `src/domain/validation/schemas.ts` | Audit type `contract.save` only |
| `src/test/save-contract.test.ts` | Cap, history, and squad text |
| `src/test/squad-page.test.tsx` | Drop the “not recorded” sentence |
| `src/test/player-profile.test.tsx` | Same |
| `README.md` | Contract saves |

### Public API

```ts
export function saveContract(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Contract>>
```

Strict input: `campaignId`, `contractId`, `playerId`, `expectedRevision`, `now`, `weeklyWageCents` (nonnegative integer or null), `squadTier` (`'key' | 'rotation' | 'youth'` or null), `startsOn` and `expiresOn` (`DateOnly` or null), `auditEventId`, `actionId`.

The command does not accept `clubId` or `feeCents`. The club is `campaign.managedClubId`.

## 6. Implementation steps

1. `saveContract` uses `runCommand` on campaigns, seasons, players, contracts, constitutions, and audit events. The player must be at the managed club. Otherwise `PersistenceError('SCOPE', 'That player is not at the managed club.')`.
2. Build `{ type: 'wage-change', weeklyWageCents, squadTier }` and, when a constitution exists, call `evaluateAction`. A block throws the verdict message and writes nothing. No constitution means no verdicts. A null wage with the Balanced wage rule enabled is `INSUFFICIENT_DATA` and must not be stored as 0.
3. Count active contracts for this player and managed club. More than one throws `PersistenceError('SCOPE', 'More than one active contract exists for this player.')` before any write. Exactly one is updated to `status: 'ended'`. Then insert a new active contract with the supplied fields. Do not change the ended row's wage. Do not write a ledger row. Do not change `clubId` or `source`.
4. One audit, `actionType` `contract.save`, summary `Saved contract for ${playerName}`, `seasonId` the active season, `payload` the parsed input. Revision increases by 1.
5. Squad columns, using the active contract whose `clubId` is the managed club:
   - Wage: `formatMoneyUnknown(weeklyWageCents)`, or `Unknown` when no active contract exists.
   - Tier: `Key`, `Rotation`, `Youth`, or `Unknown`.
   - Contract end: `expiresOn`, or `Unknown`.
   - Minutes: the literal `Unknown`.
   A stored wage of 0 is `€0.00`. A null wage is `Unknown`.
6. The profile lists that player's contracts, active first and then ended, and within each group by `startsOn` descending with null dates last. Remove `Contracts are not recorded in this build.` The form labels are `Weekly wage`, `Tier`, `Starts on`, and `Expires on`. Button `Save contract`. Invalid money shows `invalidMoneyMessage` and does not call the command. Success text is `Saved the contract.` A `CONFLICT` shows `staleSave`. The shortlist button from `P06-G01` stays.
7. Command center gains `{ label: 'Expiring contracts', value: String(count) }` after `Active bids` and before `Registration`. Count active managed-club contracts whose `expiresOn` is not null. Do not read the clock. Do not read `season.endDate`. Empty is `0`. Registration stays `Unknown`.
8. Pass `systemClock()` and `createEntityId()` only from the form handler.
9. Extend the README write list with saving a contract. Registration remains a preview.

## 7. Tests to add/change

`src/test/save-contract.test.ts`, database `touchline-os-test`:

- Balanced Harbor and one managed player. `saveContract` with rotation wage 1_000_000, tier `rotation`, and `expiresOn` `2027-06-30` returns `ok`. One active contract and one `contract.save` audit exist. The summary is `Saved contract for ${playerName}`.
- A second save with wage 2_000_000 ends the first row and inserts a new active row. `wageCommitment` `knownCents` is 2_000_000, not 3_000_000.
- Key wage 4_600_000 returns `VALIDATION` and message `The weekly wage is above the Key cap.` No contract row is added. Revision is unchanged.
- `weeklyWageCents: null` with the wage rule enabled returns `VALIDATION` and message `Weekly wage is unknown, so the tier cap cannot be checked.` The stored rows do not gain a zero wage.
- A player whose `clubId` is the other club returns `VALIDATION` and message `That player is not at the managed club.`
- Two already-active managed contracts return `VALIDATION` and message `More than one active contract exists for this player.` Both rows stay active.
- Render Squad. The player with wage 1_000_000 shows `€10,000.00`, `Rotation`, the end date, and `Unknown` in the minutes column. A player with a null wage, saved only after the wage rule is turned off in the test constitution, shows `Unknown` and not `€0.00`. The off-rule case may insert the null contract through `saveContract` against a Custom constitution. Do not stub the cell.
- `updatePlayer` input with `weeklyWageCents` or `clubId` returns `VALIDATION` and message `Command input is not valid.`
- The Balanced Harbor command center shows `Expiring contracts` `0` before any dated contract, and `Registration` `Unknown`. After the dated save, `Expiring contracts` is `1`.
- Harbor created without a preset still has no `€` on the command center. `Active bids` and `Expiring contracts` are `0`.

Update `squad-page.test.tsx` and `player-profile.test.tsx` so they no longer expect `Contracts are not recorded in this build.` They should expect `Save contract` once a player is open.

Do not change the finance e2e assertion that an untouched demo wage cell reads `Unknown`.

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

Expected: each command exits 0. `pnpm test` includes the previous files plus `save-contract.test.ts`.

## 9. Manual acceptance check

1. Open a managed player's profile on a Balanced save.
2. Save a blank weekly wage. The text is `Weekly wage is unknown, so the tier cap cannot be checked.` Squad still shows `Unknown` for that player. Minutes shows `Unknown`.
3. Save weekly wage `10000` and tier `Rotation`. Squad shows `€10,000.00` and `Rotation`. Finance weekly wages include that amount. Transfer capacity does not fall by the wage.
4. Save weekly wage `46000` and tier `Key`. The Key-cap message appears. Reload. The stored wage is still €10,000.00.
5. The command center shows `Expiring contracts` as a number and does not show `Blocked`.

## 10. Definition of done

- [ ] A renew ends the old active row and inserts a new one. Wage commitment uses the new wage only.
- [ ] €46,000 Key and a null wage write nothing while the Balanced wage rule is on.
- [ ] Squad minutes stay `Unknown`. A null wage is not `€0.00`.
- [ ] `updatePlayer` still rejects a wage and a club id.
- [ ] `Expiring contracts` counts stored end dates, including `0`.
- [ ] The demo seed still writes no contracts.
- [ ] `schemaV1` is unchanged. No package was added.
- [ ] The §8 commands exit 0.

## 11. Commit instructions

Stage the files in §5, and `plans/phase6/guide4.md` if it is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase6.md`, or other Phase 6 guides.

Suggested message:

```text
feat(p06-g04): govern contract decisions
```

Do not commit when §8 is failing. After the commit succeeds, record its full SHA on the `P06-G04` row of the progress log in `plans/phase6.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P06-G05` may read contracts. It does not need a contract in order to register a player. It must not paint minutes.

Known limitations this guide leaves on purpose:

- `Expiring contracts` is not limited to the season end.
- Compare is not on the profile.
- Registration still says it is not enforced.
