# P01-G01 — Scaffold typed application

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`.
- **Parent phase:** `plans/phase1.md`, guide **P01-G01**.
- **Predecessor guide:** none. This is the first implementation commit.
- **Predecessor commit:** none. The tree may contain only planning files.
- **Commit subject:** `chore(p01-g01): scaffold typed application`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase1.md` → this guide. Do not install later-phase libraries to make the scaffold “more complete.”

## 2. Goal and user-observable result

A private Vite + React + TypeScript application builds, lints, and typechecks with pnpm. Opening the dev server shows a page whose only content is the heading **Touchline OS**.

The Vite sample counter, Vite/React logos, and template documentation links are gone. No router, database, test runner, or visual design system exists yet.

## 3. Preconditions

- Working directory is the repository root (the directory that contains `MASTER_PLAN.md` and `plans/phase1.md`).
- `package.json` does not exist yet. If it does, stop and reconcile with this guide before adding dependencies.
- Node.js (current LTS) and pnpm are installed. Enable pnpm with Corepack if the shell cannot find it.
- Do not hardcode package versions in this guide or in prose you add to the repo. Resolve the current stable versions at install time and commit the lockfile.
- Leave `MASTER_PLAN.md` and `plans/` byte-for-byte unchanged, except that this guide file is already the spec you are following.

## 4. Files to inspect

These files exist. Read them before editing:

- `MASTER_PLAN.md` sections 1.1, 2, 8, 12.3, and 14.
- `plans/phase1.md` sections 4, 5 (assumptions 1–4 and 8), and the `P01-G01` block in section 6.

No `src/` tree, `package.json`, or lockfile exists. Do not invent imports from files this guide does not create.

## 5. Files to create/modify

Create only:

| Path | Role |
| --- | --- |
| `package.json` | Private package `touchline-os`, `"type": "module"`, pinned `packageManager`, scripts below |
| `pnpm-lock.yaml` | Lockfile produced by pnpm |
| `.nvmrc` | Node major used to verify the scaffold, digits only |
| `tsconfig.json` | Project references or a single app config, as the current Vite React-TS template expects |
| `tsconfig.app.json` | App compiler options, if the template splits configs. `"strict": true` in the config that compiles `src/` |
| `tsconfig.node.json` | Config for `vite.config.ts`, if the template splits configs |
| `vite.config.ts` | React plugin only |
| `eslint.config.js` | Flat config for TypeScript and React, Prettier-compatible |
| `.prettierrc.json` | Prettier options |
| `.prettierignore` | Generated and planning files this guide must not reflow |
| `.gitignore` | Dependencies, build output, coverage, Playwright artifacts, logs, env files |
| `index.html` | Document shell |
| `src/main.tsx` | Mount |
| `src/app/App.tsx` | Named `App` export |
| `src/vite-env.d.ts` | `/// <reference types="vite/client" />` if the template does not already provide a client types reference |
| `public/favicon.svg` | Original mark specified below |
| `README.md` | Product summary and the commands that exist after this guide |

Scripts in `package.json`:

```json
{
  "dev": "vite",
  "build": "pnpm typecheck && vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "typecheck": "tsc -b --pretty false",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

Use `typecheck` as `tsc --noEmit` instead of `tsc -b --pretty false` only when the root `tsconfig.json` does **not** use project references. The script must typecheck `src/` and fail on errors. A solution-style root config with `"files": []` must not be checked by a bare `tsc --noEmit` that skips the app project.

Do not add `test` or `test:e2e`. Those scripts arrive in `P01-G05`.

### Public API this guide creates

```tsx
export function App(): JSX.Element
```

`src/main.tsx` imports that function from `./app/App`. No other component is exported.

## 6. Implementation steps

1. From the repo root, record the toolchain you will verify with:
   - `node -v`
   - `pnpm -v`
   Write the Node **major** only into `.nvmrc` (example shape: `22`, no `v` prefix). Set `package.json` `"packageManager"` to `pnpm@<exact version from pnpm -v>`.
2. Scaffold the current stable Vite `react-ts` template without deleting planning files. The root is not empty, so do not run a scaffolder in a way that removes `MASTER_PLAN.md` or `plans/`. Practical approach: create the template in a temporary directory, then copy its toolchain into the repo root. Do not copy its `README.md`, `src/App.tsx`, `src/App.css`, `src/index.css`, `src/assets/`, or `public/vite.svg`.
3. Install with pnpm. Keep the React, React DOM, Vite, TypeScript, and ESLint packages the template resolved. Add Prettier and `eslint-config-prettier` if the template did not include them. Do not add React Router, Tailwind, Vitest, Playwright, Dexie, Zod, Zustand, Recharts, TanStack Table, React Hook Form, or `vite-plugin-pwa`.
4. Point ESLint and Prettier at each other. The flat config covers `**/*.{ts,tsx}` and includes the template’s TypeScript, React Hooks, and React Refresh rules, then `eslint-config-prettier` so formatting rules are not duplicated. Ignore `dist`, `node_modules`, `coverage`, `playwright-report`, `test-results`, and `blob-report`.
5. Add `.prettierignore` entries for `pnpm-lock.yaml`, `dist`, `coverage`, `playwright-report`, `test-results`, `blob-report`, `MASTER_PLAN.md`, and `plans`. `format:check` must not reflow the planning documents.
6. Add a `.gitignore` that includes `node_modules`, `dist`, `coverage`, `playwright-report`, `test-results`, `blob-report`, `*.local`, `.env`, and `.env.*`.
7. Confirm the config that compiles `src/` has `"strict": true`. Leave other template compiler flags as the template set them. Do not turn `strict` off.
8. Replace the document shell with this `index.html`. No stylesheet and no font URL on another origin:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Touchline OS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

9. Write `public/favicon.svg` exactly. It is a graphite square and a single amber line, not a club crest and not the Vite logo:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Touchline OS">
  <rect width="32" height="32" rx="6" fill="#1c1f24"/>
  <rect x="4" y="15" width="24" height="2" fill="#e0a84a"/>
</svg>
```

10. Write `src/app/App.tsx`:

```tsx
export function App() {
  return <h1>Touchline OS</h1>
}
```

11. Write `src/main.tsx` so a missing root fails visibly:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root is missing')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

12. Keep `vite.config.ts` limited to the React plugin and the default Vite config export. No PWA plugin, no path alias required by a later phase.
13. Delete template leftovers if they were copied: `src/App.tsx`, `src/App.css`, `src/index.css`, `src/assets/`, `public/vite.svg`, and any template `README` content. Do not add `src/styles/` in this guide.
14. Write `README.md` with:
    - The heading `Touchline OS`.
    - This pitch, verbatim: `Touchline OS is an offline-first sporting-director workspace for players managing a football career in another game: track a club, enforce self-imposed rules, plan squads and transfers, analyze finances, and document each season — without simulating matches.`
    - Non-goals, in short: no match simulation, no accounts, no hosted player database.
    - This disclaimer, verbatim: `Unofficial fan-made companion; not affiliated with any football game, team or league.`
    - Install: `pnpm install`.
    - Dev server: `pnpm dev`.
    - Checks that exist now: `pnpm lint`, `pnpm typecheck`, `pnpm build`.
    - The Node major from `.nvmrc` and the exact pnpm version from `packageManager`.
    - Do not document `pnpm test` or `pnpm test:e2e`. They do not exist yet.
15. Run the verification commands in section 8. Fix type, lint, or format failures inside this guide’s files before committing. Do not silence a rule or weaken `strict` to get a green check.

## 7. Tests to add/change

None. Vitest, React Testing Library, and Playwright are `P01-G05`.

Do not add a test script that exits 0 without running tests. Do not add a placeholder `src/test/` directory.

## 8. Verification commands

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected:

- Each command exits 0.
- `pnpm typecheck` reports errors in `src/` if you temporarily break `App` (undo that experiment before commit).
- `dist/` is produced by `pnpm build` and is gitignored.
- `pnpm test` and `pnpm test:e2e` are absent, so invoking them fails. That failure is expected. Do not add the scripts to hide it.

## 9. Manual acceptance check

1. Run `pnpm dev` and open the URL Vite prints.
2. The document title is `Touchline OS`.
3. The page shows one heading, `Touchline OS`, and no counter, logo, or “edit `src/App.tsx`” copy.
4. Reload. The same heading remains. The page does not write to `localStorage` or `IndexedDB` (Application panel stays empty for this origin’s storage).
5. In the Network panel, the document, script, and favicon come from the dev origin. There is no stylesheet or font request to another origin.
6. Stop the dev server.

## 10. Definition of done

- [ ] `package.json` name is `touchline-os`, private, `"type": "module"`, with the scripts in section 5 and a `packageManager` pin.
- [ ] `.nvmrc` matches the Node major used for the successful checks.
- [ ] `pnpm-lock.yaml` is committed. No dependency version is written by hand into this guide.
- [ ] The app compiler config has `"strict": true`.
- [ ] `App` renders only `Touchline OS`. `src/main.tsx` throws if `#root` is missing.
- [ ] `index.html` title is `Touchline OS` and links `/favicon.svg`.
- [ ] Favicon SVG matches section 6 step 9.
- [ ] README contains the pitch, the three non-goals, the disclaimer, and `lint` / `typecheck` / `build`.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` exit 0.
- [ ] Diff does not add React Router, Tailwind, Vitest, Playwright, Dexie, Zod, a service worker, `src/domain/`, `src/data/`, `src/styles/`, or `src/test/`.
- [ ] `MASTER_PLAN.md` and `plans/phase1.md` are unchanged.
- [ ] No secrets, `.env` files, `node_modules`, or `dist` are staged.

## 11. Commit instructions

Stage the scaffold files and this guide if it is still untracked:

- `package.json`
- `pnpm-lock.yaml`
- `.nvmrc`
- `.gitignore`
- `.prettierrc.json`
- `.prettierignore`
- `eslint.config.js`
- `tsconfig.json` and any `tsconfig.*.json` the template requires
- `vite.config.ts`
- `index.html`
- `public/favicon.svg`
- `src/main.tsx`
- `src/app/App.tsx`
- `src/vite-env.d.ts` (only if this guide created it)
- `README.md`
- `plans/phase1/guide1.md` if it is not already committed

Do not stage `node_modules`, `dist`, or edits to `MASTER_PLAN.md` or `plans/phase1.md`.

Suggested message:

```text
chore(p01-g01): scaffold typed application
```

Do not commit when `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, or `pnpm build` is failing. Do not amend a previous commit. After the commit succeeds, record its SHA in the progress log in `plans/phase1.md` section 10. That log line is a follow-up documentation edit; do not fold it into this commit if the commit already succeeded.

## 12. Handoff

`P01-G02` may assume:

- `pnpm` scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `format`, and `format:check` exist and pass.
- The mount file is `src/main.tsx`. The screen component is the named export `App` from `src/app/App.tsx`.
- `App` currently returns only `<h1>Touchline OS</h1>`. The next guide replaces that body with the router. Keep the `App` export and the `#root` mount.
- React Router is **not** installed. `P01-G02` adds it.
- Tailwind, global CSS, and `src/styles/` are **not** present. `P01-G03` adds them.
- The test runner is **not** present. Do not expect `pnpm test` until `P01-G05`.
- Favicon path `/favicon.svg` is the document icon. Later guides must not replace it with a club crest or the Vite logo.

Known limitation: the page is an unstyled heading. Campaign routes, the navigation shell, and empty states do not exist until later Phase 1 guides.
