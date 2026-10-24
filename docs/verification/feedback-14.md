# Feedback 14: CI formatting and Chromium regression checks

The existing Linux verification job now runs `pnpm format:check`. Two existing
formatting differences in `game-client.ts` and `native-progression.test.tsx` were
corrected so the gate passes. Their changes are formatting only.

A separate Linux browser job uses the repository's pnpm 12.9.1, Node version file
and frozen lockfile. It installs Chromium and its system dependencies, then runs
`pnpm test:e2e --project=chromium`. Playwright's `webServer` builds the
browser app and starts Vite preview at `http://127.0.0.1:4173`; server reuse stays
disabled. This follows the [Playwright CI setup](https://playwright.dev/docs/ci).

The default application entry now requires native IPC, so the previous E2E
command could not reach the retained browser UI. An explicit `build:browser`
command and `vite.browser.config.ts` select `src/browser-main.tsx`, which mounts
the existing database provider and browser router. `preview:browser` serves that
build from `dist-browser`. The default build continues to mount the native
bootstrap. Generated browser assets are ignored by Git, ESLint and Prettier.

CI runs one browser worker and refuses focused tests. Playwright has a 15-minute
global timeout inside the job's 20-minute timeout, allowing it to finish its
report before the job limit. HTML reports are generated without opening a browser;
traces and screenshots are retained on failure. The failure upload step retains
`playwright-report/` and `test-results/` for 14 days using
[GitHub's artifact action](https://github.com/actions/upload-artifact/releases/tag/v7.0.2).
Playwright's own output directory is `test-results/playwright`, so starting the
browser suite does not clear other verification logs under `test-results`.

The Windows native job, generated bindings check, Rust formatting, Clippy and
workspace test commands are preserved. Chromium E2E covers the built browser
application; it does not certify native IPC or WebView behavior.

All seven existing browser specs are discovered without filtering individual
files: demo journey, desktop export, finances, simulation migration, shell smoke,
tactics and transfers.

## Local verification

The complete final gate was run on Windows on 2026-10-24:

| Check                                                            | Result                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm lint`                                                      | Passed                                                         |
| `pnpm typecheck`                                                 | Passed                                                         |
| `pnpm test`                                                      | Passed: 66 files, 885 tests                                    |
| `pnpm build`                                                     | Passed, including after adding the browser build configuration |
| `pnpm build:browser`                                             | Passed                                                         |
| `pnpm format:check`                                              | Passed                                                         |
| `pnpm test:e2e --project=chromium --workers=1 --forbid-only`     | Passed: all 7 specs, 55.5 seconds                              |
| `node scripts/native-bindings.mjs --check`                       | Passed                                                         |
| `cargo fmt --all --check`                                        | Passed                                                         |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Passed                                                         |
| `cargo test --workspace --locked`                                | Passed, including full-season certification                    |

The optional internal-read profiling benchmark remains ignored by default.
The full-season test completed in 674.92 seconds. Chromium and system dependency
installation succeeded outside the sandbox, where Windows system detection is
available. The E2E run used the same single-worker/focused-test settings as CI.
Failure screenshots and traces were produced when the first run exposed the
native entry mismatch; the final HTML report shows all seven browser tests passing.

The hosted Linux job and GitHub artifact upload have not been executed locally.
The results above certify the local commands, not a hosted workflow run or a
native desktop UI session.
