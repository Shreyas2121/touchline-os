# Feedback 08: internal campaign reads

Addresses F05 in `feedback.md`, based on `49a80c72e172f2423bc74947628d7065833d4a2a` (step 07).

`Store::read_campaign` returns typed, validated tables from one SQLite read transaction. Market, matchday, progression, and settlement reads use it without export identities, timestamps, or a JSON byte round trip. Snapshot decoding shares domain validation with internal reads; store relationship validation remains authoritative.

Post-command validation stays inside the existing immediate transaction, before any diff writes. It validates the typed domain state, JSON depth/string/null rules, relationships, and logical identities. A streaming byte counter explicitly retains the previous 32 MiB compact-envelope budget, including the same command metadata, without allocating an encoded snapshot or decoding it again. Import/export formats, SQL schema, revision guards, replay behavior, and transaction rechecks remain unchanged. Internal reads do not enforce a transport byte limit; writes and exports still do.

Regression coverage includes invalid persisted references, internal/export/import table parity, invalid domain values, null attributes, duplicate identities, committed WAL reads, exact UTF-8 budget boundaries, and an otherwise valid oversized internal state refused by mutation/export budget validation. Existing persistence tests retain conflict/replay/rollback coverage.

## Performance method

Generate the reusable complete-season export using the existing certification test (PowerShell, from `src-tauri`):

```powershell
$env:TOUCHLINE_SEASON_BENCHMARK_SAVE = 'F:\Shreyas\football-sim\test-results\store-08-season.json'
cargo test -p game-app --locked --test full_season -- --nocapture
```

Run the identical `internal_reads_benchmark.rs` test against the step 07 revision and this implementation. It imports the same 1,224-match complete-season export into a fresh SQLite database for each repetition. Import, export verification, parsing the source file, and database setup are outside the timed sections. It measures the public `preview_time` service followed by an actual campaign rename (campaign and audit writes, revision increment); six repetitions per implementation, with repetition zero treated as warm-up. Both implementations use Rust 1.99.0, `x86_64-pc-windows-msvc`, the unoptimized test profile with debug information, on the same Windows host. No release-profile or native WebView claim is made.

```powershell
cargo test -p game-app --locked --test internal_reads_benchmark -- --ignored --nocapture
```

Use separate target directories when rebuilding both revisions to avoid Cargo artifact collisions between worktrees. The measurements describe whole service calls; further scoped queries and incremental validation remain outside this change.

## Recorded results (2026-10-24)

Both versions used the same 29,492,271-byte export with 1,224 matches and 33,369 appearances. SHA-256: `c34ca5a1ce37fbef3d3ea119f6e3c587f3220a3cdf880a0fceb7fe3413358222`. Benchmark runs were sequential, after the correctness suites finished. The baseline was built from step 07, with only the benchmark test copied into its temporary checkout; its executable was retained separately before rebuilding the changed code.

All times below are milliseconds. Repetition zero is warm-up and excluded from the summary.

| Repetition | Previous preview | Refactored preview | Previous rename | Refactored rename |
| ---------- | ---------------- | ------------------ | --------------- | ----------------- |
| 0 (warm-up) | 9040.051 | 4243.287 | 11850.537 | 8946.093 |
| 1 | 9696.275 | 4740.854 | 13173.721 | 8848.415 |
| 2 | 11524.170 | 4535.115 | 18860.130 | 8714.055 |
| 3 | 14023.349 | 4451.081 | 16397.556 | 8320.766 |
| 4 | 12380.282 | 4723.429 | 16302.470 | 8762.535 |
| 5 | 11533.795 | 4453.086 | 16444.107 | 8064.519 |
| Median (1-5) | 11533.795 | 4535.115 | 16397.556 | 8714.055 |
| Range (1-5) | 9696.275-14023.349 | 4451.081-4740.854 | 13173.721-18860.130 | 8064.519-8848.415 |

Observed median reductions were about 61% for preview and 47% for rename. These are single-host, sequential debug-build observations with substantial baseline variation, not a production latency guarantee. Both benchmark invocations passed. Total test runtimes (including untimed import/export/setup) were 310.41s before and 203.16s after; these totals are not the timed service-call comparison. Local logs and the reusable save remain under ignored `test-results/store-08-*` paths.

## Validation

- `cargo test -p game-store --locked`: passed, 30 active tests; existing manual statement benchmark ignored.
- `cargo test -p game-app --locked`: passed, 33 tests. Full-season certification passed in 901.96s and retained the 32 MiB export check; market certification passed in 469.71s. A focused management rerun after the final creation-validation cleanup also passed all eight tests.
- `cargo test -p game-core --locked`: passed, including boundary, snapshot fixture, and generated binding tests.
- Manual `internal_reads_benchmark` test: passed on both revisions, six repetitions each.
- `cargo clippy -p game-store -p game-app -p game-core --all-targets --locked -- -D warnings`: passed.
- `cargo fmt --all --check`: passed.
- `node scripts/native-bindings.mjs --check`: passed.
- `git diff --check`: passed.

No frontend, IPC command, schema, or save-format changes were made. The desktop WebView was not launched; these checks certify the Rust service/store paths, not native UI runtime behavior. Further query scoping, incremental validation, release-profile measurements, and allocation profiling remain outside this step.
