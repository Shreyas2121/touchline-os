# P03-G04 — Command center from save data

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §7.1.
- **Parent phase:** `plans/phase3.md`, guide **P03-G04**. The KPI table is phase §5 “Screens”. The work block is phase §6 `P03-G04`.
- **Predecessor guide:** `plans/phase3/guide3.md`.
- **Predecessor commit:** the commit whose subject is `feat(p03-g03): manage persistent campaigns`. Verify with `git log --grep="feat(p03-g03): manage persistent campaigns" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p03-g04): connect command center to save data`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase3.md` → this guide. This guide does not add the club chooser, a squad table, or a euro formatter on screen.

## 2. Goal and user-observable result

Opening a campaign that exists shows a command center read from IndexedDB:

- The heading is still `Command Center`. An `h2` shows the managed club’s name.
- `Squad` is the number of players at that club. A new campaign shows `0`.
- `Squad age` is the median known `reportedAge`, rendered as `24 years`, or `Unknown` when none of the ages are known. A mix renders `24 years · 2 unknown`.
- `Transfer capacity`, `Weekly wages`, and `Registration` are the word `Unknown`.
- Activity is a list of up to 20 audit summaries, newest first. A new campaign shows `Created campaign Harbor`.
- The page contains neither `€` nor `Preview` nor `Static preview — not save data`.
- `/app/demo/squad` still shows that banner. Constitution still says `Rules are not active in this build.`

The four status pills are gone from this screen.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P03-G03 sha> HEAD` succeeds, using the SHA from §1.
- `useDatabase`, `listAuditEvents`, and `listPlayersByClub` exist. `src/features/dashboard/campaign-summary.ts` does not. If that file already exists, stop and reconcile before editing.
- Do not edit `schemaV1`, the generator, or the seed batch size.
- Leave `MASTER_PLAN.md` and `plans/phase3.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase3.md` §5 “Screens” KPI table and the `P03-G04` block in §6.
- `src/features/dashboard/CommandCenterPage.tsx` — it renders `previewValue` four times and four `StatusPill`s.
- `src/app/layout/WorkspaceLayout.tsx` — it passes `previewBanner` for every found campaign.
- `src/components/ui/KpiRibbon.tsx` — `{ label, value }` only. Put the age sentence in `value`. Do not add a second ribbon API.
- `src/app/pages/SectionPage.tsx` — the `h1` stays `Command Center`.
- `src/data/repositories/players.ts` — `listPlayersByClub(database, campaignId, clubId)`.
- `src/data/repositories/audit-events.ts` — newest first.
- `src/data/repositories/clubs.ts` — `getClub`.
- `e2e/smoke.spec.ts` — it still expects `previewBanner` and four `previewValue` cells on `/app/demo/command-center`.
- `src/test/render.tsx` — already wraps `DatabaseProvider` with `touchline-os-test`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/features/dashboard/campaign-summary.ts` | Pure squad, age, and activity text |
| `src/features/dashboard/CommandCenterPage.tsx` | Read the save and render the KPIs |
| `src/app/layout/WorkspaceLayout.tsx` | Omit the preview banner on `command-center` |
| `e2e/smoke.spec.ts` | Expect `Unknown` on the demo command center and the banner on Squad |
| `src/test/campaign-summary.test.ts` | Age and activity cases |
| `src/test/command-center.test.tsx` | Empty campaign and club 01 |

Do not edit `SquadPage.tsx`, `ConstitutionPage.tsx`, or `campaign-summary` callers that do not exist yet. Do not import `formatMoneyEuros` into the page.

### Public API

```ts
export function squadCount(playerCount: number): string

export function squadAgeSummary(
  reportedAges: readonly (number | null)[],
): string

export function activityLines(summaries: readonly string[]): readonly string[]
```

`squadCount` returns `String(playerCount)` for every nonnegative integer, including `0`.

`squadAgeSummary` sorts the non-null ages ascending. The median index is `Math.floor((known.length - 1) / 2)`, which is the lower of the two middle values when the count is even. No known age returns `Unknown`. No null ages returns `${median} years`. A positive unknown count returns `${median} years · ${unknownCount} unknown`.

`activityLines` returns at most the first 20 summaries, in the order given. The repository already returns newest first. Do not sort again.

## 6. Implementation steps

1. Add the three functions in `campaign-summary.ts`. They do not import React, Dexie, or the clock.
2. Change `WorkspaceLayout` so a found campaign on a path ending in `/command-center` passes no `banner`. Every other child path, including `/squad` and `/constitution`, still passes `previewBanner`. The loading and missing states from `P03-G03` stay free of the banner.
3. Rewrite `CommandCenterPage` so it uses `useDatabase` and the route `campaignId`. While `getCampaign`, `getClub`, `listPlayersByClub`, and `listAuditEvents` are in flight, render `loadingCampaign` and do not render `Preview`. If the campaign is missing, render nothing of your own: the layout already replaced the outlet. If `getClub` returns `undefined`, the `h2` text is `Unknown` and the squad count is `0`.
4. Render `SectionPage` for `command-center`, then an `h2` with the club name, then `KpiRibbon` with these labels and values, in order: `Squad`, `Squad age`, `Transfer capacity`, `Weekly wages`, `Registration`. The last three values are the literal `Unknown`.
5. Render a `ul` with `aria-label="Activity"`. Each item’s text is one summary from `activityLines`. Do not add a sentence that is not stored on the audit. Do not render `StatusPill`. Do not render `noRecords` or `previewValue`.
6. Query players with `listPlayersByClub(database, campaign.id, campaign.managedClubId)` only. Do not call `listPlayers` for the whole campaign on this screen.
7. Update the smoke spec. After **Try fictional demo** reaches `/app/demo/command-center`, expect the banner count to be 0, expect `Unknown` to be visible, and do not expect `previewValue` or the words `Blocked`, `Warning`, `Informational`, or `Passed`. Then open Squad and expect `previewBanner` and `noRecords`. Constitution still expects `constitutionNote`. Keep the 120-second timeout.

## 7. Tests to add/change

`src/test/campaign-summary.test.ts`:

- `squadCount(0)` is `0`. `squadCount(36)` is `36`.
- Ages `[]` and `[null, null]` return `Unknown`.
- `[24]` returns `24 years`.
- `[30, 10]` returns `10 years` (lower of the two middle values after sorting).
- `[10, null, 30]` returns `10 years · 1 unknown`.
- `activityLines` of 21 strings returns the first 20 and drops the last.

`src/test/command-center.test.tsx`, database `touchline-os-test`, cleanup with `deleteDatabaseForTests`:

- `createCampaign` a save named `Harbor` with club name `Harbor Athletic`. Render `/app/<that id>/command-center`. Expect an `h2` `Harbor Athletic`, squad value `0`, activity text `Created campaign Harbor`, three `Unknown` values, no `€`, no `Preview`, and no `Static preview — not save data`.
- `seedDemoCampaign` the featured world. Render `/app/demo/command-center`. Expect an `h2` `Ashbridge`, squad value `36`, an age matching `/^\d+ years$/`, and no `€`.
- Render `/app/demo/squad` after that seed. Expect `Static preview — not save data`.

Do not click the club chooser. It does not exist yet. Club 01 is `Ashbridge` and its squad size is 36.

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
- `pnpm test` includes `campaign-summary.test.ts` and `command-center.test.tsx`.
- `pnpm test:e2e` still runs the smoke spec, now expecting `Unknown` on the demo command center.

## 9. Manual acceptance check

1. `pnpm dev`, create `Harbor` / `Harbor Athletic` / `HAR`. The command center `h2` is `Harbor Athletic`. Squad is `0`. Activity reads `Created campaign Harbor`. Transfer capacity, weekly wages, and registration read `Unknown`. The preview banner is absent. The page shows no euro sign.
2. Open Squad on that campaign. The banner `Static preview — not save data` is back. Constitution still says rules are not active.
3. Start the fictional demo and let it open `/app/demo/command-center`. The `h2` is `Ashbridge`. Squad is `36`. Squad age ends in `years`.
4. Reload that URL. The same club name and squad count remain.
5. Open `/app/does-not-exist/command-center`. The missing-campaign heading is shown, and `Preview` is not.

## 10. Definition of done

- [ ] The command center of a found campaign shows the managed club, a numeric squad count, the age sentence from §5, three `Unknown` values, and audit summaries.
- [ ] An empty user campaign shows squad `0` and `Created campaign ${name}`.
- [ ] The command center has no `€`, no `Preview`, no preview banner, and no status pills.
- [ ] Squad and constitution of the same campaign keep the preview banner and the inactive-rules sentence.
- [ ] The page loads the managed club’s players through `listPlayersByClub`, not a full-campaign `listPlayers`.
- [ ] `schemaV1`, the generator, and the seed command’s batching are unchanged.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase3.md` have no edits in this commit.

## 11. Commit instructions

Stage the paths in §5 and `plans/phase3/guide4.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase3.md`.

Suggested message:

```text
feat(p03-g04): connect command center to save data
```

Do not commit when §8 is failing. Do not amend the `P03-G03` commit. After the commit succeeds, record its full SHA on the `P03-G04` row of the progress log in `plans/phase3.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P03-G05` may keep this command center. It adds a redirect: a demo with a non-null `seed` and no `campaign.select-club` audit opens the chooser instead of these KPIs. A user campaign with `seed: null` stays on this screen.

The smoke spec currently expects the demo command center immediately after **Try fictional demo**. `P03-G05` must change that, because the chooser will sit in front of this screen.

Known limitations this guide leaves on purpose:

- The demo’s managed club is still the placeholder `Ashbridge` until the user confirms a club.
- Market values are in the database and are not shown.
- Transfer capacity, wages, and registration stay `Unknown` until later phases write those records.
