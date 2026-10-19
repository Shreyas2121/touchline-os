# P01-G02 — App routing and layouts

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`.
- **Parent phase:** `plans/phase1.md`, guide **P01-G02**. Route contract and section table are in phase §5. Behavior is the `P01-G02` block in phase §6.
- **Predecessor guide:** `plans/phase1/guide1.md`.
- **Predecessor commit:** `360b54477e984156d0c76ea29d66cbc7023a24b0` (`chore(p01-g01): scaffold typed application`). Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p01-g02): add app routing and layouts`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase1.md` → this guide.

## 2. Goal and user-observable result

Every URL in the phase route contract renders a named placeholder.

- `/` shows the heading `Touchline OS` and three inert action labels.
- `/app/demo` changes the address bar to `/app/demo/command-center` and shows `Command Center`.
- `/app/demo/squad` shows `Squad` beside a list of the ten section links.
- `/app` and `/app/` show `Campaign not found` and no section list.
- `/app/demo/not-a-section` shows `Page not found` with the section list still available.
- `/nope` shows `Page not found` without the section list.
- `/settings` shows `Settings`. `/help` shows `Help`.

Nothing is saved. Welcome actions do not navigate. The page stays unstyled except for the browser defaults. Visual design is `P01-G03`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor 360b54477e984156d0c76ea29d66cbc7023a24b0 HEAD` succeeds.
- Working tree is clean, or the only uncommitted file is this guide.
- `package.json` does not depend on `react-router`. If it does, stop and reconcile before adding another copy.
- Do not hardcode a package version. `pnpm add react-router` resolves the current stable release. Commit the lockfile it writes.
- Leave `MASTER_PLAN.md` and `plans/phase1.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase1.md` §5 (route contract, section table, assumptions 2 and 3) and the `P01-G02` block in §6.
- `src/main.tsx` — mounts the named export `App` into `#root`. Do not change this file.
- `src/app/App.tsx` — currently returns `<h1>Touchline OS</h1>`.
- `package.json` — scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `format`, `format:check`. No test script.
- `tsconfig.app.json` — `"strict": true`, `verbatimModuleSyntax`, `noUnusedLocals`. New files under `src/` are already included.
- `eslint.config.js` — lint scope is `**/*.{ts,tsx}`. Fast Refresh is enabled.
- `.prettierrc.json` — `semi: false`, `singleQuote: true`.

No `src/app/router.tsx`, `src/app/routes.ts`, or `src/features/` tree exists. Do not import them until this guide creates them.

## 5. Files to create/modify

**Modify:**

- `package.json` and `pnpm-lock.yaml` — add `react-router` only.
- `src/app/App.tsx` — render the router. Keep the named export `App`.

**Create:**

| Path | Export |
| --- | --- |
| `src/app/routes.ts` | `workspaceSections`, `isWorkspaceSection`, `workspaceSectionPath` |
| `src/app/router.tsx` | module-scope `router` passed to `RouterProvider` |
| `src/app/layout/RootLayout.tsx` | `RootLayout` |
| `src/app/layout/WorkspaceLayout.tsx` | `WorkspaceLayout` |
| `src/app/pages/WelcomePage.tsx` | `WelcomePage` |
| `src/app/pages/MissingCampaignPage.tsx` | `MissingCampaignPage` |
| `src/app/pages/NotFoundPage.tsx` | `NotFoundPage` |
| `src/app/pages/SectionPage.tsx` | `SectionPage` |
| `src/features/dashboard/CommandCenterPage.tsx` | `CommandCenterPage` |
| `src/features/squad/SquadPage.tsx` | `SquadPage` |
| `src/features/tactics/TacticsPage.tsx` | `TacticsPage` |
| `src/features/transfers/TransfersPage.tsx` | `TransfersPage` |
| `src/features/finance/FinancePage.tsx` | `FinancePage` |
| `src/features/registration/RegistrationPage.tsx` | `RegistrationPage` |
| `src/features/scouting/ScoutingPage.tsx` | `ScoutingPage` |
| `src/features/matches/MatchJournalPage.tsx` | `MatchJournalPage` |
| `src/features/seasons/SeasonsPage.tsx` | `SeasonsPage` |
| `src/features/constitution/ConstitutionPage.tsx` | `ConstitutionPage` |
| `src/features/settings/SettingsPage.tsx` | `SettingsPage` |
| `src/features/help/HelpPage.tsx` | `HelpPage` |

Do not create `src/styles/`, `src/app/copy.ts`, Tailwind, tests, or a service worker.

### Public API

```ts
export type WorkspaceSectionId =
  | 'command-center'
  | 'squad'
  | 'tactics'
  | 'transfers'
  | 'finance'
  | 'registration'
  | 'scouting'
  | 'matches'
  | 'seasons'
  | 'constitution'

export type WorkspaceSection = {
  id: WorkspaceSectionId
  label: string
  segment: string
}

export const workspaceSections: readonly WorkspaceSection[]

export function isWorkspaceSection(
  segment: string,
): segment is WorkspaceSectionId

export function workspaceSectionPath(
  campaignId: string,
  sectionId: WorkspaceSectionId,
): string
```

`workspaceSectionPath` returns an absolute path `/app/<campaignId>/<segment>`. `segment` is the path segment from the table below, which is identical to `id` for every row.

```tsx
export function SectionPage(props: { sectionId: WorkspaceSectionId }): JSX.Element
```

`src/main.tsx` keeps importing `{ App }` from `./app/App`.

## 6. Implementation steps

1. From the repo root, run `pnpm add react-router`. Do not pass a version. Do not add `react-router-dom` unless the installed `react-router` package does not export `createBrowserRouter`. Do not add Tailwind, `lucide-react`, Vitest, Playwright, Dexie, or Zod.
2. Import `createBrowserRouter`, `RouterProvider`, `Link`, `Navigate`, `Outlet`, and `useParams` from `react-router`. With `verbatimModuleSyntax`, use `import type` only for types.
3. Write `src/app/routes.ts` with this table, in this order. `id` and `segment` are the same string. `label` is the visible name.

   | `id` / `segment` | `label` |
   | --- | --- |
   | `command-center` | `Command Center` |
   | `squad` | `Squad` |
   | `tactics` | `Tactics` |
   | `transfers` | `Transfers` |
   | `finance` | `Finance` |
   | `registration` | `Registration` |
   | `scouting` | `Scouting` |
   | `matches` | `Match Journal` |
   | `seasons` | `Seasons` |
   | `constitution` | `Constitution` |

   `isWorkspaceSection` returns true only when `segment` equals one of those ten segments. `workspaceSectionPath('demo', 'squad')` returns `/app/demo/squad`. Do not trim or default `campaignId`.

4. Write the placeholder pages. Each heading is an `h1`. No links and no buttons on these pages.

   - `WelcomePage`: heading `Touchline OS`, then the plain text lines `Try fictional demo`, `Create new campaign`, and `Import backup`. They are not anchors.
   - `MissingCampaignPage`: heading `Campaign not found`.
   - `NotFoundPage`: heading `Page not found`.
   - `SettingsPage`: heading `Settings`.
   - `HelpPage`: heading `Help`.
   - `SectionPage`: look up `sectionId` in `workspaceSections` and render that row's `label` as the heading. If the id is absent, throw `new Error('Unknown section: …')` with the id. Do not render a blank page.

5. Each feature page returns only `<SectionPage sectionId="…" />` for its own id. `CommandCenterPage` uses `command-center`. `MatchJournalPage` uses `matches`. Do not duplicate the label strings in the feature files.

6. `RootLayout` returns `<Outlet />` and nothing else.

7. `WorkspaceLayout`:
   - Read `campaignId` from `useParams`.
   - Render `<a href="#main">Skip to content</a>`.
   - Render a `nav` whose items come only from `workspaceSections`. Each item is a React Router `Link` to `workspaceSectionPath(campaignId, section.id)` with the section `label` as the link text.
   - When `campaignId` is `undefined`, skip the link list. This layout is mounted only under `app/:campaignId`, so that branch is a type guard, not a second missing-campaign screen.
   - Render `<main id="main"><Outlet /></main>`.
   - Do not add `aria-current`, color, width, or Tailwind. `P01-G03` owns the rail.

8. Create the router once at module scope in `src/app/router.tsx`. Do not call `createBrowserRouter` inside `App`. Use this shape:

   - Parent route renders `RootLayout`.
   - Index child `/` renders `WelcomePage`.
   - `settings` renders `SettingsPage`.
   - `help` renders `HelpPage`.
   - `app` renders `MissingCampaignPage` and has no campaign child.
   - `app/:campaignId` renders `WorkspaceLayout`.
   - The index child of `app/:campaignId` is `<Navigate to="command-center" replace />`. The target is relative. It must not drop the campaign id and must not use `..`.
   - One child route per section, path equal to `segment`, element equal to that feature page.
   - A child splat `*` under `WorkspaceLayout` renders `NotFoundPage`, so an unknown section keeps the nav.
   - A splat `*` under `RootLayout`, and not under `WorkspaceLayout`, renders `NotFoundPage` for unknown top-level paths such as `/nope`.

9. Confirm in the installed React Router docs that both `/app` and `/app/` render `MissingCampaignPage`. If a trailing slash does not match `path: 'app'`, add that major's trailing-slash option or a second route. Do not redirect `/app/` onto a campaign id.

10. `App` returns `<RouterProvider router={router} />` and no heading of its own. The welcome route supplies `Touchline OS`.

11. If `react-refresh/only-export-components` fails only because `router.tsx` exports the router, scope the installed plugin's export-name allowance to `router` for that file in `eslint.config.js`. Do not turn the rule off for the project.

12. No page may call `fetch`, `localStorage`, `sessionStorage`, or `indexedDB`. No route loader may read storage.

13. Run section 8. Fix type, lint, and format failures in these files. Do not weaken `strict` or remove `noUnusedLocals`.

## 7. Tests to add/change

None. Vitest and Playwright arrive in `P01-G05`.

Do not add `pnpm test` or `src/test/`. The manual URL pass in section 9 is the check for this guide.

## 8. Verification commands

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: each command exits 0. `pnpm test` is still absent. Do not add it.

`pnpm typecheck` must fail if a feature page passes a section id that is not in `WorkspaceSectionId`. Undo any such experiment before commit.

## 9. Manual acceptance check

Restart `pnpm dev` after installing `react-router`, then open the printed origin.

1. `/` shows heading `Touchline OS` and the three action labels. Activating the text does not change the URL. The labels are not links.
2. `/app/demo` ends on `/app/demo/command-center`. The heading is `Command Center`. The nav lists all ten labels from section 6 step 3, in that order.
3. Activate `Squad`. The URL is `/app/demo/squad` and the heading is `Squad`. The nav is still there.
4. `/app/demo/matches` shows `Match Journal`. `/app/demo/constitution` shows `Constitution`.
5. `/app` shows `Campaign not found` and does not show the ten section links. Repeat for `/app/`.
6. `/app/demo/not-a-section` shows `Page not found` and still shows the ten section links.
7. `/nope` shows `Page not found` and does not show the section links.
8. `/settings` shows `Settings`. `/help` shows `Help`. Neither shows the section links.
9. Reload `/app/demo/squad`. The same heading returns. Application storage for this origin stays empty.
10. The document title stays `Touchline OS`. The favicon request stays on `/favicon.svg`.

## 10. Definition of done

- [ ] `react-router` is the only new dependency. The lockfile is updated. No version was typed by hand into this guide.
- [ ] `src/app/routes.ts` is the only section list. Nav links and feature pages use it.
- [ ] `createBrowserRouter` runs once at module scope.
- [ ] `App` still has the named export `App`. `src/main.tsx` is unchanged.
- [ ] Welcome actions do not navigate. Unknown section and unknown top-level path both show `Page not found`, and only the unknown section keeps the nav.
- [ ] `/app` and `/app/` show `Campaign not found`.
- [ ] `/app/demo` replaces the URL with `/app/demo/command-center`.
- [ ] No `fetch`, `localStorage`, `sessionStorage`, or `indexedDB` in the new files.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` exit 0.
- [ ] Diff does not add Tailwind, tests, `src/styles/`, `src/domain/`, `src/data/`, or a service worker.
- [ ] `MASTER_PLAN.md` and `plans/phase1.md` are unchanged.

## 11. Commit instructions

Stage the router dependency, lockfile, new source files, `src/app/App.tsx`, and `eslint.config.js` only if step 11 changed it. Include `plans/phase1/guide2.md` if it is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase1.md`.

Suggested message:

```text
feat(p01-g02): add app routing and layouts
```

Do not commit when section 8 is failing. Do not amend `360b544` or the docs commit. After the commit succeeds, record its full SHA on the `P01-G02` row of the progress log in `plans/phase1.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P01-G03` may assume:

- `workspaceSections`, `isWorkspaceSection`, and `workspaceSectionPath` live in `src/app/routes.ts`.
- `WorkspaceLayout` already renders the skip link, the ten `Link`s, and `<main id="main">`. Styling wraps this structure. It does not invent a second section list.
- Feature page paths in section 5 exist and own their section. `P01-G04` replaces the body of those pages. Keep the named exports.
- Welcome labels are inert text. `P01-G04` turns `Try fictional demo` into a link to `/app/demo/command-center` and adds the unavailable copy for create and import.
- `Campaign not found` and `Page not found` are the `h1` strings `P01-G04` must keep when it swaps in `ErrorState`.
- Tailwind, tokens, and `src/styles/` are still absent.
- `pnpm test` is still absent.

Known limitation: campaign ids are not looked up. Any non-empty id, including `demo`, renders the same placeholders. Phase 3 adds existence checks. The preview banner and the disclaimer are not on screen yet; `P01-G04` adds that copy.
