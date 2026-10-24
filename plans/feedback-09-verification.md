# Feedback 09: native components and automatic reads

Addresses the React portion of F10 in `feedback.md`. Step 08's existing Rust changes are preserved; this step changes native React code and tests.

`NativeWorkspace` retains the HashRouter and its public exports. Routing, migration controls, campaign listing, and screen content now live in separate modules. Pagination and policy preview remain separate components. `NativeEditors` retains its public component exports while lineup, constitution, and planning editors live in separate files; registration editing is also extracted from the management panel. The existing bounded page size is shared by pagination and roster editors.

`useNativeRead` owns only the repeated automatic read lifecycle. Its state discriminates loading, success, and error. A request identity includes the full caller key, memoized loader (including client identity), and retry attempt. A changed identity immediately hides previous output; cleanup ignores obsolete resolutions and rejections after changes or unmount. Returning from request A to B and back to A creates a fresh identity. A null loader waits for prerequisites without making a request. Synchronous adapter failures use the same public error mapping as rejections.

Campaigns, screen models, match reports, planning, transfer-player searches, transfer boards/clocks, and progression previews use the hook. Independent reads retain independent state, including the time-preview prerequisite for matchday previews. Transfer search reuses the initial screen page without requesting it twice and keeps the transfer board independent.

Mutation handlers, replay IDs, confirmation state, and explicit roster-loading operations remain in their components. Policy preview remains an explicitly submitted draft operation. The hook does not perform mutations, cache multiple requests, or introduce a state library.

Existing lifetime boundaries are retained: import refresh keys the route/list; campaign and screen key screen content; revision keys management forms; player query keys transfer management; selected player keys planning forms. Tests check that unrelated renders preserve drafts, navigation and explicit reload discard them, normal mutation retry retains its logical action, and reload creates a new action at the updated revision. Planning reads include campaign, player, and revision so older responses cannot replace current notes.

## Verification

Commands run from the repository root:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd build
pnpm.cmd exec prettier --check src/app/native src/test/native-read.test.tsx src/test/native-management.test.tsx src/test/native-matches.test.tsx
pnpm.cmd exec vitest run src/test/native-read.test.tsx src/test/native-workspace.test.tsx src/test/native-management.test.tsx src/test/native-progression.test.tsx src/test/native-matches.test.tsx src/test/native-boundary.test.tsx src/test/native-client.test.ts --maxWorkers=2
```

The read lifecycle tests cover initial loading/success, stable rerenders, unmount with either completion, input changes, reversed completion order, A/B/A request identity, client replacement, rejection, retry, obsolete attempts, prerequisites, and synchronous adapter failures. Component regressions additionally cover draft lifetimes, revision changes with late planning completion, and fixture retry without simulation.

The first `pnpm test -- ...` invocation expanded into the entire test suite rather than filtering. It reported a seed-demo timeout and was interrupted. An explicit isolated rerun of `seed-demo.test.ts` passed all six tests; that interrupted invocation does not certify the full frontend suite.

These are jsdom component/hook tests plus native adapter/boundary checks. The desktop WebView was not launched. No native IPC contract, generated binding, gameplay, schema, or save-format changes were made in this step.

Final results: all seven focused native test files passed (123 tests, 14.11s). Lint, typecheck, production build, formatting checks for the native modules and changed tests, and `git diff --check` passed. The separate match/read/seed-demo rerun also passed (19 tests, including all six seed-demo tests).
