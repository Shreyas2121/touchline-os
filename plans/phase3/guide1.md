# P03-G01 — Deterministic fictional world

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §4.1 rule 9 and §6.1.
- **Parent phase:** `plans/phase3.md`, guide **P03-G01**. The world shape, PRNG, and draw order are phase §5 “Featured world, generator version 1” and “PRNG”. The work block is phase §6 `P03-G01`.
- **Predecessor guide:** none in Phase 3. Phase 2 is complete.
- **Predecessor commit:** `69b3dbb2c59cc98ce2fe23a53424368fab6b57cf` (`docs: record phase 2 guide commits`). Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p03-g01): generate deterministic fictional world`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase3.md` → this guide. This guide does not open IndexedDB, add a command, or change a screen.

## 2. Goal and user-observable result

The clickable shell stays the Phase 1 preview. What this commit adds is a pure generator:

- Seed `touchline-demo-v1`, generator version `1`, and campaign id `demo` produce 4 leagues, 72 clubs, and exactly 3,000 players.
- A second call with the same arguments deep-equals the first.
- Generator version `2` returns `{ ok: false }` and does not emit that world.
- The campaign id changes stored ids only. It does not change the random stream.
- Every player birth date is null. Source is `fictional`. A draft weekly wage exists and is not part of `playerSchema`.

`pnpm dev` still shows **Touchline OS** and `Static preview — not save data`. A page load still does not create `touchline-os`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor 69b3dbb2c59cc98ce2fe23a53424368fab6b57cf HEAD` succeeds.
- `src/domain/seed/` does not exist. If it does, stop and reconcile with this guide before editing.
- `src/data/` already exists from Phase 2. Do not add files under it.
- Do not add a package. Do not edit `schemaV1`.
- Leave `MASTER_PLAN.md` and `plans/phase3.md` unchanged in this commit. If `plans/phase3.md` is still untracked, leave it untracked.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase3.md` §5 from “Featured world, generator version 1” through the PRNG draws, and the `P03-G01` block in §6.
- `src/domain/validation/result.ts` — `ParseResult<T>`. Return that. Do not invent a second result type.
- `src/domain/models/positions.ts` — `positionGroupFor`. Use it. Do not re-map positions by hand.
- `src/domain/validation/schemas.ts` — `playerSchema`. A generated player, with `weeklyWageCents` removed, must parse.
- `src/domain/validation/limits.ts` — names, short names, prestige, academy tier, and attribute bounds already exist.
- `eslint.config.js` — `src/domain/**` already rejects `Math.random`, `Date.now`, and `new Date`. `Math.imul` is allowed.
- `src/test/dates.test.ts` — Vitest style to copy. No React render.
- `src/main.tsx` — read-only. It must stay free of `src/domain/seed`.

`src/data/commands/seed-demo.ts` does not exist. Do not create it.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/seed/prng.ts` | `hashSeed`, `mulberry32`, `nextInt` |
| `src/domain/seed/names.ts` | Fixed league, club, syllable, region, and nationality lists |
| `src/domain/seed/generate-world.ts` | `generateWorld` and the featured constants |
| `src/test/generate-world.test.ts` | Determinism, counts, and the version failure |

Do not create `src/domain/seed/index.ts`. Do not edit feature pages, `src/app/copy.ts`, `src/main.tsx`, `README.md`, or `src/data/**`.

### Public API

```ts
export function hashSeed(seed: string, generatorVersion: string): number

export function mulberry32(seed: number): () => number

export function nextInt(rng: () => number, span: number): number

export const GENERATOR_VERSION = '1'
export const FEATURED_SEED = 'touchline-demo-v1'
export const FEATURED_CAMPAIGN_ID = 'demo'

export type GeneratedLeague = {
  id: string
  campaignId: string
  name: string
  countryCode: string
  tier: number
}

export type GeneratedClub = {
  id: string
  campaignId: string
  leagueId: string
  name: string
  shortName: string
  colors: { primary: string; secondary: string }
  prestige: number
  academyTier: number
  scoutingRegion: string
}

export type GeneratedPlayer = {
  id: string
  campaignId: string
  clubId: string | null
  name: string
  positionGroup: PositionGroup
  positions: [Position]
  nationalityCode: string
  birthDate: null
  reportedAge: number
  ageReferenceSeasonOrdinal: 1
  marketValueCents: number
  attributes: {
    pace: number
    finishing: number
    passing: number
    dribbling: number
    defending: number
    physical: number
  }
  potential: number
  source: 'fictional'
  externalSourceId: null
  isNewgen: false
  weeklyWageCents: number
}

export type GeneratedWorld = {
  leagues: GeneratedLeague[]
  clubs: GeneratedClub[]
  players: GeneratedPlayer[]
}

export function generateWorld(input: {
  seed: string
  generatorVersion: string
  campaignId: string
}): ParseResult<GeneratedWorld>
```

`campaignId` is not an input to `hashSeed`. Two campaign ids with the same seed and version share prestige, attributes, ages, and names, and differ in `id`, `campaignId`, `leagueId`, and `clubId`.

## 6. Implementation steps

1. Add `prng.ts` with the exact functions from phase §5. `nextInt(rng, span)` is `Math.floor(rng() * span)`. Do not call `Math.random`.
2. Add the fixed lists in `names.ts`.
   - Leagues, in order: `Northwater Premier` / `SE` / tier 1, `Redfen Championship` / `PT` / tier 2, `Calderan League` / `NL` / tier 3, `Ostmark Regional` / `AT` / tier 4.
   - Prefixes: `Ash`, `Black`, `Brine`, `Castle`, `East`, `Ferry`, `Grey`, `High`, `Iron`, `Kings`, `Low`, `North`, `Port`, `Red`, `South`, `West`, `White`, `Wind`.
   - Suffixes: `bridge`, `dale`, `ford`, `gate`.
   - Given syllables: `an bel cor dan eli fen gar hal ira jos kel lan mir nia oren pel quin rae sol tae ulf vera wyn yor`.
   - Family syllables: `beck cairn dold esth falk greve holt isk jorn kell marsh nord ost pell quay rost skar thorn ulm voss wren yarrow`.
   - Regions: `north`, `south`, `east`, `west`, `coast`, `inland`.
   - Nationalities: `SE`, `PT`, `NL`, `AT`, `NO`, `DK`, `FI`, `IE`, `PL`, `CZ`.
   - Color pairs, in order: `#1F2933/#C4A35A`, `#16302A/#D7E2DC`, `#3B1D2A/#E6C07B`, `#102A43/#9FB3C8`, `#3F2A1D/#E8D5C4`, `#1D2B1F/#F2C14E`, `#241E33/#C3B4E0`, `#3A2F2F/#A8DADC`.
3. Club index `i` from 0 through 71 is named `prefixes[i % 18] + suffixes[Math.floor(i / 18)]`. League index is `Math.floor(i / 18)`. Ids are `${campaignId}-league-${n}` for n = 1..4, `${campaignId}-club-${nn}` for nn = `01`..`72`, and `${campaignId}-player-${nnnn}` for nnnn = `0001`..`3000`. Pad with `String(n).padStart`.
4. `shortName` is the first three characters of the club name, uppercased. Walk clubs in index order. On a collision append `2`, then `3`, and so on. `Ashbridge` is `ASH`. `Ashdale` is `ASH2`.
5. Build one `mulberry32(hashSeed(seed, generatorVersion))` stream for the whole world. Consume it in this order and nowhere else.
   - Per club, index order: palette `nextInt(rng, 8)`, prestige `20 + nextInt(rng, 71)`, academy `1 + nextInt(rng, 5)`, region `nextInt(rng, 6)`.
   - Per player, id order: position ticket `nextInt(rng, 28)`, nationality `nextInt(rng, 10)`, age `16 + nextInt(rng, 23)`, then `pace`, `finishing`, `passing`, `dribbling`, `defending`, `physical`, potential `40 + nextInt(rng, 56)`, market step `nextInt(rng, 799)`, wage step, given-name length, given syllables, one family syllable.
6. Position tickets use weights GK 2, CB 4, LB 2, RB 2, CDM 2, CM 4, CAM 2, LM 1, RM 1, LW 2, RW 2, ST 3, CF 1. Walk that list, subtract the weight, and stop when the remaining ticket is inside the weight. Store one position. Set `positionGroup` with `positionGroupFor`.
7. Attribute bounds are inclusive. Draw `min + nextInt(rng, max - min + 1)`.

   | Group | pace | finishing | passing | dribbling | defending | physical |
   | --- | --- | --- | --- | --- | --- | --- |
   | GK | 20–55 | 5–30 | 25–60 | 15–45 | 30–70 | 40–80 |
   | DEF | 30–80 | 15–50 | 30–75 | 25–70 | 45–90 | 40–90 |
   | MID | 35–85 | 30–80 | 45–90 | 40–90 | 25–80 | 35–85 |
   | FWD | 45–95 | 50–95 | 30–80 | 45–90 | 15–50 | 35–85 |

8. `marketValueCents` is `(2 + marketStep) * 2_500_000`. Wage step count is 16 when age is 21 or under, 40 when age is 32 or over, and 157 otherwise. `weeklyWageCents` is `(1 + nextInt(rng, stepCount)) * 50_000`. Draw the step count from the age before drawing the step.
9. Given-name syllable count is 2 when `nextInt(rng, 2) === 0`, otherwise 3. Then draw that many given syllables, then one family syllable. Capitalize the first letter of each word and join with one space.
10. Squad size of club index `i` is `36 + (i % 9)`. Fill players `0001`–`2880` in club index order. Players `2881`–`3000` have `clubId: null`.
11. `generateWorld` returns `{ ok: false, message: 'Unsupported generator version.' }` when `generatorVersion !== '1'`. It does not read the clock and it does not accept a `Math.random` fallback.
12. In the test, drop `weeklyWageCents` and parse each of the 3,000 players with `playerSchema`. Also parse every league and club with `leagueSchema` and `clubSchema`.

## 7. Tests to add/change

Create `src/test/generate-world.test.ts`.

- Two `generateWorld` calls with `FEATURED_SEED`, `GENERATOR_VERSION`, and `FEATURED_CAMPAIGN_ID` are deep-equal and `ok: true`.
- The same arguments with seed `other-seed` return a world that is not deep-equal to the featured world.
- Version `2` returns `ok: false`. The featured call is unchanged.
- Campaign id `other` with the featured seed keeps club 0’s prestige and player 0’s `pace`, and changes `clubs[0].id` from `demo-club-01` to `other-club-01`.
- Lengths are 4, 72, and 3,000. Free agents are 120. `demo-player-0001` has `clubId` `demo-club-01`. `demo-player-2881` has `clubId` null. Club index 0 has 36 players. Club index 71 has 44.
- League names are exactly the four strings in §6, in that order.
- Every `birthDate` is null, every `source` is `fictional`, every `isNewgen` is false, and every `marketValueCents` and `weeklyWageCents` is a nonnegative integer.
- `playerSchema`, `leagueSchema`, and `clubSchema` accept the world after `weeklyWageCents` is omitted.
- Read `src/domain/seed/prng.ts`, `names.ts`, and `generate-world.ts` as text and expect no `Math.random`.

No test opens a database. Do not edit Phase 1 or Phase 2 tests.

## 8. Verification commands

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- Each command exits 0.
- `pnpm test` includes the previous files plus `generate-world.test.ts`.
- `pnpm test` does not open a browser and does not open `touchline-os`.

`pnpm test:e2e` is not a gate for this guide. Do not run it unless a file under `src/app`, `src/features`, `src/components`, or `e2e` changed. Those paths are not in §5. Revert that change instead of adding an end-to-end run.

## 9. Manual acceptance check

1. `pnpm dev`, open `/`. The heading is `Touchline OS`. **Create new campaign** still shows `Campaigns cannot be saved in this build.`
2. Open `/app/demo/command-center`. The banner reads `Static preview — not save data`. The KPI values read `Preview`.
3. In the browser application-storage panel, no database named `touchline-os` appears.

The generator is proven by `src/test/generate-world.test.ts`. There is no seed button in this commit.

## 10. Definition of done

- [ ] `generateWorld` for the featured seed, version `1`, and id `demo` returns 4 leagues, 72 clubs, and 3,000 players, and a second call deep-equals the first.
- [ ] Version `2` returns `ok: false`.
- [ ] A different campaign id changes ids only.
- [ ] No generated player has a birth date. Source is `fictional`. `isNewgen` is false.
- [ ] `weeklyWageCents` is present on the draft and absent from the object passed to `playerSchema`.
- [ ] Seed modules do not call `Math.random`, `Date.now`, or `new Date`.
- [ ] `schemaV1`, repositories, commands, and the shell are unchanged.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase3.md` have no edits in this commit.

## 11. Commit instructions

Stage `src/domain/seed/**`, `src/test/generate-world.test.ts`, and `plans/phase3/guide1.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase3.md`.

Suggested message:

```text
feat(p03-g01): generate deterministic fictional world
```

Do not commit when §8 is failing. Do not amend `69b3dbb2c59cc98ce2fe23a53424368fab6b57cf`. After the commit succeeds, record its full SHA on the `P03-G01` row of the progress log in `plans/phase3.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P03-G02` may call `generateWorld`, `GENERATOR_VERSION`, `FEATURED_SEED`, and `FEATURED_CAMPAIGN_ID`. It strips `weeklyWageCents` before `playerSchema`. It does not change the draw order.

Known limitations this guide leaves on purpose:

- Nothing writes the world to IndexedDB.
- The welcome screen still cannot save a campaign.
- Wages are draft numbers only. There is no contract row.
