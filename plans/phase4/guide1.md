# P04-G01 — Squad browser

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §7.2 and §4.1 rules 5 and 6.
- **Parent phase:** `plans/phase4.md`, guide **P04-G01**. Display, filter, sort, and the banner rule are phase §5 “Squad display” and “Banner”. The work block is phase §6 `P04-G01`.
- **Predecessor guide:** none in Phase 4. Phase 3 is complete.
- **Predecessor commit:** `e4bf90cb56696c0e9118d0166c2cf44ee02b4b1c` (`done`). Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p04-g01): build squad browser`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase4.md` → this guide. This guide does not edit a player, draw a crest, or save a lineup.

## 2. Goal and user-observable result

The Squad page of a found campaign shows the managed club:

- Harbor, which has no players, shows `No players at this club.` and does not show `Static preview — not save data` or `This build does not store records.`
- A club with players shows one row per player at that club. Search, position group, and sort change which rows appear and in what order.
- Wage, tier, contract end, and minutes read `Unknown`. A missing age or market value reads `Unknown`. A known market value may show `€`.
- Choosing a row shows that player’s name. The page says players cannot be edited yet.
- The command center still shows no euro amount. Finance and Constitution still show the preview banner.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor e4bf90cb56696c0e9118d0166c2cf44ee02b4b1c HEAD` succeeds.
- `src/domain/player/` does not exist. If it does, stop and reconcile with this guide before editing.
- `@tanstack/react-table` is not installed. Add it in this guide. Do not add `@tanstack/react-virtual`, React Hook Form, or Radix.
- Do not edit `schemaV1` or `src/data/migrations/v1.ts`.
- Leave `MASTER_PLAN.md` and `plans/phase4.md` unchanged in this commit. If `plans/phase4.md` is still untracked, leave it untracked.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase4.md` §5 “Squad display” and “Banner”, and the `P04-G01` block in §6.
- `src/features/squad/SquadPage.tsx` — the static table this guide replaces.
- `src/features/dashboard/CommandCenterPage.tsx` — copy its campaign load, `campaign.select-club` redirect, and `listPlayersByClub` call. Do not refactor that page onto a shared hook.
- `src/data/repositories/players.ts` — `listPlayersByClub(database, campaignId, clubId)`.
- `src/data/repositories/seasons.ts` — `getActiveSeason`.
- `src/domain/models/money.ts` — `formatMoneyUnknown`. Null stays `Unknown`.
- `src/domain/models/dates.ts` — `ageInWholeYears` and `estimateAge`. Both throw on bad input. The display function catches that and returns unknown.
- `src/domain/models/positions.ts` — `positions` and `PositionGroup`.
- `src/app/layout/WorkspaceLayout.tsx` — the banner is omitted only for paths ending in `/command-center` or `/choose-club`.
- `src/app/copy.ts` — `previewBanner`, `noRecords`, `loadingCampaign`.
- `src/test/render.tsx` — `renderAt` already wraps `DatabaseProvider` with `touchline-os-test`.
- `src/test/fixtures/campaign.ts` — `harborInput`.
- `src/test/command-center.test.tsx` and `src/test/shell-nav.test.tsx` — both still expect the preview banner on Squad.
- `e2e/smoke.spec.ts` — the Squad step expects `previewBanner` and `noRecords`.
- `package.json` — add the table package here and commit the lockfile.

`src/domain/player/squad-view.ts` does not exist. Do not create a command file.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `package.json`, `pnpm-lock.yaml` | `@tanstack/react-table` only |
| `src/domain/player/squad-view.ts` | Age text, filter, sort, source labels |
| `src/test/squad-view.test.ts` | Pure cases |
| `src/features/squad/SquadBrowser.tsx` | The table and the selection region |
| `src/features/squad/SquadPage.tsx` | Load the managed club and render the browser |
| `src/app/layout/WorkspaceLayout.tsx` | No preview banner on `/squad` |
| `src/app/copy.ts` | Loading and failure sentences |
| `src/test/squad-page.test.tsx` | Rendered isolation, unknowns, empty club |
| `src/test/shell-nav.test.tsx` | Banner assertion moves to Finance |
| `src/test/command-center.test.tsx` | The “squad stays a preview” assertion moves to Finance |
| `e2e/smoke.spec.ts` | Harbor’s Squad page is a real empty squad |

Do not edit `src/features/tactics/TacticsPage.tsx`. Do not add `updatePlayer`.

### Public API

```ts
export type AgeDisplay =
  | { kind: 'exact'; years: number }
  | { kind: 'estimated'; years: number }
  | { kind: 'unknown' }

export function displayAge(
  player: {
    birthDate: DateOnly | null
    reportedAge: number | null
    ageReferenceSeasonOrdinal: number | null
  },
  season: { startDate: DateOnly | null; ordinal: number },
): AgeDisplay

export function ageText(display: AgeDisplay): string

export function sourceLabel(
  source: 'fictional' | 'imported' | 'user-entered' | 'estimated' | 'generated',
): string

export type SquadSortKey = 'name' | 'position' | 'age' | 'value'
export type SortDirection = 'asc' | 'desc'

export function filterSquad(
  players: readonly Player[],
  query: string,
  group: 'all' | PositionGroup,
): Player[]

export function compareSquadRows(
  left: Player,
  right: Player,
  key: SquadSortKey,
  direction: SortDirection,
  season: { startDate: DateOnly | null; ordinal: number },
): number
```

`ageText` returns `${years} years`, `${years} years, estimated`, or `Unknown`. `sourceLabel` returns `Fictional`, `Imported`, `User-entered`, `Estimated`, or `Generated`. No other spellings.

## 6. Implementation steps

1. Install the current stable `@tanstack/react-table` with pnpm. Do not upgrade unrelated packages. Commit the lockfile.
2. Implement `displayAge` exactly as phase §5. If `ageInWholeYears` or `estimateAge` throws, return `{ kind: 'unknown' }`. Do not catch by calling `Date`.
3. Implement `filterSquad`. Trim the query. An empty query keeps every name. Otherwise keep names that contain the query, compared after `toLocaleLowerCase('en')`. `group: 'all'` does not filter. Any other group keeps `player.positionGroup` only.
4. Implement `compareSquadRows`. Name uses `localeCompare('en', { numeric: true, sensitivity: 'base' })`. Position compares `positionGroup`, then `positions[0]`. Age compares `ageText` years, not the raw `reportedAge`, when the display kind is not `unknown`. Value compares `marketValueCents`. A null age or null value sorts after every known value in both directions. Two nulls tie. A remaining tie breaks by name ascending, then by `id` ascending. Apply `desc` only to the known-versus-known comparison.
5. Add `loadingSquad = 'Loading squad.'` and `squadFailed = 'This squad could not be loaded. Reload and try again.'` to `src/app/copy.ts`.
6. `SquadPage` parses the route id, loads the campaign, and redirects with `<Navigate replace>` to `/app/${campaign.id}/choose-club` when `campaign.seed !== null` and no audit has `actionType` `campaign.select-club`. A null seed never redirects. While that read is in flight, show `loadingSquad` and do not show the empty-club sentence.
7. After the redirect check, load `getClub`, `getActiveSeason`, and `listPlayersByClub(campaignId, managedClubId)`. Do not call `listPlayers`. If the club is missing, treat the squad as empty. If the active season is missing, pass no season and render every age as `Unknown`. A thrown read shows `squadFailed` with `role="alert"`.
8. `SquadBrowser` renders a table with caption `Squad` and columns in this order: Name, Position, Age, Wage, Value, Tier, Contract end, Minutes, Source. Use the installed table package for the row model. Filtering happens before the table, through `filterSquad`. Every name, position, age, and value sort calls `compareSquadRows`. Do not write a second comparator in the column definition.
9. Header buttons read `Sort by name`, `Sort by position`, `Sort by age`, and `Sort by value`. The active header sets `aria-sort` to `ascending` or `descending`. Other headers set `aria-sort="none"`. The default is name ascending. Wage, tier, contract end, minutes, and source are not sortable.
10. Cell text: position is `positions.join(', ')`. Age is `ageText`. Wage, tier, contract end, and minutes are the literal `Unknown`. Value is `formatMoneyUnknown(player.marketValueCents)`. Source is `sourceLabel(player.source)`. Render text through React. Do not use `dangerouslySetInnerHTML`.
11. The name cell is a button whose accessible name is `Select ${name}`. `aria-pressed` is true only for the selected id. The selection region is a `<section aria-label="Selected player">` and is absent until a row is selected. It shows the player name, the first position, and the exact sentence `This build does not edit players yet.`
12. Search input label `Search players`. Filter label `Position group` with options `All`, `GK`, `DEF`, `MID`, `FWD`, `UNKNOWN`. Empty results copy is `No players match this search.` Empty club copy, including a club whose filter is `All` and whose query is empty, is `No players at this club.` Reset query, group, sort, and selection when `campaignId` changes. Do not write them to IndexedDB.
13. `WorkspaceLayout` also omits `previewBanner` when the path ends with `/squad`. Command center, choose-club, tactics, finance, and constitution keep their current banner behavior.
14. Point the shell-nav banner assertion at `/app/demo/finance` and wait for the heading `Finance`. Point the command-center test that currently opens `/app/demo/squad` at `/app/demo/finance` and expect `previewBanner` there. Rename that test so it no longer says Squad stays a preview.
15. In `e2e/smoke.spec.ts`, Harbor’s Squad step expects the Name column header, `No players at this club.`, no `previewBanner`, and no `noRecords`. The following Tactics step still expects `pitchPreview` and `previewBanner`. Constitution still expects `constitutionNote` and `previewBanner`.

## 7. Tests to add/change

`src/test/squad-view.test.ts`:

- `reportedAge` 21, reference ordinal 1, season ordinal 1, null birth date, and null `startDate` display as estimated 21. `ageText` is `21 years, estimated`.
- Birth date `2000-10-20` and season start `2026-10-19` display as exact 25. `ageText` is `25 years`.
- A birth date with a null season start and a null reported age is `unknown`.
- A reference ordinal of 3 with season ordinal 1 is `unknown`, because `estimateAge` would throw. The function does not throw.
- `filterSquad` with query ` ash ` keeps `Ashbridge` and drops `Windgate`. Group `GK` keeps only goalkeepers.
- Sorting value ascending and descending both place a null `marketValueCents` after `1050`.

`src/test/squad-page.test.tsx`, database `touchline-os-test`, cleanup with `deleteDatabaseForTests` and `cleanup`:

- `createCampaign` with `harborInput`. `addPlayer` two players on `club-a` and one player on a second campaign’s club. Also add one free agent (`clubId: null`) on the Harbor campaign. Render `/app/campaign-a/squad`. Both Harbor outfield players are present. The other campaign’s player and the free agent are absent.
- Those rows show `Unknown` for wage, tier, contract end, and minutes. A player with `marketValueCents` 1050 shows `€10.50`. A player with null value shows `Unknown`. An attributes object that omits `pace` is not required on this page; do not assert attribute cells here.
- Activate `Select` for one player. The selected region shows `This build does not edit players yet.`
- A second `createCampaign` rendered at its squad URL shows `No players at this club.`
- Render `/app/campaign-a/command-center` in the same file or rely on the existing command-center test: the command-center container text still does not match `€`.

Update `shell-nav.test.tsx`, `command-center.test.tsx`, and `e2e/smoke.spec.ts` as in §6. Do not drop the finance banner assertion.

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

Expected:

- Each command exits 0.
- `pnpm test` includes the previous files plus `squad-view.test.ts` and `squad-page.test.tsx`.
- `pnpm test:e2e` still runs `e2e/smoke.spec.ts` and `e2e/demo-journey.spec.ts`.

## 9. Manual acceptance check

1. `pnpm dev`. Create `Harbor` / `Harbor Athletic` / `HAR`.
2. Open Squad. The heading `Squad` is visible. The page shows `No players at this club.` It does not show `Static preview — not save data` or `This build does not store records.`
3. Open Finance. The preview banner is visible.
4. Open the command center. The page text has no `€`.
5. Start the fictional demo, choose `Ashbridge`, and open Squad. At least one `Select ` button is visible. A wage cell reads `Unknown`. Search for `zzzz` and see `No players match this search.`

Tactics still says the board is not interactive.

## 10. Definition of done

- [ ] Squad lists only the managed club’s players.
- [ ] Search, position filter, and sort match §6, including nulls last.
- [ ] Wage, tier, contract end, and minutes are `Unknown`. Null value is `Unknown`. Known value uses `formatMoneyUnknown`.
- [ ] The selected region says players cannot be edited yet.
- [ ] `/squad` has no preview banner. Finance and the command center keep their current banner and euro rules.
- [ ] A demo without a club choice redirects to the chooser. A null-seed campaign does not.
- [ ] `schemaV1` and the tactics page are unchanged.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase4.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5, including the lockfile, and `plans/phase4/guide1.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase4.md`, or later guide files.

Suggested message:

```text
feat(p04-g01): build squad browser
```

Do not commit when §8 is failing. Do not amend `e4bf90cb56696c0e9118d0166c2cf44ee02b4b1c`. After the commit succeeds, record its full SHA on the `P04-G01` row of the progress log in `plans/phase4.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P04-G02` may replace the selected region. It may call `displayAge`, `ageText`, `sourceLabel`, `filterSquad`, and `compareSquadRows`. The table already selects one player id.

Known limitations this guide leaves on purpose:

- There is no player write and no development note.
- The sentence `This build does not edit players yet.` is still on the page.
- Tactics is still the Phase 1 preview, and its banner stays.
- Crests are not drawn. Market value is the only euro figure this guide may show, and only on Squad.
