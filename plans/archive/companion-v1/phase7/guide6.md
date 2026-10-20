> **ARCHIVED / SUPERSEDED — reference only.** This companion plan was replaced on 2026-10-20 by MASTER_PLAN.md 2.0.0 and the active plans/phase7.md. Do not execute these instructions. Completed P07-G01 remains in plans/phase7/guide1.md unchanged.

---

# P07-G06 — Secure the season lifecycle

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §12.2 invariants 7 and 8, and the Phase 7 exit in §9.
- **Parent phase:** `plans/phase7.md`, guide **P07-G06**. The data scenario and the browser journey are phase §6 `P07-G06`. The exit checks are phase §7 and §8.
- **Predecessor guide:** `plans/phase7/guide5.md`. `P07-G03` and `P07-G04` must also be ancestors.
- **Predecessor commit:** the commit whose subject is `feat(p07-g05): support optional academy newgens`. Verify with `git log --grep="feat(p07-g05): support optional academy newgens" -1 --format=%H`.
- **Commit subject:** `test(p07-g06): secure season lifecycle`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase7.md` → this guide. This guide does not change a formula, a verdict message, or a screen except to fix a defect the new tests expose. A defect fix stays inside this commit only when it makes the existing contract true. Do not weaken the 200_000_000 carryover or the 45-minute correction.

## 2. Goal and user-observable result

The season rules are proven together, and a browser journey can record a match, correct its minutes, and advance once:

- 90 minutes corrected to 45 stay 45.
- A qualifying offer blocks rollover.
- A 40% carryover of 500_000_000 cents stores 200_000_000 once on the new season.
- The reported age field stays 20 while the next season displays 21, estimated.
- Two planning candidates stay off the squad.
- After the journey, Scouting still shows the preview banner.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P07-G05 sha> HEAD` succeeds.
- `recordMatch`, `correctMatch`, `advanceSeason`, and `generateNewgens` exist.
- `e2e/seasons.spec.ts` does not exist. If it does, stop and reconcile before editing.
- `playwright.config.ts` has no `storageState`. Leave it that way.
- Do not install a package. Do not edit `schemaV1` or the demo seed.

## 4. Files to inspect

- `plans/phase7.md` §6 `P07-G06`, §7, and §8.
- `src/data/commands/record-match.ts`, `correct-match.ts`, and `advance-season.ts`.
- `src/domain/finance/carryover.ts` and `src/domain/matches/season-record.ts`.
- `e2e/transfers.spec.ts` — copy the demo start, the club choice, and the fresh-context pattern. Do not change that spec's minutes assertion.
- `playwright.config.ts`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/test/season-lifecycle.test.ts` | The ten-step data scenario |
| `e2e/seasons.spec.ts` | The browser journey |

Do not modify the carryover formula, `evaluateAction`, or the minute sum unless a new test shows the implementation broke the phase contract. Prefer a test fix when the test, not the contract, is wrong.

## 6. Implementation steps

1. Write the Vitest scenario in phase §6, in order, against `touchline-os-test`.
2. Save a new constitution version to set `carryoverPct` to 40. Do not change `constitutionPreset('balanced')`.
3. Leave the qualifying offer open. Save a constitution version that disables `PRESTIGE_BID_SALE` and sets `carryoverPct` to 40. Do not call `acceptOffer` here. A sale would change the 500_000_000 remaining capacity. Do not disable the rule inside `advanceSeason`.
4. Assert the new season has one `approved_carryover` of 200_000_000 and no `initial_allocation`. The old season's remaining capacity is still 500_000_000.
5. Assert `generateNewgens: true` on that successful advance inserts two players with `clubId` null. Campaign B does not list them.
6. Write `e2e/seasons.spec.ts` with a 120-second timeout and a fresh context. Follow the ten browser steps in phase §6. Choose the first player in the match form's player select. Do not hardcode a generated name.
7. Do not confirm rollover twice. The Vitest owns the second-close refusal.
8. Do not add `storageState`, shrink the seed, or record a result the user did not type.

## 7. Tests to add/change

The scenario in `src/test/season-lifecycle.test.ts` covers:

- The 90-to-45 correction leaves one appearance.
- An incomplete match does not change that 45.
- The qualifying offer blocks, and the season stays active.
- The later advance posts 200_000_000 once.
- The second close writes nothing.
- Stored age fields stay put, `displayAge` is 21 estimated, and the old appearance is still 45.
- Two prospects exist off the squad and are invisible to campaign B.
- A thrown command body leaves the revision unchanged.

`e2e/seasons.spec.ts` covers the journal reload, the minute correction, one advance, the planning-candidate sentence, and the Scouting banner.

## 8. Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: each command exits 0. `pnpm test` includes `season-lifecycle.test.ts`. `pnpm test:e2e` includes the previous five specs plus `e2e/seasons.spec.ts`.

## 9. Manual acceptance check

Run the manual pass in `plans/phase7.md` §8. The browser spec is the automated form of steps 2, 3, 4, 7, and the Scouting check. The 40% ledger figure stays in Vitest.

## 10. Definition of done

- [ ] Invariants 7 and 8 pass in the combined scenario.
- [ ] The browser journey records, corrects, advances once, and still sees the Scouting banner.
- [ ] No formula, preset, or seed was weakened to make a test pass.
- [ ] Lint, typecheck, test, build, and e2e pass.
- [ ] `plans/phase7.md` §10 can be filled with this commit's SHA. The six subjects match §1.

## 11. Commit instructions

Stage the two new test files and this guide. Stage a phase-log edit only when it records this SHA.

```text
test(p07-g06): secure season lifecycle
```

Do not commit when a verification command fails.

## 12. Handoff

Phase 7's implementation is ready for the exit checks in `plans/phase7.md` §8 and §10. Phase 8 may read minutes, ages, and planning candidates. It may not invent minutes, fabricate a radar from empty attributes, or generate match results.
