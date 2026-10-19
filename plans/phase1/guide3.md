# P01-G03 — Terminal design system

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §3.2.
- **Parent phase:** `plans/phase1.md`, guide **P01-G03**. Token names are phase §5. Behavior is the `P01-G03` block in phase §6.
- **Predecessor guide:** `plans/phase1/guide2.md`.
- **Predecessor commit:** `f8cbb2db83668b501c9ce1a2ac33a04d8f23c92f` (`feat(p01-g02): add app routing and layouts`).
- **Commit subject:** `feat(p01-g03): establish terminal design system`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase1.md` → this guide.

## 2. Goal and user-observable result

The existing routes wear the dark terminal shell.

- The page background is graphite. Text is light. The type is a system font.
- `/app/demo/command-center` shows a skip link, a collapsible section rail with all ten labels, a top bar, and the heading `Command Center`.
- The active section link exposes `aria-current="page"`.
- The command center shows four status pills whose visible words are `Blocked`, `Warning`, `Informational`, and `Passed`.
- Focus is visible on the skip link, the collapse control, rail links, and top-bar controls.
- Welcome, settings, help, missing campaign, and top-level not-found use the same dark page and a page header. They do not show the section rail.
- No font or stylesheet is requested from another origin.

The route table does not change. Nothing is saved. The preview banner, KPI figures, and empty-state copy arrive in `P01-G04`.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor f8cbb2db83668b501c9ce1a2ac33a04d8f23c92f HEAD` succeeds.
- Working tree is clean, or the only uncommitted files are this guide and the `P01-G02` progress-log line in `plans/phase1.md`. Do not stage that log line in this commit.
- `package.json` does not depend on `tailwindcss` or `lucide-react`. If either is already present, stop and reconcile.
- Do not type a package version by hand. Commit the lockfile pnpm writes.
- Leave `MASTER_PLAN.md` and `plans/phase1.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase1.md` §5 token names and the `P01-G03` block in §6.
- `src/app/layout/WorkspaceLayout.tsx` — skip link, ten `Link`s from `workspaceSections`, `<main id="main">`.
- `src/app/router.tsx` — route table. Do not add, remove, or rename a path.
- `src/app/routes.ts` — `workspaceSections`, `workspaceSectionPath`. This remains the only section list.
- `src/app/pages/SectionPage.tsx`, `WelcomePage.tsx`, `MissingCampaignPage.tsx`, `NotFoundPage.tsx`.
- `src/features/dashboard/CommandCenterPage.tsx`.
- `src/features/settings/SettingsPage.tsx` and `src/features/help/HelpPage.tsx`.
- `src/main.tsx` — the only mount. The `#root` throw stays.
- `index.html` — title `Touchline OS`, favicon `/favicon.svg`, no remote font or stylesheet.
- `vite.config.ts` — React plugin only, until the installed Tailwind major's Vite guide requires one more plugin.
- `.prettierrc.json` — `semi: false`, `singleQuote: true`.

`src/components/ui/` and `src/styles/` do not exist yet.

## 5. Files to create/modify

**Add dependencies:**

- `tailwindcss`, plus the single Vite integration its current major documents (`@tailwindcss/vite` or the PostCSS path, not both).
- `lucide-react`.
- Do not add Radix. A native `button` meets the collapse control.

**Create:**

| Path | Role |
| --- | --- |
| `src/styles/tokens.css` | CSS variables in §6 step 2 |
| `src/styles/global.css` | Tailwind import, token import, page color, reduced motion |
| `src/components/ui/Button.tsx` | `Button` |
| `src/components/ui/StatusPill.tsx` | `StatusPill` |
| `src/components/ui/PageHeader.tsx` | `PageHeader` |
| `src/components/ui/KpiRibbon.tsx` | `KpiRibbon` |
| `src/components/ui/EmptyState.tsx` | `EmptyState` |
| `src/components/ui/ErrorState.tsx` | `ErrorState` |
| `src/components/ui/NavRail.tsx` | `NavRail` |
| `src/components/ui/TopBar.tsx` | `TopBar` |
| `src/components/ui/AppShell.tsx` | `AppShell` |
| `src/components/ui/Banner.tsx` | `Banner` |

**Modify:**

- `src/main.tsx` — import `./styles/global.css` once.
- `src/app/layout/WorkspaceLayout.tsx` — render `AppShell` instead of a second nav.
- `src/app/pages/SectionPage.tsx` — `PageHeader` whose title is the section label. Keep the unknown-section throw.
- `src/features/dashboard/CommandCenterPage.tsx` — section heading plus one pill of each tone.
- `WelcomePage`, `MissingCampaignPage`, `NotFoundPage`, `SettingsPage`, `HelpPage` — `PageHeader` with the same heading strings they have now. Keep the three welcome paragraphs as inert text.
- `vite.config.ts` only if the Tailwind major's Vite guide says to register its plugin.
- `package.json` and `pnpm-lock.yaml`.

Do not create `src/app/copy.ts`. Do not install Dexie, Zod, Vitest, Playwright, Recharts, or `vite-plugin-pwa`.

### Public API

```tsx
export function Button(
  props: {
    variant?: 'primary' | 'quiet'
    children: React.ReactNode
  } & React.ButtonHTMLAttributes<HTMLButtonElement>,
): JSX.Element

export function StatusPill(props: {
  tone: 'blocked' | 'warning' | 'informational' | 'passed'
}): JSX.Element

export function PageHeader(props: {
  title: string
  description?: string
}): JSX.Element

export function KpiRibbon(props: {
  items: readonly { label: string; value: string }[]
}): JSX.Element

export function EmptyState(props: { title: string; description: string }): JSX.Element
export function ErrorState(props: { title: string; description: string }): JSX.Element

export function NavRail(props: { campaignId: string }): JSX.Element

export function TopBar(props: { campaignId?: string }): JSX.Element

export function Banner(props: { children: React.ReactNode }): JSX.Element

export function AppShell(props: {
  campaignId?: string
  banner?: React.ReactNode
  children: React.ReactNode
}): JSX.Element
```

`PageHeader` renders `title` as an `h1`. `StatusPill` chooses the visible word from `tone`. Callers cannot pass a custom word.

## 6. Implementation steps

1. Install Tailwind by the current major's Vite instructions, and install `lucide-react`. Do not pass versions. If that major is CSS-first, import it from `global.css` and do not also add a legacy `tailwind.config.js`. If it is config-first, set `content` to `./index.html` and `./src/**/*.{ts,tsx}`. Map utilities back to the variables below. The variable **names** are the contract, not the config filename.
2. Define these variables in `src/styles/tokens.css`. Values:

   | Name | Value |
   | --- | --- |
   | `--surface-0` | `#121417` |
   | `--surface-1` | `#1c1f24` |
   | `--surface-2` | `#262b33` |
   | `--border` | `#3a404a` |
   | `--text` | `#e6e8eb` |
   | `--text-muted` | `#9aa3ad` |
   | `--amber` | `#e0a84a` |
   | `--teal` | `#3dbeb6` |
   | `--block` | `#d4534b` |
   | `--focus` | `#e0a84a` |
   | `--nav-width` | `260px` |
   | `--font-sans` | `system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |

   `260px` is inside the required 240–280px range. Do not add a theme toggle or a second palette.

3. `global.css` imports the tokens and Tailwind, then sets `body` to `background: var(--surface-0)`, `color: var(--text)`, and `font-family: var(--font-sans)`. Add:

   ```css
   @media (prefers-reduced-motion: reduce) {
     .nav-rail {
       transition: none;
     }
   }
   ```

4. Import `global.css` from `src/main.tsx` only. Do not add a `<link>` in `index.html`.

5. `Button` renders a native `<button>`. `primary` uses `--amber` as the background and `--surface-0` as the text. `quiet` uses transparent background and `--text-muted`. Both use `outline: 2px solid var(--focus)` and `outline-offset: 2px` on `:focus-visible`. The `disabled` attribute stays on the element, sets `aria-disabled`, and mutes the control. Default variant is `quiet`.

6. `StatusPill` maps tone to word and icon:

   | `tone` | Word | Lucide icon |
   | --- | --- | --- |
   | `blocked` | `Blocked` | `Ban` |
   | `warning` | `Warning` | `TriangleAlert` |
   | `informational` | `Informational` | `Info` |
   | `passed` | `Passed` | `CircleCheck` |

   If the installed `lucide-react` renamed an icon, use the same meaning and keep the word. The icon is `aria-hidden`. Color may reinforce the word: `--block`, `--amber`, `--teal`, and `--teal` again for passed. The word is always in the accessible name. Do not accept a `children` label.

7. `PageHeader` renders `h1` plus an optional description paragraph in `--text-muted`. `KpiRibbon` renders one group per item. The value uses `font-variant-numeric: tabular-nums`. Do not mount `KpiRibbon` in this guide, and do not invent a euro amount. `EmptyState` and `ErrorState` each render the title as text and the description as text. Do not mount them yet.

8. `Banner` renders `children` inside an element with `role="status"`. `AppShell` renders `Banner` only when `banner` is passed. `WorkspaceLayout` does not pass `banner` in this guide. `P01-G04` supplies `Static preview — not save data`.

9. `NavRail`:
   - Takes `campaignId` and maps `workspaceSections` from `src/app/routes.ts`. Do not copy the ten labels into this file.
   - Each item is a React Router `NavLink` to `workspaceSectionPath(campaignId, section.id)`. `NavLink` sets `aria-current="page"` on the active section.
   - The list sits in `<nav id="section-nav" class="nav-rail">` whose expanded width is `var(--nav-width)`.
   - A native button labeled `Collapse navigation` or `Expand navigation` has `aria-expanded` and `aria-controls="section-nav"`.
   - Collapsed means the link list has the `hidden` attribute, so those links leave the tab order. The button stays available.
   - Expanded state is `useState`, initialized from `window.matchMedia('(max-width: 720px)').matches`. At or below 720px the first paint is collapsed. Wider first paint, including landscape tablet, is expanded. Do not subscribe to later resize events and do not write this state to `localStorage`.
   - A width transition on `.nav-rail` is allowed only when the user has not requested reduced motion. Step 3 already disables it.

   Assumption: 720px is the narrow breakpoint. Desktop and landscape tablet viewports used for the manual check are wider than that.

10. `TopBar` shows `campaignId` as plain text when it is passed. It does not list other campaigns. `Search` and `Backup` are `quiet` buttons with no click handler and no file input. `Settings` and `Help` are React Router `Link`s to `/settings` and `/help`, with the same focus ring as `Button`.

11. `AppShell` order is: skip link `Skip to content` (`href="#main"`), then `NavRail` when `campaignId` is present, then `TopBar`, then optional `Banner`, then `<main id="main" tabIndex={-1}>`. The main element is a 12-column grid (`repeat(12, minmax(0, 1fr))`). Its child, the outlet, spans all 12 columns. The skip link may sit off-screen until `:focus-visible`, when it becomes visible on `--surface-2` with the focus ring.

12. `WorkspaceLayout` reads `campaignId` and returns `<AppShell campaignId={campaignId}><Outlet /></AppShell>`. Remove the old skip link, `nav`, and `main` from this file so they are not duplicated. Keep the guard that omits the rail when `campaignId` is undefined.

13. `SectionPage` still looks up the id and throws `Unknown section: …` when the lookup fails. The success path renders `<PageHeader title={section.label} />` instead of a bare `h1`.

14. `CommandCenterPage` renders `<SectionPage sectionId="command-center" />` and then `StatusPill` for `blocked`, `warning`, `informational`, and `passed`, in that order.

15. Replace the raw `h1` on welcome, missing campaign, not found, settings, and help with `PageHeader` and these titles: `Touchline OS`, `Campaign not found`, `Page not found`, `Settings`, `Help`. Leave the welcome lines `Try fictional demo`, `Create new campaign`, and `Import backup` as paragraphs, not links.

16. Run section 8. If `react-refresh/only-export-components` fails because a UI file exports a non-component value, keep the props type unexported or mark it `export type`. Do not turn the rule off for the project. Do not weaken `strict`.

## 7. Tests to add/change

None. `P01-G05` will render `StatusPill` and the rail. Do not add `pnpm test`.

Do not mount sample KPI values to make the new components “visible.” An unused export of `KpiRibbon`, `EmptyState`, `ErrorState`, and `Banner` is expected.

## 8. Verification commands

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: each command exits 0. `pnpm test` is still absent.

## 9. Manual acceptance check

Restart `pnpm dev` after installing Tailwind and `lucide-react`.

1. Open `/app/demo/command-center`. The address stays that URL. The heading is `Command Center`. The background is dark and the text is light.
2. The rail lists Command Center, Squad, Tactics, Transfers, Finance, Registration, Scouting, Match Journal, Seasons, Constitution. Command Center is `aria-current="page"`.
3. The four pills read `Blocked`, `Warning`, `Informational`, and `Passed`.
4. Press Tab. The skip link appears with a visible focus ring. Activate it. Focus moves to `main`.
5. Tab to `Collapse navigation`. Activate it. `aria-expanded` is `false` and the ten links are not shown. Activate `Expand navigation`. The links return and `aria-expanded` is `true`.
6. Reload once with the window at or below 720px. The rail starts collapsed. Reload wider than 720px. It starts expanded.
7. With the operating system set to reduce motion, collapsing the rail does not animate. Restore the usual motion setting afterward.
8. Top bar shows the text `demo`. `Search` and `Backup` do not navigate and do not open a file picker. `Settings` opens `/settings` with heading `Settings` and no section rail. `Help` opens `/help` with heading `Help`.
9. `/` still shows `Touchline OS` and the three inert action lines. `/app` shows `Campaign not found` and no rail. `/nope` shows `Page not found` and no rail. `/app/demo/not-a-section` shows `Page not found` and still shows the rail.
10. In the Network panel, reload `/app/demo/command-center`. Document, script, CSS, and favicon come from the dev origin. There is no font or stylesheet request to another origin.
11. Application storage for this origin stays empty.

## 10. Definition of done

- [ ] Token names and values match step 2. `--nav-width` is 260px.
- [ ] `body` uses `--surface-0`, `--text`, and `--font-sans`. No remote font is linked.
- [ ] `WorkspaceLayout` renders one `AppShell`. The ten links still come from `workspaceSections`.
- [ ] Active rail link has `aria-current="page"`. Collapse uses `aria-expanded` and `aria-controls="section-nav"`.
- [ ] Collapse state is memory only. First paint follows the 720px media query.
- [ ] Reduced motion disables the rail width transition.
- [ ] Command center shows the four words. `StatusPill` does not take a custom label.
- [ ] Welcome actions are still not links. Route headings from `P01-G02` are unchanged.
- [ ] `KpiRibbon` is not given a currency value. `Banner` is not given the preview sentence.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` exit 0.
- [ ] Diff does not add Radix, Dexie, Zod, tests, a service worker, or `src/app/copy.ts`.
- [ ] `MASTER_PLAN.md`, `plans/phase1.md`, and `src/app/router.tsx` paths are unchanged.

## 11. Commit instructions

Stage the new style and UI files, the layout and page edits, `src/main.tsx`, Tailwind's Vite config change if step 1 required it, `package.json`, `pnpm-lock.yaml`, and `plans/phase1/guide3.md` if it is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, or `plans/phase1.md`.

Suggested message:

```text
feat(p01-g03): establish terminal design system
```

Do not commit when section 8 is failing. Do not amend `f8cbb2d`. After the commit succeeds, record its full SHA on the `P01-G03` row of the progress log in `plans/phase1.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P01-G04` may assume:

- Primitives in `src/components/ui/` match the signatures in §5.
- `AppShell` already accepts `banner`. Pass `Static preview — not save data` from `WorkspaceLayout` through that prop. Do not build a second shell.
- `NavRail` already lists the ten sections and collapses. Do not create another section array.
- `TopBar` already shows the campaign id and has inert `Search` and `Backup` buttons plus links to `/settings` and `/help`. `P01-G04` adds the unavailable panels. It does not add file inputs.
- `PageHeader` is the `h1` for section, welcome, settings, help, missing campaign, and not-found titles. Keep those title strings.
- `StatusPill` words are fixed by `tone`. The four examples may move, but the words stay.
- `KpiRibbon`, `EmptyState`, and `ErrorState` are ready and currently unmounted. `P01-G04` mounts them. Values on the ribbon are the word `Preview`, not amounts.
- `src/app/copy.ts` does not exist yet. `P01-G04` creates it.
- Tailwind is installed. Do not add a second styling system. `pnpm test` is still absent.

Known limitation: the shell is visual chrome around placeholders. Campaign ids are still not looked up. Search, backup, create, and import do nothing yet.
