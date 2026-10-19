# P03-G05 — First-run demo journey

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §3.1, §6.1, and §12.2 invariant 11.
- **Parent phase:** `plans/phase3.md`, guide **P03-G05**. Club choice and the browser journey are phase §5 “Screens” and phase §6 `P03-G05`. The exit checks are phase §7 and §8.
- **Predecessor guide:** `plans/phase3/guide4.md`.
- **Predecessor commit:** the commit whose subject is `feat(p03-g04): connect command center to save data`. Verify with `git log --grep="feat(p03-g04): connect command center to save data" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `test(p03-g05): validate first-run demo journey`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase3.md` → this guide. This guide does not add a squad table, a rule verdict, a contract, or a service worker.

## 2. Goal and user-observable result

The fictional demo asks for a club once, then keeps that choice:

- **Try fictional demo** finishes on `/app/demo/choose-club` when no `campaign.select-club` audit exists.
- The chooser shows `Northwater Premier` and a button named `Ashbridge`. Choosing `Ashdale` opens the command center with that name and a non-zero squad count.
- Reload stays on `/app/demo/command-center` and shows the same squad count.
- A second campaign, `Harbor`, shows squad `0` and does not change the demo count when you switch back.
- Typing `Reset fictional demo` returns the chooser and leaves Harbor’s squad at `0`.
- Constitution on the demo still says `Rules are not active in this build.`

A user-created campaign never opens the chooser.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P03-G04 sha> HEAD` succeeds, using the SHA from §1.
- `CommandCenterPage` already reads IndexedDB. `src/data/commands/select-managed-club.ts` does not exist. If it does, stop and reconcile before editing.
- `playwright.config.ts` has `reuseExistingServer: false` and no `storageState`. Leave it that way.
- Do not edit `schemaV1` or `generateWorld`.
- Leave `MASTER_PLAN.md` and `plans/phase3.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase3.md` §5 club-choice paragraphs, the `P03-G05` block in §6, and §7 acceptance criteria.
- `src/data/commands/rename-campaign.ts` — copy the update-mode shape for `selectManagedClub`.
- `src/data/repositories/clubs.ts` — `getClub(database, campaignId, clubId)` returns `undefined` for another campaign.
- `src/features/dashboard/CommandCenterPage.tsx` — this is where the redirect starts, after the campaign has loaded and before the KPIs render.
- `src/app/router.tsx` and `src/app/layout/WorkspaceLayout.tsx` — child routes, and the banner exception that currently keys off `command-center`.
- `src/domain/seed/names.ts` — club index 0 is `Ashbridge`, club index 18 is `Ashdale`, league 1 is `Northwater Premier`. `Ashdale`’s squad size is `36 + (18 % 9) = 36`.
- `e2e/smoke.spec.ts` — it currently expects the demo command center immediately after **Try fictional demo**. That expectation becomes false once the chooser is in front.
- `README.md` — the local-database paragraph from `P03-G03`.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/validation/schemas.ts` | Allow `campaign.select-club` |
| `src/data/commands/select-managed-club.ts` | `selectManagedClub` |
| `src/features/campaigns/ChooseClubPage.tsx` | The 72-club picker |
| `src/features/dashboard/CommandCenterPage.tsx` | Redirect a demo that has not been confirmed |
| `src/app/router.tsx` | Child route `choose-club` |
| `src/app/layout/WorkspaceLayout.tsx` | No preview banner on `choose-club` |
| `src/test/select-club.test.ts` | Foreign club, second selection, null seed |
| `e2e/demo-journey.spec.ts` | The phase-exit browser journey |
| `e2e/smoke.spec.ts` | Reach Squad from a created campaign, not from an unconfirmed demo |
| `README.md` | One sentence on the one-time club choice and reset |

Do not add a Radix dialog. Do not show wages or market values on the chooser.

### Public API

```ts
export function selectManagedClub(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Campaign>>
```

Input, strict Zod object: `campaignId`, `clubId`, `expectedRevision`, `now`, `auditEventId`, `actionId`.

Success summary is exactly `Selected ${clubName} as the managed club`. `actionType` is `campaign.select-club`. `seasonId` is the campaign’s `activeSeasonId`. Payload is the parsed input. The stored `managedClubId` becomes `clubId`, `updatedAt` becomes `now`, and `revision` becomes the value `runCommand` passes in.

A club that `getClub` cannot find in the campaign returns `VALIDATION` with message `Club is not in this campaign.` The revision is unchanged and no audit is written. Check that inside the transaction, after the revision check, so a stale tab cannot select against a deleted club.

## 6. Implementation steps

1. Add `campaign.select-club` to the audit `actionType` enum. Keep every action added in `P03-G02` and `P03-G03`.
2. Implement `selectManagedClub` as an update-mode command on `campaigns`, `clubs`, and `auditEvents`. `getClub` inside the body decides the validation failure. Do not update the club row. Update only the campaign and append the audit.
3. Add route `{ path: 'choose-club', element: <ChooseClubPage /> }` as a sibling of `command-center` under `app/:campaignId`. The `*` not-found child stays last.
4. `ChooseClubPage` loads leagues and clubs for the route campaign. Heading `Choose the club you manage`. Paragraph `Nothing has been recorded as your choice yet.` For each league, in tier order, render a heading with the league name and one button per club. The button’s accessible name is the club name. The short name is plain text beside it, not the accessible name. Buttons are disabled while the command runs. Success navigates to `/app/${campaignId}/command-center`. `CONFLICT` shows `staleSave` and stays on the chooser. Do not call `selectManagedClub` from `useEffect`.
5. `WorkspaceLayout` omits `previewBanner` when the path ends in `/command-center` or `/choose-club`. Other sections keep the banner.
6. `CommandCenterPage`, after the campaign loads and before it paints KPIs: load `listAuditEvents`. If `campaign.seed !== null` and no event has `actionType` `campaign.select-club`, render `<Navigate to={'/app/' + campaign.id + '/choose-club'} replace />`. A null seed never redirects. While that audit read is in flight, keep showing `loadingCampaign` rather than the placeholder club’s KPIs.
7. **Try fictional demo** already navigates to `/app/demo/command-center`. Do not change that URL. The redirect in step 6 is what opens the chooser. A completed selection reloads on the command center.
8. Add this sentence to the README local-database section: `The fictional demo asks for a club once, and reset replaces only that demo.`
9. Rewrite the demo portion of `e2e/smoke.spec.ts` so it does not need the 3,000-player seed. Create `Harbor` / `Harbor Athletic` / `HAR` through the form, open Squad, Tactics, and Constitution from that workspace, and keep the skip-link, `/app`, `/app/demo/not-a-section` or the Harbor equivalent, and `/nope` assertions. Expect `previewBanner` on Squad and `constitutionNote` on Constitution. Do not expect `previewValue` on the command center. The long demo path lives only in `e2e/demo-journey.spec.ts`.
10. Add `e2e/demo-journey.spec.ts` with `test.setTimeout(120_000)`. Do not set `storageState`. Playwright’s default fresh context is required so this database cannot leak into the smoke spec.

## 7. Tests to add/change

`src/test/select-club.test.ts`, database `touchline-os-test`:

- After a featured seed, `selectManagedClub` for `demo-club-19` returns `ok`, stores that id, and writes one audit whose summary is `Selected Ashdale as the managed club`. A following select of `demo-club-01` replaces `managedClubId` and writes a second audit.
- `selectManagedClub` with club id `club-b` returns `VALIDATION`, message `Club is not in this campaign.`, and leaves `managedClubId` as `demo-club-01`. The revision is unchanged.
- Render a user campaign whose `seed` is null at `/app/<id>/command-center`. The URL stays on `command-center`. The heading `Choose the club you manage` is absent.
- Render `/app/demo/command-center` after a seed and before a selection. The heading `Choose the club you manage` is present, and `Ashbridge` is a button.

`e2e/demo-journey.spec.ts`, in one test, against `touchline-os` in a fresh context:

1. Open `/`. The disclaimer is visible. **Import backup** reveals no `input[type=file]`.
2. Start **Try fictional demo**. Wait until the heading `Choose the club you manage` is visible and the page shows `Northwater Premier` and a button named `Ashbridge`.
3. Choose `Ashdale`. Wait for `/app/demo/command-center`. The `h2` is `Ashdale`. Read the `Squad` value, and expect it to match `/^\d+$/` and not to be `0`. Squad age matches `/\d+ years/`. Transfer capacity’s value cell is `Unknown`.
4. Reload. The URL is `/app/demo/command-center`. The chooser heading is absent. The squad value equals the value from step 3.
5. Go to `/` and create `Harbor` / `Harbor Athletic` / `HAR`. The command center squad is `0`. Use the welcome list to open the demo again. The demo squad value is still the step 3 value. Open Harbor again. Squad is `0`.
6. On `/`, open the reset panel, type `Reset fictional demo`, and confirm. Wait until the chooser heading is visible again. Open Harbor. Squad is `0`.
7. Start the demo, choose `Ashbridge`, open Constitution, and expect `Rules are not active in this build.`

Update `src/test/schemas.test.ts` if a fixture enumerates the action union, so `campaign.select-club` parses.

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
- `pnpm test` includes `select-club.test.ts`.
- `pnpm test:e2e` runs `e2e/smoke.spec.ts` and `e2e/demo-journey.spec.ts`.
- The journey uses the production generator. Do not point it at a smaller world to make the timeout.

## 9. Manual acceptance check

1. `pnpm dev`, open `/`. Start the fictional demo. The chooser lists `Ashbridge` under `Northwater Premier`. The command-center KPIs are not visible yet.
2. Choose `Ashdale`. Squad is a positive integer. Squad age ends in `years`. Transfer capacity is `Unknown`. There is no `€` and no preview banner.
3. Reload. The chooser does not return. The squad integer is unchanged.
4. Create `Harbor` / `Harbor Athletic` / `HAR`. Squad is `0`. The chooser does not appear. Switch to the demo and back. Harbor stays `0`.
5. Reset by typing `Reset fictional demo`. The chooser returns. Harbor still exists with squad `0`.
6. Open Constitution on the demo after a choice. `Rules are not active in this build.` is visible. Open Squad. The preview banner is visible.
7. `pnpm build && pnpm preview`, and repeat steps 1 through 3 on the preview origin.

## 10. Definition of done

- [ ] A demo with no `campaign.select-club` audit opens `/app/demo/choose-club` instead of painting placeholder KPIs.
- [ ] Choosing a club, including club 01, writes one audit and survives reload.
- [ ] A foreign club id returns `VALIDATION` and does not bump revision.
- [ ] A null-seed campaign never opens the chooser.
- [ ] Reset replaces `demo` only. Harbor’s squad stays `0` in the browser journey.
- [ ] The journey runs the version-1 generator of 3,000 players, with a 120-second timeout and a fresh context.
- [ ] The smoke spec does not depend on that seed and still covers Squad, Constitution, the missing route, and the unknown route.
- [ ] README says the demo asks for a club once and reset replaces only that demo.
- [ ] `schemaV1` is unchanged. The page shows no euro amount and no rule verdict.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase3.md` have no edits in this commit.

## 11. Commit instructions

Stage the paths in §5 and `plans/phase3/guide5.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase3.md`.

Suggested message:

```text
test(p03-g05): validate first-run demo journey
```

Do not commit when §8 is failing. Do not amend the `P03-G04` commit. After the commit succeeds, record its full SHA on the `P03-G05` row of the progress log in `plans/phase3.md` §10. That log edit is not part of this commit. Check the phase §10 exit boxes only when §7 of the phase is true.

## 12. Handoff

Phase 4 may assume the behavior in `plans/phase3.md` §10 “Handoff to Phase 4”.

- `selectManagedClub` is the only writer of a confirmed managed club. `demo-club-01` remains the placeholder until that audit exists.
- `listPlayersByClub(campaignId, managedClubId)` is the squad read. Seeded ages are `reportedAge` with reference ordinal 1 and a null birth date.
- Remove `Static preview — not save data` on Squad only when that screen reads this squad. Leave the banner on Tactics, Finance, and Constitution.
- `CONFLICT` still means the screen shows `This save changed in another tab. Reload and try again.` and does not write the rejected input again.
- Components still must not import `src/data/db.ts`.

Phase 4 must not add the rule engine, contract rows, transfer commands, match entry, backup import, or the PWA plugin.
