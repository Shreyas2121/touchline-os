# Native season verification

Measured on the local Windows/MSVC workspace on 2026-10-25. No production engine, schema, persistence validation, or database durability settings changed.

## Full-season measurements

| Run                              | Test-body runtime | Matches | Appearances |   Desktop export |
| -------------------------------- | ----------------: | ------: | ----------: | ---------------: |
| Unchanged test, release baseline |           148.54s |   1,224 |      33,369 | 29,494,201 bytes |
| Optimized test, release          |           119.09s |   1,224 |      33,369 | 29,494,201 bytes |

This single before/after comparison reduces test-body runtime by about 20%; it is not a statistical benchmark. Compilation is excluded (51.70s for the baseline rebuild, 10.15s for the modified test). Cargo's harness reported 148.77s and 119.31s respectively. The [historical Phase 8 run](../../plans/phase8.md#progress-log) recorded 962.68s in debug, which explains why routine debug verification should not replay a whole season.

The test now reads validated domain tables at checkpoints instead of constructing and measuring an export envelope repeatedly. It checks the market during January rounds, retaining both winter blockers and the assertions that market writes preserve earlier matches. Every matchday still goes through public preview and commit, including the authoritative market gate. The unchanged-player comparison indexes original players rather than scanning the player list for every row. Per-round output separates market, preview, and commit timings.

Coverage remains: all 34 rounds, every fixture/appearance reconciliation, standings, bans, reopen after rounds 1 and 34, historical retry, unrelated-row comparisons, review refusal, exact desktop export/reimport, the 32 MiB ceiling, and another campaign's isolation. The final desktop export is still generated and parsed through the production path.

## Commands and scope

- `pnpm native:check`: formatting, locked workspace Clippy, and routine workspace unit/integration tests. The full-season and winter-market certifications are explicitly ignored, with their invocation in the ignore reasons.
- `pnpm native:test:season`: both certifications, sequentially, in release mode with progress visible. The ignored save-file benchmark is excluded.
- `pnpm native:check:full`: routine checks followed by both optimized certifications.

Use season certification for changes to match/selection rules, calendar/progression, market/transfers, shared ability/generation, SQLite writes/schema, or snapshot/export/import. Pure development/roster planners, frontend, copy, and documentation do not need another season replay unless they also affect those paths. Phase 10 G04–G06 includes season certification where persisted settlement/progression changes.

The Windows CI job checks the whole PR or push diff and adds the optimized gate for relevant sources, manifests/toolchain, persistence/schema, certification tests, and runner/workflow changes. Initial pushes with no base and manual CI runs include it conservatively. A failed diff fails the job rather than silently skipping certification. Twenty-one local path-selection cases cover required and excluded changes. Add new modules to the workflow filter when extending season certification into them.

## Validation

- `pnpm native:check` passed: formatting, workspace Clippy with `-D warnings`, all routine workspace tests, and doctests. Total wall time was 292.72s including a rebuild and overlap with the end of winter certification; this is not an isolated performance benchmark. Both season tests were reported ignored with the explicit invocation.
- `pnpm native:test:season` passed both exact tests. The full-season body took 119.09s; the winter-market body took 115.68s and exported 20,932,688 bytes. The full-season assertions retained the baseline's fixture/appearance counts and export size.
- `pnpm lint`, `pnpm format:check`, Node syntax checks for both runners, and staged whitespace checks passed.
- The CI scope expression passed 21 local required/excluded path cases. GitHub-hosted execution itself was not run locally.
