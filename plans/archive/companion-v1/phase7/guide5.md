> **ARCHIVED / SUPERSEDED — reference only.** This companion plan was replaced on 2026-10-20 by MASTER_PLAN.md 2.0.0 and the active plans/phase7.md. Do not execute these instructions. Completed P07-G01 remains in plans/phase7/guide1.md unchanged.

---

# P07-G05 — Support optional academy newgens

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §6.3 and §4.1 rules 5 and 10.
- **Parent phase:** `plans/phase7.md`, guide **P07-G05**. Generation rules are phase §5 “Newgens”. The work block is phase §6 `P07-G05`.
- **Predecessor guide:** `plans/phase7/guide4.md`.
- **Predecessor commit:** the commit whose subject is `feat(p07-g04): advance campaign seasons explicitly`. Verify with `git log --grep="feat(p07-g04): advance campaign seasons explicitly" -1 --format=%H`.
- **Commit subject:** `feat(p07-g05): support optional academy newgens`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase7.md` → this guide. This guide does not add a prospect to the squad and does not synthesize a birth date.

## 2. Goal and user-observable result

The rollover form has `Generate planning candidates`. A fictional campaign starts checked. An imported campaign starts unchecked. A checked confirm adds a small seeded batch of free agents labeled `Generated`. They are not on the squad. An unchecked confirm adds nobody.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P07-G04 sha> HEAD` succeeds.
- `advanceSeason` exists and rejects a newgen field if one is sent, because the input is strict. This guide widens that input.
- Do not install a package. Do not edit `schemaV1`, `importReceiptSchema`, or `DATABASE_VERSION`.
- Do not call `generateWorld` from the new generator.
- Leave `plans/phase7/guide6.md` unstaged.

## 4. Files to inspect

- `plans/phase7.md` §5 “Newgens”.
- `src/domain/seed/prng.ts` — `hashSeed`, `mulberry32`, `nextInt`.
- `src/domain/seed/names.ts` — `givenSyllables`, `familySyllables`, `nationalities`.
- `src/domain/seed/generate-world.ts` — `GENERATOR_VERSION`. Do not change the world generator's output.
- `src/data/commands/advance-season.ts` and its tests. Every existing call site must pass the new fields on purpose.
- `src/data/repositories/players.ts` — `insertPlayer` allows `clubId: null`.
- `src/features/seasons/RolloverForm.tsx`.
- `src/domain/player/squad-view.ts` — `displayAge` and `sourceLabel`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/seed/newgens.ts` | `generateNewgens` |
| `src/data/commands/advance-season.ts` | Flag, id list, inserts |
| `src/features/seasons/RolloverForm.tsx` | Checkbox and preview sentences |
| `src/features/seasons/SeasonsPage.tsx` | Candidate list |
| `src/test/newgens.test.ts` | Determinism and the screen |
| `src/test/advance-season.test.ts` | Pass the new fields |
| `README.md` | Newgen writes. Scouting, import, and backup stay previews |

### Public API

```ts
export function generateNewgens(input: {
  seed: string
  generatorVersion: string
  ordinal: number
  academyTier: number
  campaignId: string
  prospectIds: readonly string[]
}): Player[]
```

`prospectIds.length` must equal `academyTier`. A version other than `GENERATOR_VERSION` returns an empty array. The seed passed in is the campaign seed, or the campaign id when the seed is null. Inside the function, hash `${seed}:newgen:${ordinal}` with the generator version.

The command input gains:

```ts
generateNewgens: boolean
prospectIds: string[]
```

`false` requires an empty `prospectIds`. `true` requires the length to equal the managed club's `academyTier`. The command calls `generateNewgens` inside the transaction and inserts those rows. It ignores any name supplied by the client, because the client does not supply names.

## 6. Implementation steps

1. Add `generateNewgens`. Ages are only 16, 17, or 18. `birthDate` is null. `clubId` is null. `source` is `'generated'`. `isNewgen` is true. `marketValueCents` is null. `ageReferenceSeasonOrdinal` is the new ordinal. Build names from the existing syllable lists. Draw with `mulberry32` only.
2. Extend `advanceSeason` after the season insert and the optional carryover insert, and before the audit. On `generateNewgens: false`, insert nobody. On `true`, generate and `insertPlayer` each row. Do not update any existing player.
3. Put `generatedNewgens` on the existing `season.advance` payload as the inserted count. Do not write a second audit.
4. Add the checkbox. Default it from `campaign.kind === 'fictional'`. Preview sentences, exact:
   - checked: `This rollover will add ${academyTier} planning candidates.`
   - unchecked: `This rollover will not add planning candidates.`
5. The preview still includes `Preview only — no changes recorded.` and still does not write.
6. On the active season, list candidates with name, `displayAge` text, and `Generated`. Empty copy: `No planning candidates were generated.` Sentence, exact: `These prospects are planning candidates. They are not on the squad.` Do not render `Add to squad`.
7. Update existing advance tests so they pass `generateNewgens: false` and `prospectIds: []` unless a test is about generation.

## 7. Tests to add/change

Create `src/test/newgens.test.ts`:

- The same seed, `'1'`, ordinal 2, tier 3, and the same three ids return deep-equal players. Each age is 16, 17, or 18. `birthDate` is null, `clubId` is null, `source` is `'generated'`, and `isNewgen` is true.
- A different ordinal returns a different first name.
- A fictional `advanceSeason` with the flag true and tier 2 inserts two players. The managed club's player count is unchanged.
- An imported campaign with the flag false inserts nobody.
- Closing that same season again still writes nothing, so the two players are not duplicated.
- A rendered seasons page shows the planning-candidate sentence and does not show `Add to squad`.

`Math.random` and `Date` do not appear in `src/domain/seed/newgens.ts`.

## 8. Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: each command exits 0. `pnpm test` includes `newgens.test.ts`.

## 9. Manual acceptance check

1. On the fictional demo, open Seasons. The checkbox starts checked. Preview mentions the academy-tier count and says nothing was recorded.
2. Confirm. The candidate list is visible and says they are not on the squad.
3. Open Squad. Those names are not rows of the managed club.
4. Create a campaign only if an imported kind is already reachable. If it is not, the imported opt-out is covered by the Vitest above. Do not add an import flow.

## 10. Definition of done

- [ ] Prospects are generated only inside `advanceSeason`, and only when the flag is true.
- [ ] They are free agents with a null birth date and source `generated`.
- [ ] The same inputs repeat the same players. A second close does not insert them again.
- [ ] No squad button and no second audit were added.
- [ ] Lint, typecheck, test, build, and e2e pass.

## 11. Commit instructions

Stage only this guide's files.

```text
feat(p07-g05): support optional academy newgens
```

Do not commit when a verification command fails. Record the SHA in `plans/phase7.md` §10.

## 12. Handoff

- `generateNewgens` is pure. `advanceSeason` now requires the flag and the id list.
- The season page lists planning candidates and does not place them.
- The next guide locks the lifecycle scenario and the browser journey. It must not change the 200_000_000 carryover or the 45-minute correction.
