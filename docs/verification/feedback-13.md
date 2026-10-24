# Feedback 13: test environments

`pnpm test` still runs the complete suite. Vitest now has three projects with
disjoint includes/excludes:

- `domain`: pure logic and native adapter contracts, using Node with no setup.
- `storage`: Node plus fake IndexedDB, without React or jsdom setup.
- `ui`: jsdom, fake IndexedDB, React cleanup, DOM matchers and `matchMedia`.

The six existing `.ts` suites that also render React stay in `ui`. New `.tsx`
tests automatically use `ui`; new `.ts` tests default to `storage`. Add pure suites
to `domainTests` in `vitest.config.ts` to avoid storage setup as well. Per-file
isolation and worker concurrency retain Vitest defaults.

Three environment tests check absence of browser/storage globals in `domain`,
working IndexedDB and database deletion/reopening without a DOM in `storage`, and
React rendering with the required globals/matchers in `ui`. Existing persistence
tests retain their database cleanup hooks.

## Measurement method

Runs use Windows, Node 22.23.2, pnpm 12.9.1 and Vitest 5.0.5, on an Intel
Core i5-9300H with eight logical CPUs and approximately 16 GiB RAM, with the same
original test sources and default worker settings. Two baseline runs use the original global
jsdom setup. Two subsequent runs use the three projects and add the three
environment checks. No tests are skipped, and isolation remains enabled.

PowerShell's `Stopwatch` measures process wall time including pnpm startup.
Environment time is Vitest's accumulated per-file environment setup time across
workers; it is not elapsed wall time. The optional
`scripts/test-timing-reporter.mjs` records that time, setup-file time and the test
inventory. Built-in JSON reports supply the before/after inventory comparison.
Raw logs and reports are under the ignored `test-results/feedback13` directory.

For another measurement, set `TOUCHLINE_TEST_METRICS` to an output JSON path and
run:

```powershell
$env:TOUCHLINE_TEST_METRICS = 'test-results/test-timing.json'
pnpm.cmd test --reporter=default --reporter=./scripts/test-timing-reporter.mjs
Remove-Item Env:TOUCHLINE_TEST_METRICS
```

## Results

Measured on 2026-10-24. Every run passed without unhandled errors.

| Configuration        | Run | Process wall time | Aggregate environment time |
| -------------------- | --- | ----------------- | -------------------------- |
| Original jsdom setup | 1   | 127.89 s          | 202.45 s                   |
| Original jsdom setup | 2   | 140.82 s          | 230.07 s                   |
| Three projects       | 1   | 119.43 s          | 96.84 s                    |
| Three projects       | 2   | 115.40 s          | 91.93 s                    |

The first baseline's environment total comes from Vitest's default summary; the
other runs also record exact totals with the optional reporter. Setup-file time
was 74.98 s in baseline run 2 and 33.90/31.77 s in the split runs.

These are sequential measurements on a shared development machine, with warm
caches retained. Routine editing/typechecking overlapped parts of the baseline
runs. Project assignment also changes scheduling. The observed reduction in
environment setup is consistent with creating jsdom for 28 files instead of 63.
The large career rollback/reset tests still dominate elapsed time, so these
measurements do not establish a general wall-time speedup.

Both baseline runs executed 63 files and 882 tests. Both split runs executed
66 unique files and 885 tests, divided as follows:

| Project | Files | Tests |
| ------- | ----- | ----- |
| domain  | 17    | 407   |
| storage | 21    | 228   |
| ui      | 28    | 250   |

The JSON inventories were compared by normalized file path and the sorted
multiset of full test names. Every original file and test is present unchanged;
no file ran in more than one project. The only additions are the three
environment checks. Neither test names nor assertions in existing suites changed.

Validation passed: two complete `pnpm test` runs with the split configuration,
the focused environment/persistence/adapter checks, `pnpm typecheck`, `pnpm lint`,
Prettier checks on changed files and `git diff --check`.
