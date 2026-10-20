# P07-G02 — Introduce standalone save contracts

## 1. Context and authority

- Master: `MASTER_PLAN.md` 2.0.0 §§0, 4 and 8.
- Parent: `plans/phase7.md` §§5.1–5.2; next executable guide after the pivot.
- Predecessor: historical `guide1.md` at `b5332a73353d5fd83d1258776984d79c1ed586b6`; preserve later docs commits.
- Commit: `feat(p07-g02): introduce standalone save contracts`.

Guide 1 retains its historical 1.0.0 instructions. This guide follows the amended master; its explicit v2 authorization replaces the old no-migration restriction.

## 2. Goal and user-observable result

Existing saves open after a real v1→v2 upgrade, labeled internally as legacy/sandbox, without losing or inventing records. New simulation stores exist but contain no automatically generated career.

## 3. Preconditions

- Verify the predecessor is an ancestor and inspect the working tree. Preserve unrelated changes and archived/untracked plans.
- Read the master, DEC-001 and active phase before code.
- No package installation, generator rewrite, new-game UI or simulation command.
- Check that a prior partial attempt has not already registered v2; reconcile any such work before applying a second migration.

## 4. Files to inspect

- `src/data/db.ts`, `src/data/migrations/v1.ts`.
- `src/domain/validation/schemas.ts`, `limits.ts`.
- `src/data/transactions/run-command.ts` and `run-in-transaction.ts`.
- Campaign/season/player/club repository methods and error mapping.
- `src/data/repositories/delete-campaign-rows.ts`, `delete-campaign.ts` and `reset-demo.ts` command transaction scopes.
- `src/test/database.test.ts`, `schemas.test.ts`, `repositories.test.ts` and persistence tests.

## 5. Files to create/modify

| Path                                                                        | Change                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/domain/validation/schemas.ts`                                          | Campaign mode defaults and typed future simulation audit action names |
| `src/domain/simulation/schemas.ts`                                          | State/profile/receipt Zod schemas and inferred types                  |
| `src/data/migrations/v2.ts`                                                 | Four new stores, old indexes preserved, campaign-mode upgrade         |
| `src/data/db.ts`                                                            | Explicit v1 and v2 declarations and typed tables                      |
| `src/data/repositories/simulation.ts`                                       | Scoped state/profile/receipt reads and writes                         |
| `src/data/repositories/delete-campaign-rows.ts` and affected command scopes | Include all new stores in cleanup                                     |
| `src/test/simulation-migration.test.ts`                                     | Real old-database upgrade and fresh database                          |
| `src/test/simulation-repositories.test.ts`                                  | Validation, scoped uniqueness and cleanup                             |

Public records follow phase §5.2, with two explicit additions needed by the later clock: `SimulationState.lastBoundaryKey: string | null` and `SimulationReceipt.inputFingerprint: string`.

Require known root seed, supported literal version '1', validated date, valid phase, bounded logical key/fingerprint/ref strings and safe nonnegative integer cents. Receipt fields include inputRevision and compact typed outcome references; later guides may extend an explicit discriminated outcome without accepting an arbitrary full-world audit payload.

## 6. Implementation steps

1. Add Campaign `mode` and `rulesMode` with backward-compatible legacy/sandbox defaults for old payload parsing. New standalone creation will explicitly specify both.
2. Define the four simulation schemas and relationship contracts. Mode is separate from fictional/imported kind.
3. Leave schemaV1 unchanged. Register `version(1).stores(schemaV1)` and then `version(2).stores(schemaV2).upgrade(...)`. V2 preserves every existing store/index and adds:
   - simulationStates: unique campaignId;
   - clubSimulationStates: unique campaign+clubId and campaign+simulationKey;
   - playerSimulationStates: unique campaign+playerId and campaign+simulationKey;
   - simulationReceipts: unique campaign+operationKey.
4. Upgrade only old Campaign mode metadata. Do not add profiles, contracts, balances, results, eligibility or new DOBs to old saves.
5. Add repository operations that parse stored rows and reject cross-campaign IDs/references. SimulationState must reference the campaign's active season when written. Player/club profile references must belong to that campaign.
6. Include new stores in campaign delete/reset transaction scopes and row cleanup; do not delete another save's records.
7. Preserve current error codes and behavior. An unknown future version fails clearly without wiping data.

## 7. Tests to add/change

- Open a separate Dexie instance at version 1 using frozen schemaV1; insert a representative linked campaign/season/club/player/contract/ledger/audit/match/appearance fixture, close it, then open the current database class.
- Assert raw Campaign now has legacy/sandbox modes. Assert original record content and nulls survive, except those two additive fields. No simulation/profile rows appear.
- A fresh database has all old stores and four new stores; reopen is idempotent.
- Duplicate campaign state, profile identity/key or logical receipt is refused by actual indexes.
- Cross-campaign state/profile/receipt operations and invalid relationships fail without mutation.
- Campaign cleanup removes all its foundation rows and preserves another campaign.
- Old campaign commands still create legacy rows, and generator v1 tests remain unchanged.

Do not substitute a mock of the migration function for the real upgrade test.

## 8. Verification commands

```bash
pnpm exec vitest run src/test/simulation-migration.test.ts src/test/simulation-repositories.test.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Use existing Playwright installation; install Chromium only if missing. All required checks must pass before commit.

## 9. Manual acceptance check

Open an existing legacy demo and confirm its selected club, journal and finances survive reload. Opening the app must not create a simulated career or change game history. Verify the migrated mode fields through a test fixture/inspection, not by editing a real user DB.

## 10. Definition of done

- [ ] Actual v1 upgrade/fresh setup pass with preserved data.
- [ ] schemaV1 is unchanged; no generated world or extra initial money is inserted during upgrade.
- [ ] Scoped stores, relationships, cleanup and type/runtime defaults agree.
- [ ] No generator, clock, match engine, dependency or unrelated UI work.
- [ ] Required checks pass and evidence is recorded.

## 11. Commit instructions

Stage only this guide's code/tests and the phase progress entry. Do not stage later guide files or unrelated untracked plans.

```text
feat(p07-g02): introduce standalone save contracts
```

Record SHA and actual check results in phase §10. Do not commit failing checks or rewrite completed history.

## 12. Handoff

G03 can rely on typed SimulationState including lastBoundaryKey and receipts including inputFingerprint. It adds pure time/seed rules only. The database is v2, legacy saves remain legacy, and no standalone career is yet available.
