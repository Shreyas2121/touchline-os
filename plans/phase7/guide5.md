# P07-G05 — Start standalone careers safely

## 1. Context and authority

- Master: `MASTER_PLAN.md` 2.0.0 §§4.4, 5.1 and 6.1.
- Parent: `plans/phase7.md` §§5.5–5.6.
- Predecessor: `guide4.md`; find `feat(p07-g04): generate playable club worlds` and verify ancestry.
- Commit: `feat(p07-g05): start standalone careers safely`.

## 2. Goal and user-observable result

A new career starts at July 1 with a complete world and chosen board mode. Existing campaigns remain intact. Direct calls to old manual commands cannot bypass standalone rules or manufacture results, money or players.

## 3. Preconditions

G04 complete DTO, G03 calendar and G02 repositories/migration exist. Inspect current onboarding/routing before replacing anything. No dependency additions, match engine, AI market or time advancement; Continue is introduced by G06.

## 4. Files to inspect

- `src/data/commands/create-campaign.ts`, `seed-demo.ts`, `reset-demo.ts` and `select-managed-club.ts`.
- `src/data/commands/save-constitution.ts` — writeConstitution can post opening allocation.
- Match, offer, completed transfer, contract, player, development-note and ledger commands.
- `src/data/transactions/run-command.ts` and the new simulation repositories.
- `src/app/pages/WelcomePage.tsx`, `src/features/campaigns/ChooseClubPage.tsx` and `CampaignManager.tsx`.
- `src/features/registration/**` and `src/data/commands/save-registration.ts`.
- `src/app/copy.ts`, routes/router and existing welcome/demo tests.

## 5. Files to create/modify

| Path                                             | Change                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| `src/domain/simulation/prepare-career.ts`        | Pure selected-club/preset/season preparation              |
| `src/data/commands/start-standalone-campaign.ts` | Authoritative generation and atomic initialization        |
| `src/data/commands/guards.ts`                    | Reusable mode/Challenge mutation checks                   |
| Existing legacy-only write commands              | Early mode check within transactional authoritative path  |
| Constitution initialization/write internals      | Single opening allocation; public Challenge guard         |
| Campaign/welcome UI and routing                  | Explicit seed/year/club/mode flow; separate playable demo |
| Registration draft loader                        | Known profile eligibility defaults                        |
| `src/test/start-standalone-campaign.test.ts`     | Creation, retries, collision and fault rollback           |
| `src/test/standalone-command-guards.test.ts`     | Direct-call guard matrix and Sandbox behavior             |
| `README.md`                                      | Accurate foundation checkpoint                            |

Input contains name, seed, startYear, selected stable club key, mode/preset, campaign/action/audit IDs and timestamp. Never accept arbitrary externally supplied finished world/budgets as authoritative. Existing createCampaign remains the legacy creation path.

## 6. Implementation steps

1. Add pure preparation using G04 world and explicit calendar. Choose selected club by stable key; preserve seeded content across ID remapping.
2. Generate/validate outside the transaction. On a colliding campaign ID, permit only a matching initialization receipt/fingerprint as a harmless retry; otherwise return collision without overwrite.
3. In one transaction insert world rows, season, Campaign modes, SimulationState with lastBoundaryKey null, chosen Constitution, exactly one opening allocation, initialization receipt and concise audit. Increment revision once for the completed business operation.
4. Keep board-authorized capacity separate from finite club transfer balance. Sandbox starts with finite funds too; disabled sell-to-buy does not create unlimited club money.
5. Refactor narrow initialization internals as needed. Public saveConstitution refuses Challenge; Sandbox editing never creates another opening allocation or grants money from changed thresholds.
6. Apply phase §5.6 guards to legacy match/offer/transfer/contract/ledger/player mutation and club-switch commands. Do not merely hide controls. Ordinary development notes/target plans, shortlist and lineup management remain allowed if scoped and non-mutating to attributes/ownership.
7. Initialize registration drafts from known fictional simulation eligibility; save explicit Registration rows only on confirmation.
8. Add new-career UI: Seed, Start year (visible editable default 2026), Club, Challenge/Sandbox and Board preset. Validate, display generation/commit progress and recoverable errors; never route to a half-created campaign.
9. Use a distinct playable demo ID (e.g. standalone-demo). Keep legacy demo and reset scope; a reset targets only the chosen demo and requires existing confirmation semantics.
10. Standalone screens must not expose manual entry for blocked actions; show that negotiation/matches are upcoming. Legacy screens retain their working forms.
11. Record modes and available feature checkpoint in README without claiming future gameplay.

Creation retry compares logical seed/year/club/preset settings and stored receipt. Fresh action/audit IDs and timestamp alone do not justify regenerating a duplicate world.

## 7. Tests to add/change

- Start a full standalone career with valid counts, selected club, dates, complete contracts, modes, state and exactly one allocation/receipt/audit.
- Retry the same logical creation without extra writes; conflicting seed/settings at the same ID fail.
- Inject a persistence failure after some inserts and prove no playable campaign, world rows, money or receipt survives.
- Existing legacy campaign and demo content is unchanged.
- Directly invoke every blocked command in phase guard matrix against standalone: failure leaves all rows, revision and audits unchanged.
- Challenge policy update fails; Sandbox update succeeds with audit but never grants a second opening allocation.
- Old legacy payloads/flows still work. Attempted running-career club switch fails.
- Known generated homegrown data reaches registration drafts without mislabeling unknown as true.
- New-game validation/error flow and separate demo choices render correctly.

## 8. Verification commands

```bash
pnpm exec vitest run src/test/start-standalone-campaign.test.ts src/test/standalone-command-guards.test.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Existing legacy browser journeys must remain valid; do not rewrite them into simulated journeys to conceal regressions.

## 9. Manual acceptance check

Start a Balanced Challenge career with an explicit seed/year; reload and inspect known squad/contracts/finances. Confirm no old manual forms or editable Challenge rules. Open a second Sandbox, edit a policy and verify allocation is unchanged. Open the old demo and record a manual match. Verify reset affects only the chosen demo.

## 10. Definition of done

- [ ] Initialization is atomic, repeat-safe, scoped and truthful about available features.
- [ ] Both-club-world data is complete; no generation occurs during legacy migration.
- [ ] Mode/Challenge guards work through direct command calls.
- [ ] Sandbox edits cannot mint budget; legacy behavior is preserved.
- [ ] No Continue handler, fixtures, AI bids or season settlement yet.
- [ ] Required checks pass and README is accurate.

## 11. Commit instructions

```text
feat(p07-g05): start standalone careers safely
```

Stage only this guide's implementation/tests/docs and phase evidence. Do not stage later guides or reset completed work.

## 12. Handoff

G06 can load a standalone campaign with complete world, game date, boundary cursor and receipts. It adds progression and Command Center controls. Old manual transfer/match/finance commands are protected and are not placeholders to execute simulated actions.
