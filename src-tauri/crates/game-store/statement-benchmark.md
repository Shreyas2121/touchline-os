# SQLite changed-row writer comparison

Measured on Windows on 2026-10-24 for feedback item 07 (F06). The baseline
used the writer from `87a126dff9a099408cd29acd64d32fa0bba23908` with the
same ignored benchmark added before changing the implementation.

Run from `src-tauri`:

```text
cargo test -p game-store --lib changed_row_benchmark --locked -- --ignored --nocapture
```

Both runs used the default unoptimized Rust test profile, bundled SQLite,
an in-memory database with foreign keys enabled and the current migrations,
and the standalone fixture expanded to 500 players. Each sample timed 100
transactional pairs of forward/reverse diffs. Only player names changed;
each pair restored the starting state. Setup, compilation, snapshot validation,
JSON transport, the connection worker, and disk durability were outside the
timed region. Five consecutive samples ran per changed-row count, on the same
connection. Statement caches remained enabled with their default capacity.

Times below are milliseconds for all 100 pairs, not per command:

| Changed players | Baseline samples                                      | Refactored samples                               | Baseline median | Refactored median |
| --------------- | ----------------------------------------------------- | ------------------------------------------------ | --------------- | ----------------- |
| 0               | 632.948, 608.573, 575.392, 633.225, 1861.109          | 770.062, 951.104, 1017.976, 862.356, 937.457     | 632.948         | 937.457           |
| 1               | 1203.340, 621.174, 617.383, 784.014, 797.974          | 691.961, 689.998, 1078.112, 866.411, 952.385     | 784.014         | 866.411           |
| 50              | 4321.883, 4184.550, 4249.039, 4377.754, 4973.107      | 2119.518, 2209.210, 1756.346, 2011.142, 2081.706 | 4321.883        | 2081.706          |
| 500             | 40878.071, 44149.178, 33177.246, 35985.169, 33603.094 | 8694.764, 7250.623, 7241.399, 7181.689, 7943.755 | 35985.169       | 7250.623          |

The batched update cases benefited from constructing and preparing each SQL
statement once per table operation. No improvement was observed for zero or
one changed row. Background development checks overlapped portions of these
runs, and sample variation is substantial; these results do not establish
production latency or a reliable small-edit regression/improvement. Further
performance work should use controlled production-profile measurements.

Behavior is covered separately: a trigger-based test verifies unchanged rows
produce no writes, mixed inserts/updates affect only the intended players,
and reverse diffs delete added rows and restore the full snapshot. Codec and
read-path tests cover null, text, booleans, safe integers, JSON, and malformed
values. `cargo test -p game-store --locked` passed 5 unit and 21 persistence
tests (the manual benchmark is ignored by default); the benchmark also passed
when run explicitly. Store Clippy with warnings denied and workspace Rust
format checks passed. Migrations and snapshot formats are unchanged.
