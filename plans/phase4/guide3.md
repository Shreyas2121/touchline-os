# P04-G03 — Generated clubs and pitch

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §3.2 and §14.
- **Parent phase:** `plans/phase4.md`, guide **P04-G03**. Crest marks, monograms, pitch lines, and the eleven-slot formations are phase §5 “Crests and pitch”. The work block is phase §6 `P04-G03`.
- **Predecessor guide:** `plans/phase4/guide2.md`.
- **Predecessor commit:** the commit whose subject is `feat(p04-g02): add player details and notes`. Verify with `git log --grep="feat(p04-g02): add player details and notes" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p04-g03): render generated clubs and pitch`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase4.md` → this guide. This guide does not assign a player to a slot and does not write a lineup.

## 2. Goal and user-observable result

The managed club becomes visible as a mark, and Tactics shows a real pitch:

- Squad shows an image named `${club.name} crest` next to the club name. The same club always gets the same mark. The colors are the colors stored on the club.
- Tactics shows that crest and a pitch named `Pitch`. The pitch does not move and does not name a player.
- Tactics says `Lineups are not saved in this build.` The preview banner is still on Tactics.
- There is no formation select and no slot button yet.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P04-G02 sha> HEAD` succeeds, using the SHA from §1.
- `src/domain/graphics/` and `src/components/graphics/` do not exist. If either does, stop and reconcile before editing.
- `src/components/**` still cannot import `src/domain` or `src/data`. Keep that fence. Pass plain props into the SVG components.
- `src/domain/**` already rejects `Math.random`. `hashSeed` is allowed.
- Do not edit `schemaV1`. Do not add a package.
- Leave `MASTER_PLAN.md` and `plans/phase4.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase4.md` §5 “Crests and pitch”, including the four formation tables, and the `P04-G03` block in §6.
- `src/domain/seed/prng.ts` — `hashSeed(seed, generatorVersion)`. Use it with generator version `crest-v1`. Do not call `mulberry32`.
- `src/features/squad/SquadPage.tsx` — the club record is already loaded. Render the crest from that record.
- `src/features/tactics/TacticsPage.tsx` — it still renders `pitchPreview`.
- `src/features/dashboard/CommandCenterPage.tsx` — copy the unconfirmed-demo redirect. Do not change the command center.
- `src/app/copy.ts` — `pitchPreview`. Remove it in this guide if nothing imports it afterward.
- `e2e/smoke.spec.ts` — it expects `pitchPreview` on Tactics.
- `eslint.config.js` — the component import ban. A crest component that imports `crestSpec` will fail lint.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/graphics/crest.ts` | `crestSpec` |
| `src/domain/graphics/pitch.ts` | `pitchLinePaths` and `formationSlots` |
| `src/components/graphics/CrestSvg.tsx` | Presentational crest |
| `src/components/graphics/PitchSvg.tsx` | Presentational pitch |
| `src/test/crest-pitch.test.ts` | Marks, monograms, slots, stable lines |
| `src/features/squad/SquadPage.tsx` | Club heading and crest |
| `src/features/tactics/TacticsPage.tsx` | Crest, pitch, and the unsaved sentence |
| `src/app/copy.ts` | Tactics loading, failure, and the unsaved sentence. Delete `pitchPreview` if unused |
| `e2e/smoke.spec.ts` | Expect the pitch name and the new sentence |

Do not create `src/features/tactics/TacticsBoard.tsx`. Do not add slot buttons.

### Public API

```ts
export type CrestMark = 'shield' | 'stripe' | 'chevron' | 'monogram'

export type CrestSpec = {
  mark: CrestMark
  primary: string
  secondary: string
  monogram: string
}

export function crestSpec(club: {
  id: string
  name: string
  colors: { primary: string; secondary: string }
}): CrestSpec

export type PitchLine = { id: string; d: string }

export function pitchLinePaths(): readonly PitchLine[]

export type FormationId = '4-3-3' | '4-2-3-1' | '4-4-2' | '3-5-2'

export type FormationSlot = {
  id: string
  label: string
  group: 'GK' | 'DEF' | 'MID' | 'FWD'
  x: number
  y: number
}

export function formationSlots(formation: FormationId): readonly FormationSlot[]
```

`CrestSvg` props are `CrestSpec` plus `title: string`. `PitchSvg` props are `{ paths: readonly PitchLine[] }`. Neither component imports the domain.

## 6. Implementation steps

1. `crestSpec` sets `mark` from `hashSeed(club.id, 'crest-v1') % 4`: `0` shield, `1` stripe, `2` chevron, `3` monogram. `primary` and `secondary` are `club.colors` unchanged. The monogram is the uppercase first letter of each whitespace-separated word, at most three letters. A name with no letters uses `?`. `Harbor Athletic` is `HA`. `Ashbridge` is `A`.
2. Draw the crest in a `0 0 64 64` viewBox. Shield, stripe, and chevron are filled shapes. Monogram renders the monogram string as SVG text. The background uses `primary`. The mark uses `secondary`. `role="img"`, `aria-label={title}`, and a `<title>` with the same string. No `<image>`, no remote URL, and no `<animate>`.
3. `pitchLinePaths` returns the same array on every call. Required ids, each once: `touchline`, `halfway`, `center-circle`, `penalty-top`, `penalty-bottom`, `six-yard-top`, `six-yard-bottom`, `goal-top`, `goal-bottom`. Use viewBox coordinates that fit `0 0 680 1050`. Do not include a player name or a slot id in a path id.
4. `formationSlots` returns the eleven slots in the order and with the coordinates published in phase §5. Labels are the slot ids in uppercase (`gk` → `GK`, `rcb` → `RCB`). Slot ids are unique inside one formation. `x` and `y` are the published percentages.
5. `PitchSvg` renders those paths inside `<svg viewBox="0 0 680 1050" role="img" aria-label="Pitch">` with `<title>Pitch</title>`. No animation, no script, and no player nodes.
6. On the squad page, render an `h2` with the managed club’s name and `CrestSvg` with `title={`${club.name} crest`}`. If the club is missing, do not invent a crest.
7. `TacticsPage` loads the campaign the same way `SquadPage` does, including the unconfirmed-demo redirect. Loading copy is `Loading tactics.` Failure copy is `This tactics board could not be loaded. Reload and try again.` Then render the crest, `PitchSvg`, and the exact sentence `Lineups are not saved in this build.` Do not render a formation control. Leave the preview banner in place. `WorkspaceLayout` does not gain a tactics exception in this guide.
8. Delete the `pitchPreview` export when `e2e/smoke.spec.ts` no longer imports it. The smoke spec’s Tactics step expects the accessible name `Pitch`, the sentence `Lineups are not saved in this build.`, and `previewBanner`. Squad and Constitution assertions from `P04-G01` stay.

## 7. Tests to add/change

`src/test/crest-pitch.test.ts`:

- For a club id, `crestSpec(...).mark` equals `['shield', 'stripe', 'chevron', 'monogram'][hashSeed(id, 'crest-v1') % 4]`.
- Two calls with the same id, name, and colors deep-equal. A second id may change the mark. Neither call changes the colors that were passed in.
- `crestSpec` of a club named `Harbor Athletic` has monogram `HA`. A club named `!!!` has monogram `?`.
- Each formation returns 11 slots, unique ids, and the `gk` slot at `x` 50 and `y` 90 for `4-3-3` and `3-5-2`.
- `pitchLinePaths()` deep-equals a second call and contains every required id exactly once.
- Render `CrestSvg` with title `Ashbridge crest` and find that accessible name. Render `PitchSvg` and find `Pitch`. The pitch container’s `innerHTML` does not contain `<animate`.

No test writes a lineup row. Do not seed the 3,000-player world for this file.

Update `e2e/smoke.spec.ts` as in §6.

## 8. Verification commands

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: each command exits 0. `pnpm test` includes `crest-pitch.test.ts`. Lint fails if `CrestSvg.tsx` or `PitchSvg.tsx` imports `src/domain`.

## 9. Manual acceptance check

1. `pnpm dev`. Open the fictional demo, choose `Ashbridge`, and open Squad.
2. The crest’s accessible name is `Ashbridge crest`. Reload. The mark and colors are unchanged.
3. Open Tactics. The pitch name `Pitch` is visible. The sentence `Lineups are not saved in this build.` is visible. The preview banner is visible. No player name sits on the pitch.
4. Open Constitution. The preview banner and `Rules are not active in this build.` are still there.

## 10. Definition of done

- [ ] Crest mark and monogram follow §6, and colors are the stored colors.
- [ ] The pitch exposes `Pitch`, includes the nine line ids, and has no animation.
- [ ] `formationSlots` matches the phase tables and is not yet wired to buttons.
- [ ] Tactics still shows the preview banner and does not save a lineup.
- [ ] Components do not import the domain or the database.
- [ ] Domain graphics do not call `Math.random`.
- [ ] The §8 commands exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase4.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5 and `plans/phase4/guide3.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase4.md`, or the other phase 4 guides.

Suggested message:

```text
feat(p04-g03): render generated clubs and pitch
```

Do not commit when §8 is failing. Do not amend the `P04-G02` commit. After the commit succeeds, record its full SHA on the `P04-G03` row of `plans/phase4.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P04-G04` may call `formationSlots` and render buttons on top of `PitchSvg`. It must not change crest colors or the path ids.

Known limitations this guide leaves on purpose:

- The pitch has no players on it.
- Lineups are not saved, and the banner still says the tactics screen is a preview.
- `formationSlots` is unused by the page. That is the next guide’s input, not a reason to assign players now.
