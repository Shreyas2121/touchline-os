# P04-G04 — Interactive tactical planning

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §7.3 and §12.5.
- **Parent phase:** `plans/phase4.md`, guide **P04-G04**. Placement, fit words, and the pointer and keyboard gestures are phase §5 “Placement”. The work block is phase §6 `P04-G04`.
- **Predecessor guide:** `plans/phase4/guide3.md`.
- **Predecessor commit:** the commit whose subject is `feat(p04-g03): render generated clubs and pitch`. Verify with `git log --grep="feat(p04-g03): render generated clubs and pitch" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p04-g04): enable interactive tactical planning`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase4.md` → this guide. This guide does not write a lineup row. Drag-and-drop is not a requirement.

## 2. Goal and user-observable result

A person can build a lineup on the pitch, and reload throws it away:

- The formation select offers `4-3-3`, `4-2-3-1`, `4-4-2`, and `3-5-2`. The default is `4-3-3`.
- Activating a player, then a slot, places that player. Placing them again moves them. The previous slot no longer names them. The previous occupant of the destination slot becomes unassigned.
- The bench holds at most 12 players. The twelfth new bench player is refused with `The bench is full.`
- Keyboard users can hold a player, place them with Enter on a slot, and press Escape to drop the hold without changing the pitch.
- The page says `This lineup is on this screen only. It is not saved yet.` The preview banner stays. There is no Save button.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P04-G03 sha> HEAD` succeeds, using the SHA from §1.
- `formationSlots` and `PitchSvg` exist. `src/domain/player/lineup-draft.ts` does not. If it does, stop and reconcile before editing.
- `@testing-library/user-event` is not installed. Tests use `click` and `fireEvent` from `@testing-library/react`. Do not add a package.
- Do not edit `schemaV1`. Do not add a lineup repository.
- Leave `MASTER_PLAN.md` and `plans/phase4.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase4.md` §5 “Placement”, and the `P04-G04` block in §6.
- `src/domain/graphics/pitch.ts` — `formationSlots` and `FormationId`.
- `src/components/graphics/PitchSvg.tsx` — the board draws slot buttons outside this component, in a relatively positioned wrapper.
- `src/domain/player/squad-view.ts` — `compareSquadRows` for the roster order.
- `src/features/tactics/TacticsPage.tsx` — it already loads the club and shows the unsaved sentence from `P04-G03`. Replace that sentence. Keep the redirect and the banner.
- `src/features/squad/SquadPage.tsx` — reuse `listPlayersByClub`. Do not list the whole campaign.
- `src/domain/validation/limits.ts` — `benchMax` is 12 and `startersMax` is 11.
- `e2e/smoke.spec.ts` — it now expects `Lineups are not saved in this build.`

`src/data/commands/save-lineup.ts` does not exist. Do not create it.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/player/lineup-draft.ts` | Place, bench, clear, switch, and problems |
| `src/test/lineup-draft.test.ts` | Duplicate place, full bench, formation switch |
| `src/features/tactics/TacticsBoard.tsx` | The in-memory board |
| `src/features/tactics/TacticsPage.tsx` | Load the squad and render the board |
| `src/test/tactics-board.test.tsx` | Pointer place, move, and Escape |
| `src/app/copy.ts` | Replace the `P04-G03` tactics sentence |
| `e2e/smoke.spec.ts` | Expect the new sentence and the formation select |

Do not add Save, Delete, or a `lineups` write.

### Public API

```ts
export type LineupDraft = {
  name: string
  formation: FormationId
  starters: { playerId: string; slot: string; role: string | null }[]
  benchPlayerIds: string[]
}

export type PlaceCode = 'UNKNOWN_PLAYER' | 'UNKNOWN_SLOT' | 'BENCH_FULL'

export type PlaceResult =
  | { ok: true; draft: LineupDraft }
  | { ok: false; draft: LineupDraft; code: PlaceCode }

export function emptyDraft(): LineupDraft

export function placeOnSlot(
  draft: LineupDraft,
  playerId: string,
  slotId: string,
  rosterIds: readonly string[],
): PlaceResult

export function placeOnBench(
  draft: LineupDraft,
  playerId: string,
  rosterIds: readonly string[],
): PlaceResult

export function clearSlot(draft: LineupDraft, slotId: string): LineupDraft

export function switchFormation(
  draft: LineupDraft,
  formation: FormationId,
): LineupDraft

export type LineupProblem =
  | 'DUPLICATE_PLAYER'
  | 'DUPLICATE_SLOT'
  | 'UNKNOWN_SLOT'
  | 'BENCH_TOO_LONG'
  | 'TOO_MANY_STARTERS'
  | 'UNKNOWN_PLAYER'

export function lineupProblems(
  draft: LineupDraft,
  rosterIds: readonly string[],
): readonly LineupProblem[]
```

`emptyDraft` returns `name: ''`, formation `4-3-3`, no starters, and no bench. Every starter `role` this guide writes is `null`.

## 6. Implementation steps

1. `placeOnSlot` returns `UNKNOWN_PLAYER` when `playerId` is not in `rosterIds`, and `UNKNOWN_SLOT` when `slotId` is not in `formationSlots(draft.formation)`. On either failure the returned draft is the input draft. On success, remove that player from every starter and from the bench, drop the previous occupant of `slotId` out of `starters`, and append `{ playerId, slot: slotId, role: null }`. The previous occupant is not added to the bench and is not held.
2. `placeOnBench` removes the player from starters. If they are already on the bench, return the same bench without a second copy. If they are not on the bench and `benchPlayerIds.length` is already 12, return `BENCH_FULL` and the input draft. `clearSlot` removes the starter with that slot id. An unknown slot id returns the input draft.
3. `switchFormation` sets `formation`, sets `starters` to `[]`, and keeps `name` and `benchPlayerIds`. `lineupProblems` reports a duplicate player across starters and bench, a duplicate slot, a slot that is not in the formation, more than 11 starters, more than 12 bench ids, and any id outside `rosterIds`. It does not treat an empty name as a problem. This guide does not call it from a save button. `P04-G05` will.
4. `TacticsBoard` receives the managed-club players and the active season used for sort. The roster is a `<ul aria-label="Roster">`. Each item is a button whose accessible name is the player name. Order is `compareSquadRows` on name ascending. Do not show players from another club; the page passes only `listPlayersByClub`.
5. The formation control is a `<select aria-label="Formation">` or a labeled select `Formation` with the four formation ids as option values and labels. Changing it calls `switchFormation` and shows `Starting slots were cleared.`
6. Wrap `PitchSvg` in a relatively positioned element. For each slot, render a `<button type="button">` positioned with `left: ${slot.x}%` and `top: ${slot.y}%`. Give the button a minimum width and height of 44px. Accessible name when empty: `${label}, empty`. When occupied: `${label}, ${playerName}, ${fit}`. `fit` is `Position fit` when the player’s `positionGroup` equals the slot group, `Different position` when it does not, and `Unknown position` when the group is `UNKNOWN`. Those words are in the button name, not only in a color.
7. Pointer and touch use `onClick`. A roster click sets the held id. The live region is `aria-live="polite"` and its text is `Holding ${name}` while held, and empty otherwise. A slot click while held calls `placeOnSlot` and then clears the hold. A slot click while not held selects that slot for `Clear slot` and does not pick the occupant up. `Send to bench` calls `placeOnBench` for the held player and then clears the hold. `Clear slot` calls `clearSlot` for the selected slot. `BENCH_FULL` shows `The bench is full.` and leaves the draft unchanged.
8. Escape: while the board is mounted, `keydown` on `window` for `Escape` clears the hold and does not change the draft. Remove the listener on unmount. Do not add a key handler that replaces the button’s native Enter activation. A focused button receives Enter as a click in the browser. That click is the place gesture.
9. Replace `Lineups are not saved in this build.` with the exact sentence `This lineup is on this screen only. It is not saved yet.` Keep `previewBanner` on Tactics. Do not call `getDatabase` from the board. Do not import Dexie. The draft lives in `useState`. Reload resets it because it is not stored.
10. Update the smoke spec so Tactics expects `This lineup is on this screen only. It is not saved yet.`, a control named `Formation`, the pitch name `Pitch`, and `previewBanner`. It must not expect the `P04-G03` sentence.

## 7. Tests to add/change

`src/test/lineup-draft.test.ts`:

- Place player `p1` on `gk`, then on `st`. The draft has one starter, on `st`. Place `p2` on `st` while `p1` is there. `st` is `p2`, and `p1` is neither a starter nor on the bench.
- Bench a starter. The starter row is gone and the bench has that id once. Bench the same id again. The bench length stays 1. Twelve bench ids followed by a thirteenth new id return `BENCH_FULL` and leave twelve ids.
- `switchFormation(draft, '4-4-2')` clears starters, keeps the bench, and sets the formation.
- `placeOnSlot` with a slot id from another formation returns `UNKNOWN_SLOT`. An id that is not in `rosterIds` returns `UNKNOWN_PLAYER`.
- A draft with the same player on a slot and the bench yields `DUPLICATE_PLAYER` from `lineupProblems`. The happy path after `placeOnSlot` yields no problems.

`src/test/tactics-board.test.tsx`:

- Create a campaign and two players on its club, with position groups `GK` and `FWD`. Render the tactics route.
- Click the goalkeeper’s roster button. `Holding ${name}` is visible. Click the button whose name matches `/^GK,/`. The hold text is gone. That button’s name includes the player and `Position fit`.
- Click that same roster button, then the button whose name matches `/^ST,/`. The GK button’s name is `GK, empty`. The ST button’s name includes the player.
- Click the second player, then `fireEvent.keyDown` on `window` with `key: 'Escape'`. `Holding` is gone. The ST button still names the first player only.
- The page contains `This lineup is on this screen only. It is not saved yet.` and does not contain `€`.
- `listLineups` does not exist. Assert no lineup table write by reading `getDatabase('touchline-os-test').lineups.toArray()` and expecting `[]` after the placements.

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

Expected: each command exits 0. `pnpm test` includes `lineup-draft.test.ts` and `tactics-board.test.tsx`.

## 9. Manual acceptance check

1. `pnpm dev`. Open the fictional demo, choose `Ashbridge`, and open Tactics.
2. Confirm the formation select reads `4-3-3` and the sentence says the lineup is on this screen only. The preview banner is visible.
3. Click a player, then GK. The GK button names that player. Click the same player, then ST. GK no longer names them.
4. Press Tab until a roster button is focused, press Enter, then Tab to a slot and press Enter. The slot names the player.
5. Hold another player and press Escape. The pitch does not change.
6. Reload. The pitch slots are empty again.
7. Change the formation to `4-4-2`. `Starting slots were cleared.` is visible.

There is no Save control.

## 10. Definition of done

- [ ] A player cannot remain on two slots or on a slot and the bench.
- [ ] A full bench is refused and the draft is unchanged.
- [ ] Switching formation clears starters and keeps the bench.
- [ ] Escape drops the hold without a write.
- [ ] Fit words are in the slot’s accessible name.
- [ ] No lineup row is written. The tactics banner stays.
- [ ] The §8 commands exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase4.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5 and `plans/phase4/guide4.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase4.md`, or the other phase 4 guides.

Suggested message:

```text
feat(p04-g04): enable interactive tactical planning
```

Do not commit when §8 is failing. Do not amend the `P04-G03` commit. After the commit succeeds, record its full SHA on the `P04-G04` row of `plans/phase4.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P04-G05` may persist `LineupDraft` through a command. It must call `lineupProblems` again inside the transaction. It must remove the on-screen-only sentence and the tactics banner.

The board already holds the draft in React state. Slot roles are `null`. The next guide may store that null. It does not need a role editor.

Known limitations this guide leaves on purpose:

- Reload clears the board.
- Drag is not implemented.
- Save and delete do not exist.
