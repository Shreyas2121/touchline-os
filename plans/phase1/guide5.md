# P01-G05 — Verification gates

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §12.3.
- **Parent phase:** `plans/phase1.md`, guide **P01-G05**. The test list and failure cases are the `P01-G05` block in phase §6. The browser smoke is phase §8 steps 1–8.
- **Predecessor guide:** `plans/phase1/guide4.md`.
- **Predecessor commit:** `e12589a71b4be5503e1769ec50f0ea6da779e4a2` (`feat(p01-g04): build navigable product shell`).
- **Commit subject:** `test(p01-g05): establish verification gates`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase1.md` → this guide.

## 2. Goal and user-observable result

The shell from `P01-G04` stays the same. What changes is that it is now checked.

- `pnpm test` fails if the welcome disclaimer disappears, the demo link points somewhere else, `/app` renders the workspace, a status pill has no word, or the rail drops a section.
- `pnpm test:e2e` opens the production preview in Chromium and walks phase §8 steps 1–8.
- GitHub Actions runs lint, typecheck, unit tests, and build. It does not install Playwright browsers.

No new screen, route, or copy string.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor e12589a71b4be5503e1769ec50f0ea6da779e4a2 HEAD` succeeds.
- Working tree is clean, or the only uncommitted files are this guide and the progress-log lines in `plans/phase1.md`. Do not stage that log in this commit.
- `package.json` has no `test` script and no Vitest or Playwright dependency. If either is already present, stop and reconcile.
- Do not type a package version by hand. Commit the lockfile pnpm writes.
- Leave `MASTER_PLAN.md` and `plans/phase1.md` unchanged in this commit.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase1.md` `P01-G05` block and §8 steps 1–8.
- `package.json` — scripts and `packageManager`. `.nvmrc` contains the Node major.
- `vite.config.ts` and `tsconfig.json` / `tsconfig.node.json` / `tsconfig.app.json`. App sources are included from `src`. `tsc -b` checks the referenced projects.
- `src/app/router.tsx` — `createBrowserRouter` and the exported `router`. Paths stay as they are.
- `src/app/copy.ts` — import these constants in tests. Do not retype the sentences.
- `src/app/routes.ts` — `workspaceSections` is the rail list.
- `src/components/ui/StatusPill.tsx` — `tone` selects the word.
- `src/components/ui/NavRail.tsx` — `useState` initializer calls `window.matchMedia('(max-width: 720px)').matches`.
- `src/app/pages/WelcomePage.tsx` — demo `Link`, create and import buttons.
- `eslint.config.js` — lint scope is `**/*.{ts,tsx}`.
- `README.md` — Checks section currently lists lint, typecheck, and build only.

`src/test/`, `e2e/`, and `.github/workflows/` do not exist yet.

## 5. Files to create/modify

**Add dev dependencies, with no version arguments:**

- `vitest`
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@playwright/test`

Do not add `@testing-library/user-event`, `axe-core`, or `eslint-plugin-testing-library`.

**Create:**

| Path | Role |
| --- | --- |
| `vitest.config.ts` | jsdom, setup file, exclude `e2e/` |
| `src/test/setup.ts` | jest-dom matchers and a `matchMedia` stub |
| `src/test/render.tsx` | `renderAt(path)` using `createMemoryRouter` |
| `src/test/welcome.test.tsx` | Welcome screen |
| `src/test/routing.test.tsx` | Missing campaign, redirect, not found |
| `src/test/status-pill.test.tsx` | Four visible words |
| `src/test/shell-nav.test.tsx` | Ten labels and the preview banner |
| `playwright.config.ts` | Chromium only; production preview server |
| `e2e/smoke.spec.ts` | Phase §8 steps 1–8 |
| `.github/workflows/ci.yml` | lint, typecheck, test, build |

**Modify:**

- `src/app/router.tsx` — export the existing route array as `appRoutes`. `router` stays `createBrowserRouter(appRoutes)`. Do not change a path, a page, or the redirect.
- `tsconfig.node.json` — include `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, and `e2e/**/*.ts` so `pnpm typecheck` sees them.
- `package.json` — scripts only: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`.
- `README.md` — replace the Checks section with the five commands below, and the one-time `pnpm exec playwright install chromium` before e2e.

Do not change feature pages, `copy.ts`, or tokens.

### Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

## 6. Implementation steps

1. Install the dev dependencies in §5 with pnpm. Do not pass versions.

2. `src/test/setup.ts`:
   - Import `@testing-library/jest-dom/vitest`.
   - If `window.matchMedia` is missing, define it as a function that returns `{ matches: false, addEventListener() {}, removeEventListener() {} }`. `matches: false` keeps the rail expanded in unit tests. Do not change `NavRail` to avoid this call.

3. `vitest.config.ts` uses `defineConfig` from `vitest/config`, `environment: 'jsdom'`, `setupFiles: './src/test/setup.ts'`, and a test exclude that omits `e2e/**`. Do not set `globals: true`. Test files import `describe`, `it`, and `expect` from `vitest`.

4. In `src/app/router.tsx`, name the route array `appRoutes` and export it. Keep `export const router = createBrowserRouter(appRoutes)`. `App` still imports `router`. If `react-refresh/only-export-components` reports `appRoutes` or `router`, allow those two export names for `src/app/router.tsx` only. Do not disable the rule for the project.

5. `src/test/render.tsx` exports `renderAt(path: string)`. It builds `createMemoryRouter(appRoutes, { initialEntries: [path] })` and renders `<RouterProvider router={memoryRouter} />` through `@testing-library/react`. Import both from `react-router`. Do not use the browser `router` in unit tests.

6. `welcome.test.tsx` calls `renderAt('/')` and asserts:
   - heading `Touchline OS`
   - text `disclaimer` from `src/app/copy.ts`
   - the link named `Try fictional demo` has `href` `/app/demo/command-center`
   - clicking the button named `Create new campaign` shows `createPanel`, and the path is still `/` (no navigation assertion beyond the text appearing in the same render)
   - clicking `Import backup` shows `importPanel`
   - `queryByText('Campaign saved')` is `null`

   Use `fireEvent.click` from `@testing-library/react`.

7. `routing.test.tsx`:
   - `renderAt('/app')` shows heading `missingCampaignTitle` and does not show a link named `Squad`.
   - `renderAt('/app/demo')` finds heading `Command Center`.
   - `renderAt('/app/demo/not-a-section')` and `renderAt('/nope')` each show heading `notFoundTitle`.

   Use `findByRole` for the redirect so the `Navigate` can commit.

8. `status-pill.test.tsx` renders one `StatusPill` per tone: `blocked`, `warning`, `informational`, `passed`. Each render contains the visible text `Blocked`, `Warning`, `Informational`, or `Passed`. Assert with `getByText`. A pill that renders only an icon fails.

9. `shell-nav.test.tsx` calls `renderAt('/app/demo/command-center')`. For every `workspaceSections` entry, `getByRole('link', { name: section.label })` succeeds. `getByText(previewBanner)` succeeds.

10. `playwright.config.ts`:
    - `testDir: 'e2e'`
    - one project, Chromium, via `devices['Desktop Chrome']`
    - `webServer.command` is `pnpm build && pnpm preview --host 127.0.0.1 --port 4173`
    - `webServer.url` is `http://127.0.0.1:4173`
    - `reuseExistingServer: false`
    - `use.baseURL` is that same URL

    Do not point the server at `pnpm dev`.

11. `e2e/smoke.spec.ts` uses `@playwright/test` and the copy constants. Cover phase §8 steps 1–8 in one test, in order:

    1. Open `/`. Expect heading `Touchline OS`, text `disclaimer`, and the three names `Try fictional demo`, `Create new campaign`, and `Import backup`.
    2. Click `Try fictional demo`. URL path is `/app/demo/command-center`. Expect `previewBanner`, and four times the text `previewValue` is acceptable as `getByText('Preview', { exact: true })` with a count, or four KPI labels each followed by `Preview`. Expect the status words `Blocked`, `Warning`, `Informational`, and `Passed`.
    3. Go back to `/`. Click `Create new campaign`. The path stays `/` and `createPanel` is visible. Click `Import backup`. The path stays `/` and `importPanel` is visible. `page.locator('input[type=file]')` has count 0.
    4. Return to the demo. Click the rail link `Squad`. The path ends with `/squad`. Expect column header `Name` and text `noRecords`. Do not expect a player name. Click `Tactics`. Expect `pitchPreview`. Click `Constitution`. Expect `constitutionNote` and the text `SELL_TO_BUY`.
    5. On that page, focus the link `Skip to content`. Expect its computed `outline-style` to be `solid`. Press Enter. Expect `document.activeElement` to be `#main`. Press Tab until the focused element is the link `Squad`, with a cap of 15 tabs. Press Enter. The path ends with `/squad`.
    6. Open `/app`. Expect heading `missingCampaignTitle`. The link `Squad` is absent. Click `backToWelcome`. The path is `/`.
    7. Open `/app/demo/not-a-section`. Expect heading `notFoundTitle` and text `previewBanner`. Open `/nope`. Expect heading `notFoundTitle` and no link named `Squad`.

12. `.github/workflows/ci.yml` runs on `pull_request` and on `push` to `main`. One job:

    - checkout
    - `pnpm/action-setup` with `version` equal to the version already in `package.json` `packageManager` (`pnpm@12.9.1` means version `12.9.1`). Do not bump pnpm.
    - `actions/setup-node` with `node-version-file: .nvmrc` and `cache: pnpm`
    - `pnpm install --frozen-lockfile`
    - `pnpm lint`
    - `pnpm typecheck`
    - `pnpm test`
    - `pnpm build`

    Use the current documented major of `actions/checkout`, `actions/setup-node`, and `pnpm/action-setup`. Do not add a Playwright step.

13. README Checks becomes:

    ```bash
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm exec playwright install chromium
    pnpm test:e2e
    ```

    State that the Playwright install is once per machine, before `pnpm test:e2e`. Keep the pitch, non-goals, disclaimer, and toolchain sections.

14. Extend `tsconfig.node.json` `include` as in §5. If `verbatimModuleSyntax` or `nodenext` rejects a config import, fix the import syntax. Do not turn `strict` off.

15. Run section 8. If a unit test fails because `matchMedia` is missing, fix the stub in `src/test/setup.ts`. If the smoke fails, fix the spec or a real shell bug. Do not delete a step from §6 step 11. Do not weaken an assertion to match a wrong href or a missing word.

## 7. Tests to add/change

The four unit files and `e2e/smoke.spec.ts` are the whole new suite.

| File | Must fail when |
| --- | --- |
| `welcome.test.tsx` | The disclaimer is not rendered, or the demo `href` is not `/app/demo/command-center`, or create/import copy is missing, or `Campaign saved` appears |
| `routing.test.tsx` | `/app` shows a Squad rail link, `/app/demo` does not reach Command Center, or either not-found URL lacks `Page not found` |
| `status-pill.test.tsx` | Any tone renders without its word |
| `shell-nav.test.tsx` | Any `workspaceSections` label is missing, or `previewBanner` is missing |
| `e2e/smoke.spec.ts` | The preview banner is missing on the demo command center or on Squad, or steps 1–8 in §6 do not hold |

No fixtures beyond `copy.ts` and `workspaceSections`. No 3k-player or finance-rule tests. Those belong to later phases.

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
- `pnpm test` runs the four files in `src/test/` and no e2e file.
- `pnpm test:e2e` starts `vite preview` only after `pnpm build`, then runs `e2e/smoke.spec.ts` in Chromium.
- The first e2e run may spend a minute in `pnpm build` because that script typechecks before Vite builds. That wait is expected.

`pnpm test:watch` must exist and must not be the CI command.

## 9. Manual acceptance check

The smoke spec is the manual pass. After `pnpm test:e2e` exits 0, open the HTML report only if a step failed. On success, confirm the Playwright output lists `e2e/smoke.spec.ts` as passed and that the preview server was not `pnpm dev`.

Do not click through the app again unless the spec failed. The spec already performs phase §8 steps 1–8.

## 10. Definition of done

- [ ] `appRoutes` is exported and `router` is still the browser router used by `App`.
- [ ] Unit tests import copy and section labels. They do not duplicate those strings except the negative `Campaign saved`.
- [ ] `matchMedia` is stubbed in test setup. `NavRail` is unchanged.
- [ ] `pnpm test` does not launch a browser. `pnpm test:e2e` uses the production preview.
- [ ] CI runs lint, typecheck, test, and build, and does not run Playwright.
- [ ] README lists all five commands and the one-time Chromium install.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exit 0.
- [ ] Diff does not add a product screen, a dependency outside §5, Dexie, Zod, or a service worker.
- [ ] `MASTER_PLAN.md` and `plans/phase1.md` are unchanged by this commit.

## 11. Commit instructions

Stage the test config, tests, workflow, README, lockfile, `package.json`, `tsconfig.node.json`, `src/app/router.tsx`, `eslint.config.js` only if step 4 changed it, and `plans/phase1/guide5.md` if it is still untracked.

Do not stage `node_modules`, `dist`, `test-results`, `playwright-report`, `blob-report`, `MASTER_PLAN.md`, or `plans/phase1.md`.

Suggested message:

```text
test(p01-g05): establish verification gates
```

Do not commit when section 8 is failing. Do not amend `e12589a`. After the commit succeeds, record its full SHA on the `P01-G05` row of the progress log in `plans/phase1.md` §10. That log edit is not part of this commit.

## 12. Handoff

Phase 2 may assume:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exist and pass on this commit.
- New unit tests belong under `src/test/` and use `renderAt` for any route.
- `appRoutes` is the route table. New pages are added there, then covered by a test. Do not create a second browser router.
- CI does not run end-to-end tests. Run `pnpm test:e2e` locally before a phase exit.
- Copy assertions should import `src/app/copy.ts`.
- The shell behavior locked here is still a static preview. Phase 2 adds the database behind it and must not delete the welcome, routing, status-pill, or shell-nav tests to make a persistence change pass.

Known limitation: the smoke does not cover offline install, a real campaign id, or a blocked transfer. Those are later phases.
