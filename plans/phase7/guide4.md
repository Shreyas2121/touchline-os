# P07-G04 — Generate playable club worlds

## 1. Context and authority

- Master: `MASTER_PLAN.md` 2.0.0 §§4.3 and 6.1.
- Parent: `plans/phase7.md` §5.4.
- Predecessor: `guide3.md`; find `feat(p07-g03): define deterministic game time` and verify ancestry.
- Commit: `feat(p07-g04): generate playable club worlds`.

## 2. Goal and user-observable result

A pure generator produces a complete, reproducible standalone world with legal squad coverage, known contracts, profile inputs and finite budgets. Historical generator v1 remains unchanged. No new save or simulated result is written yet.

## 3. Preconditions

G02 schemas and G03 clock/seed APIs exist. Do not change schemaV1, generator v1 output, installed packages or old demo identity. No fixture generator, transfer AI, development, wage payroll or rollover.

## 4. Files to inspect

- `src/domain/seed/generate-world.ts`, `prng.ts`, `names.ts`.
- `src/domain/models/positions.ts` and `src/domain/graphics/pitch.ts` supported formations.
- Existing player/contract/club schemas, simulation profile schemas and board presets.
- `src/domain/finance/wages.ts` and `src/domain/player/squad-view.ts`.
- `src/test/generate-world.test.ts` and `src/test/constitution-presets.test.ts`.

## 5. Files to create/modify

| Path                                           | Change                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `src/domain/seed/generate-playable-world.ts`   | PLAYABLE_GENERATOR_VERSION='2', pure world DTO                |
| `src/domain/seed/playable-world-validation.ts` | Whole-world references, contracts, coverage and budget checks |
| `src/domain/player/ability.ts`                 | Documented role/GK ability calculation                        |
| `src/domain/seed/playable-world-settings.ts`   | Versioned generation/value/wage constants                     |
| `src/test/generate-playable-world.test.ts`     | Full-world determinism and playability                        |
| `src/test/player-ability.test.ts`              | Position-aware strength/proxy integrity                       |

Expose `generatePlayableWorld({seed, generatorVersion: '2', campaignId, startYear}): ParseResult<PlayableWorld>`. DTO includes leagues, clubs, players, contracts, clubSimulationStates and playerSimulationStates. Campaign/season/constitution/receipts are G05's responsibility.

## 6. Implementation steps

1. Retain generator v1 exports and behavior; add v2 separately. Reuse names/palettes/geometry as appropriate.
2. Generate stable logical club/player keys and assign persistence IDs separately. Enforce the new campaign ID length/mapping bound without changing legacy identity limits.
3. Keep exactly four leagues, 72 clubs, 2,880 owned players and 120 free agents. Allocate guaranteed positional coverage before seeded discretionary positions; every club needs at least two GKs and a valid XI/bench.
4. Add role-weighted current ability using known attributes and a separate explicit goalkeeper rating. Document weights/normalization as fictional gameplay heuristics. Do not reuse an arithmetic mean that treats outfield finishing as keeper ability.
5. Generate prestige-related ability bands and potential >= current role ability. Use bounded seeded variance and valid integer ranges.
6. Define and publish integer-cent valuation/wage formulas that depend on age/ability/potential rather than independent random prices. Set realistic-for-this-game budget scale and known squad tiers; no external football fact claims.
7. Give every owned active player one valid complete contract, with start July 1 and expiry no earlier than the first June 30. Free agents have no active contract.
8. Generate finite transfer balances; set wage ceilings at least current commitments plus a documented recruitment margin. Keep these balances distinct from the managed board's policy capacity.
9. Populate fitness 100, known sharpness, no injury/ban, active status and explicit fictional eligibility. Provide enough non-exempt homegrown players for feasible Balanced and Strict registration selections.
10. Validate every reference and unique ID/key plus coverage/contract/financial invariants before returning. Unsupported versions or invalid inputs return a clear failure without a partial DTO.

Do not hide tuning decisions in UI components. Later match/market code will reuse the declared ability/value functions and constants.

## 7. Tests to add/change

- Full production counts and every-club positional/registration feasibility.
- Exactly one owned-player active contract; free agents have none; known money/tier/dates; budgets cover commitments.
- Valid GK profile and potential >= role ability for every player.
- Fixed seed/version/year repeats. A different campaignId changes references only; no seeded logical football content changes.
- Different seed changes content without breaking invariants; test several fixed seeds for squad feasibility.
- Controlled formula cases establish ability/age/potential effects and integer money boundaries.
- Unsupported version and overly long generated identities fail clearly.
- All generator v1 tests still pass with identical featured output.

## 8. Verification commands

```bash
pnpm exec vitest run src/test/generate-playable-world.test.ts src/test/player-ability.test.ts src/test/generate-world.test.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These checks certify data generation, not match realism or game balancing.

## 9. Manual acceptance check

Inspect a seeded generated-world fixture summary for all clubs: squad size, GK count, contract count, commitment vs wage ceiling and feasible registration. Repeat the seed under another campaign ID and compare normalized logical data. Do not insert into the user's campaign to inspect it.

## 10. Definition of done

- [ ] Generator v2 returns a complete validated world; no persistence writes.
- [ ] No sparse contracts/keeper inputs, impossible starting squads or independent arbitrary prices.
- [ ] Stable keys ignore campaign IDs and audit timestamps.
- [ ] Generator v1 remains reproducible and unchanged.
- [ ] Required checks pass; tuning constants are documented and versioned.

## 11. Commit instructions

```text
feat(p07-g04): generate playable club worlds
```

Stage the pure generator/helpers/tests and phase evidence only. Record actual SHA/checks, not a claim that new careers or matches are already playable.

## 12. Handoff

G05 can prepare and atomically persist this complete DTO with season, modes, board policy, opening allocation and initialization receipt. Generation does not imply a new-game command, AI market, fixtures or results already exist.
