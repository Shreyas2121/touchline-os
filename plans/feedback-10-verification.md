# Feedback 10: split native market operations

Addresses the Rust portion of F10 in `feedback.md`. The public `game_core::market_ops` module remains the facade; its 21 exported functions and DTO types retain their original names and signatures.

The original module combined transport records, market planning, replay fingerprint construction, authoritative writes, and read projections. Those responsibilities now live in private modules:

| Module | Responsibility |
| ------ | -------------- |
| `market_ops/types.rs` | Request, command, preview, and transfer-board DTOs |
| `market_ops/context.rs` | Validated campaign/season/clock lookup, identity lookup, numeric conversion, and existing guards |
| `market_ops/planning.rs` | Read-only inputs, scratch-state expiry, ordered proposal slots, and tick seeds |
| `market_ops/fingerprints.rs` | Canonical fingerprint tuples and replay reconstruction of stored proposal identities |
| `market_ops/window.rs` | Compulsory-offer qualification, closing blockers, and expiry |
| `market_ops/projections.rs` | Market preview and transfer-board projection |
| `market_ops/commands/mod.rs` | Dispatch, replay/fresh-ID helpers, receipt/audit finalization, and window closing |
| `market_ops/commands/run.rs` | Tick execution from the existing ordered plan |
| `market_ops/commands/approaches.rs` | Managed-club proposals, negotiation responses, offer rejection, and settlement-request mapping |

Imports are explicit. Helpers and slot fields needed across modules use visibility restricted to the containing market module; command-handler helpers remain restricted to the command module. No generic command framework, shared CRUD abstraction, new dependency, algorithm, or save-format change was introduced.

## Preservation checks

A one-off comparison against the original source verifies all 46 function bodies byte-for-byte after normalizing line endings, all public DTO definitions including their serde/TS attributes, all slot field definitions except visibility, and the complete 21-item public export inventory. The local original source and comparison script are retained under ignored `test-results/store-10/` (`verify-move.cjs`). Function bodies retain the same RNG calls, collection iteration/sorts, fingerprint tuples, operation keys, arithmetic, and error construction.

The existing architectural boundary test now includes every newly nested source file. General recursive source discovery remains part of step 12; this extraction does not remove any previously scanned code from coverage.

## Verification commands

From `src-tauri`:

```powershell
cargo test -p game-core --locked
cargo test -p game-app --release --locked --test market_window --test market_certification --test settlement --test full_season -- --nocapture
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
```

The long app certifications use the optimized release test profile, Rust 1.99.0 on `x86_64-pc-windows-msvc`. `TEMP` and `TMP` are set for the test process to a freshly created directory under `test-results/store-10/`. The first attempt stopped before gameplay because an existing default temporary directory collided with the test's reused process ID; it did not report a gameplay assertion failure. The rerun uses the fresh directory without deleting existing temporary data.

From the repository root:

```powershell
node scripts/native-bindings.mjs --check
node test-results/store-10/verify-move.cjs
git diff --check
```

Core tests passed (75 tests, including 14 market tests), workspace Clippy passed with warnings denied, formatting passed, and native binding byte checks passed. The comparison script confirms the moved bodies and public contracts are unchanged.

## Final results

All nine selected app tests passed in the release profile:

- Full-season certification: 1 test, 128.04s, including reconciliation, reopening, replay, import/export parity, and the 32 MiB export budget.
- Market certification: 4 tests, 86.58s, including summer and winter windows, compulsory offers, reservations, and isolation.
- Market-window regressions: 3 tests, 3.34s, including proposal replay, withdrawal, rollback, and compulsory-offer blocking.
- Settlement: 1 test, 3.26s, including exactly-once movement and progression beyond July.

The completed-season artifact was captured with the existing `TOUCHLINE_SEASON_BENCHMARK_SAVE` test option as `test-results/store-10-season.json`. A direct byte comparison against the retained pre-refactor step-08 save (`test-results/store-08-season.json`) passed: both contain 1,224 matches and 33,369 appearances in 29,492,271 bytes. Both have SHA-256 `c34ca5a1ce37fbef3d3ea119f6e3c587f3220a3cdf880a0fceb7fe3413358222`. This includes unchanged stored market fingerprints and collection ordering across the complete certified season, in addition to the source-body comparison and existing behavior tests.

`git diff --check` passed. No desktop UI was launched; this verification covers Rust core/app/store behavior and generated contracts. The full Rust workspace test suite was not rerun; the full core suite and the app certifications listed above were run for this step. Existing step-08 and step-09 working-tree changes were preserved.
