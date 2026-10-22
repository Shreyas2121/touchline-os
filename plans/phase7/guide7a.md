# P07-G07a — Remove non-standalone compatibility

## 1. Context and authority

Master 3.0.4 / DEC-006 → [Phase 7](../phase7.md) → this guide. Predecessor: completed P07-G06 `3b190ba255ae8a56670c571b10bf235119fe4211`, after NM-G09 `93e4ad192010bd660d5d0388e7b60bc7404c1d83`.

Commit: `refactor(p07-g07a): remove non-standalone compatibility`.

This is a new cleanup prerequisite before pending P07-G07 certification. Completed bridge/G06 evidence remains historical; it does not require retaining compatibility.

## 2. Goal and user-observable result

Build the native product as if standalone were its only campaign model. Challenge/Sandbox remain rule choices; fictional/imported remain dataset kinds. No manual mode, old-save workspace, generator/demo or compatibility workflow remains.

## 3. Preconditions

Read master, DEC-006 and Phase 7. Inspect git status and preserve unrelated work, completed guides, history and actual user files. Guide 7 certification work may be uncommitted; keep it separate from this cleanup commit. Verify both predecessor SHAs are ancestors. No previous JavaScript output compatibility, old/manual save preservation, E2E or manual sign-off is required.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/{enums,management,generation,snapshot,guards,progression,rows,queries}.rs` and exported bindings.
- `src-tauri/crates/game-store/src/{lib,mapping,mutations,queries,snapshots}.rs`, migrations and real-file tests.
- `src-tauri/crates/game-app/src/`, tests and Tauri command registration.
- `src/platform/{game-client,native-client,operations}.ts`, generated DTOs and native UI/forms.
- Native UI tests, browser bootstrap separation, crate READMEs and completed bridge records.

## 5. Files to create/modify

- Native models, validation, storage/import/backup and command contracts that still represent manual campaigns.
- Native UI, generated bindings and tests affected by removal.
- Standalone fixtures/helpers replacing old-mode compatibility inputs in native suites.
- Crate/product documentation and Phase 7 progress evidence.

No new gameplay phase or dependency is required. Archived browser code/fixtures may remain historical references; they must not require a production compatibility path or ship as a second supported product.

## 6. Implementation steps

1. Remove non-standalone campaign variants, manual creation/demo identities, old player/club editing variants and compatibility-only operation APIs. Use a standalone-only model rather than retaining manual variants merely to return a special read-only result. Regenerate DTOs.
2. Remove the unused manual generator, input/output types and version-1 generation tests. Retain the supported standalone generator/version and its legality, reproducibility and full-world tests; version labels need no cosmetic renumbering.
3. Remove browser-v1 normalization, manual-save import/export/inspection and historical read-only UI branches. Validate only explicitly supported standalone snapshots. Missing required mode/clock/identity fields and unsupported formats are errors, never automatic conversion or invented state.
4. Remove compatibility-only persistence/schema fields or tables where they have no standalone use. Preserve standalone features and useful general storage contracts. If a native schema/format changes, version it explicitly and reject unsupported existing files without deleting, rewriting, resetting or converting them. No old/manual migration is required.
5. Remove old-mode branches from reads, policy/management, progression, backup validation and demo reset. Keep active-season/scope/revision/Challenge guards, atomic receipts and one allocation per supported initialization.
6. Keep normal desktop routing and bundles off the browser database and old gameplay engine. Historical source can remain outside the supported product, with no dual writes or fallback. Remove obsolete GameClient methods and retired forms rather than preserving an old-client API.
7. Replace compatibility availability/preservation tests alongside the implementation. Use standalone fixtures and independent campaign identities for rollback, isolation, snapshot/backup and reset coverage. Rejection tests may use malformed/unknown mode strings without introducing an old campaign model into production.
8. Verify existing standalone creation, permitted management, July→deadline→kickoff, same-file retry, receipt replay, collision/fault rollback and store reopen remain correct. Do not weaken rules to retain an obsolete fixture.
9. Record actual checks and changed supported formats/schema. Hand off to P07-G07 only after this cleanup is committed; do not certify Phase 7 or implement Phase 8 here.

## 7. Tests to add/change

- Standalone-only DTO/import validation and rejection of unknown modes/formats without partial writes.
- Native UI exposes only standalone careers, rules choices and the single standalone demo; no historical workspace or editor branches.
- Legal deterministic worlds, Challenge/Sandbox enforcement and no extra allocation after board edits.
- Standalone campaign isolation, demo-reset isolation, export/import/backup/reopen and preserved current clock/receipts.
- Existing concurrency, stale-input, transaction-fault and kickoff-stop properties using supported standalone inputs.

Remove obsolete preservation tests; do not replace every deleted implementation branch with a test that mirrors its code. Keep meaningful invariant and integration coverage.

## 8. Verification commands

Run focused changed tests first, regenerate bindings, then:

```bash
pnpm native:bindings
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
pnpm tauri build
```

Use temporary real SQLite/filesystem paths for native integration tests. Unit/integration tests and code/build checks suffice under DEC-005; desktop/browser E2E, manual testing and user sign-off are not gates.

## 9. Acceptance coverage

The supported native model and UI contain standalone careers only. Supported snapshot/backup and progression integration tests pass. Unsupported input refuses safely; old-save handling is absent rather than a historical read-only feature. Actual user files are untouched.

## 10. Definition of done

- [x] Non-standalone model, generator/demo, compatibility normalization, wire APIs and UI branches removed.
- [x] No required old-save import, inspection, export/backup or preservation path remains.
- [x] Supported standalone contracts/bindings, storage and tests agree.
- [x] Creation, management, progression, receipts, rollback and reset isolation pass.
- [x] Normal artifact builds; no new gameplay or false verification claim.
- [x] Actual checks/SHA recorded; P07-G07 is next.

## 11. Commit instructions

Stage this cleanup's implementation/tests/docs only. Preserve incomplete G07 certification work separately. Commit with the prescribed subject after required checks pass; record the actual SHA in Phase 7 evidence. Do not rewrite completed guide files or progress rows.

## 12. Handoff

[P07-G07](guide7.md) certifies the standalone foundation after this cleanup. Then generate Phase 8 and all its guides from master 3.0.4 / DEC-006 before implementing fixtures, results or simulation.

Completed 2026-10-22. Actual checks, supported schema/format changes, exclusions and commit evidence are recorded in Phase 7. P07-G07 certification is next.
