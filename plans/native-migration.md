# Native migration bridge — port the existing G05 application

> **Authority:** `MASTER_PLAN.md` 3.0.1 / DEC-002 / DEC-003
> **Placement:** after completed P07-G05, before P07-G06
> **Status:** NM-G01 through NM-G05 complete; NM-G06 through NM-G09 pending. Gate not passed.
> **Next execution:** [NM-G06](native-migration/guide6.md)
> **Exit:** existing features work natively; Continue still belongs to resumed P07-G06

## 1. Parent plan contract

Master §§0, 2, 4.4–4.6, 8, 9 and 12 define the native architecture, source-save contract, native correctness, execution gate and verification. This bridge is an explicit prerequisite stage, not a renumbered gameplay phase. DEC-003 removes previous-logic compatibility as a requirement for remaining guides; old parity wording below is superseded where it conflicts. Existing save-data preservation and completed history remain required.

`P07-G01–G05` and their evidence remain unchanged. Preserve the original browser implementation and saved data as the migration source/oracle. Resume G06 only after NM-G09 is committed with passing bridge evidence.

| Guide    | Deliverable                                       | Commit subject                                                   |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `NM-G01` | Browser migration export and golden fixtures      | `feat(nm-g01): capture browser saves and compatibility fixtures` |
| `NM-G02` | Tauri workspace, DTOs and GameClient              | `feat(nm-g02): establish the native application boundary`        |
| `NM-G03` | SQLite persistence, import and consistent backups | `feat(nm-g03): persist migrated campaigns in sqlite`             |
| `NM-G04` | Rust policies, money, selection and calendar      | `feat(nm-g04): port foundational rules to rust`                  |
| `NM-G05` | Rust generators and career preparation            | `feat(nm-g05): reproduce seeded worlds in rust`                  |
| `NM-G06` | Native read API, save migration UI and loaders    | `feat(nm-g06): read campaigns through native services`           |
| `NM-G07` | Native campaign/squad/tactics/board writes        | `feat(nm-g07): execute career management in rust`                |
| `NM-G08` | Native legacy match/finance/market parity         | `feat(nm-g08): preserve legacy workflows on sqlite`              |
| `NM-G09` | Native cutover and compatibility certification    | `test(nm-g09): certify the native migration bridge`              |

All nine guide files exist before implementation. One guide = one logical commit; document a split before coding if a port grows too large.

## 2. Objective and user-visible outcome

Move the currently working G05 application to a Tauri desktop shell with Rust-owned logic and SQLite, preserving existing features and saves.

At exit a user can export from the original browser origin, import into desktop, open/read/edit existing supported workflows, create a seeded native career, close/relaunch, export a native snapshot and create/reopen a consistent backup.

A standalone career remains on July 1. The bridge does not add Continue, fixtures, AI bids, progression effects, growth or rollover. Those new features must not conceal missing migration work.

## 3. Prerequisites

Checkpoint: `df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3` (P07-G05), followed by evidence commit `7b3c6a0`.

```bash
git status --short
git log -8 --oneline
git merge-base --is-ancestor df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3 HEAD
```

Inspect current schemas/models, every `src/data/commands/**` write, scoped repositories, revisions/receipts, native target docs and all relevant tests. Source DB is IndexedDB v2 with 23 game stores; v1 is an older supported migration fixture.

NM-G01 uses existing Node/pnpm tooling. NM-G02 checks Rust/MSVC/Windows SDK/WebView2 prerequisites and introduces verified compatible Tauri/Rust versions, generated bindings and native scripts. No native tool is assumed installed by this document.

Historical G05 evidence is 49 files / 665 tests plus 6 browser tests, frontend lint/types/build. This bridge has no runtime evidence yet.

## 4. Scope

In scope: browser snapshots/vectors, Tauri shell, GameClient, Rust workspace, SQLite/import/backup, current domain/generation parity, current native query/write workflows and cutover tests.

Deferred: new game-clock advancement (P07-G06), foundation progression certification (P07-G07), matches (Phase 8), AI market (9), player/season lifecycle (10), analytics (11), general datasets/remapped restore (12), full platform/signing/updater/release work (13), PWA/WASM edition.

No browser DB wipe, Dexie v3, automatic native access to Chrome's storage, dual writes, raw frontend SQL or gameplay rebalance.

## 5. Architecture and contracts

### 5.1 Crates and UI boundary

```text
React → GameClient → typed invoke → Tauri adapter → game-app
                                                    ├─ game-core
                                                    └─ game-store → SQLite
```

- `game-core`: models, validation, policies, money, selection, dates, generation. No Tauri/SQL/filesystem/ambient clocks or random sources.
- `game-store`: normalized SQLite entities, scoped queries, FK/unique constraints, transactional migrations/import/backup. May use shared core models.
- `game-app`: use cases, authoritative previews, revisions, command guards and transaction orchestration.
- `src-tauri/src`: thin shell, typed commands, app paths, injected IDs/audit time, native dialogs/progress.
- `src/platform`: GameClient, native adapter, generated Rust DTOs; browser adapter only for frozen migration/compatibility.
- No desktop feature imports concrete Dexie repositories after cutover. Unsupported native services report unavailable, never fall back to browser writes.

Use serde/serde_json, ts-rs and rusqlite with bundled SQLite/backup support. Pin verified versions in NM-G02/NM-G03, not speculative version numbers in docs. NM-G02 pins Rust 1.99.0 for x86_64-pc-windows-msvc, Tauri 2.12.4, tauri-build 2.7.3, @tauri-apps/api 2.12.4, @tauri-apps/cli 2.12.3, ts-rs 12.0.1, serde 1.0.229 and serde_json 1.0.154. rusqlite waits for NM-G03.

### 5.2 Snapshot envelope and source preservation

Format version 1 uses:

```ts
{
  format: 'touchline-campaign',
  formatVersion: 1,
  sourceStorage: 'indexeddb' | 'sqlite',
  sourceSchemaVersion: number,
  exportId: string,
  exportedAt: string,
  campaignRevision: number,
  tables: { /* explicit arrays for all 23 current game stores */ }
}
```

Supported pairs initially: indexeddb 1/2; sqlite 1 after NM-G03. Export reads one campaign in a consistent readonly transaction. Preserve null/optional fields, IDs, revisions, modes, values, logical keys, seeds, receipt fingerprints and audits. Do not log export as a gameplay mutation.

All 23 store arrays are present:

```text
campaigns, seasons, leagues, clubs, players, contracts, constitutions,
ledgerEntries, transfers, offers, lineups, registrations, matchRecords,
appearances, shortlistItems, scoutingReports, developmentPlans, auditEvents,
importReceipts, simulationStates, clubSimulationStates, playerSimulationStates,
simulationReceipts
```

Source v1 normalization only adds missing legacy/sandbox mode metadata and empty simulation arrays. Never invent contracts/wages/matches or promote a legacy save. Exclude unrelated and campaign-null global ImportReceipt rows.

Capture the source revision with the rows. Export using the original browser origin; a changed hostname/port/profile may expose a different empty IndexedDB. Source data is never deleted by desktop import.

### 5.3 SQLite storage and import

- SQLite starts schema version 1 independently of Dexie source versions.
- Use typed IDs/money/dates/status/indexed fields and JSON only for appropriate nested values. No opaque whole-campaign blob.
- Preserve valid incomplete legacy records; impose standalone completeness only on standalone data.
- Enable scoped FK constraints and unique identities, season ordinals/active season, registration, profile keys, gameplay receipts and audits. Handle campaign/season FK cycles with tested ordering/deferred constraints.
- One dedicated worker owns the connection; CPU calculations and file parsing happen outside short write transactions.
- Import validates shape/limits/safe integers/versions/modes/IDs/references before one atomic insertion. Migration does not regenerate, increment gameplay revision or add a gameplay audit.
- A separate transport import receipt records actual source-byte SHA-256 and outcomes. Same-file retry returns prior outcome even after later play; it never restores old rows again.
- Different-content campaign-ID collision is refused. Overwrite and restore-as-new/remapping are Phase 12 work.
- Source-file digest identifies a retry; it is not an authenticity signature.
- Store under `appLocalDataDir()/touchline.sqlite3` with stable bundle identity and separate dev/test paths. Never place mutable DB in install assets.
- Use SQLite online backup support, validate/reopen a separate snapshot and preserve the prior good backup on failure. Native snapshot export uses the same envelope with sqlite origin.

### 5.4 Native core correctness (DEC-003)

Implement the intended native rules using TypeScript as reference material:

- Use explicit deterministic PRNGs, ordered stream namespaces and versioned fingerprints. Unicode and stream independence are tested; equality with previous JavaScript draws or worlds is optional.
- Historical golden fixtures remain unchanged reference data. New tests validate native money, dates, rules, selection, worlds and initialization independently.
- Rust i64 arithmetic is checked; IPC/JSON numbers stay within JS safe integers. Preserve zero vs null vs absent fields.
- Keep the intended Balanced/Strict product rules, meaningful verdicts/remedies, Challenge guards and mode semantics; previous implementation details and wording are not binding.
- Import saved rows directly. New native generation must be legal and reproducible, without matching old generator data or digests.
- Correct previous logic where appropriate, document native decisions and test their invariants. Do not regenerate historical fixtures to conceal a change.

### 5.5 APIs, reads and writes

GameClient exposes bounded per-screen queries, authoritative Rust previews and explicit commands. serde DTOs generate TS through ts-rs; Rust runtime validation remains mandatory. Structured native errors map to current user-visible error/result behavior.

NM-G06 replaces UI repository access, using unavailable states for writes not yet ported. NM-G07 ports campaign/squad/tactics/registration/board/shortlist writes. NM-G08 ports legacy match/offer/transfer/contract/ledger workflows. By cutover all previously usable operations are supported natively.

Commands keep one audit/revision per new business action; rejections have no side effects. Logical retry receipts return persisted outcomes without fictitious revisions. Preserve separate legacy/standalone demos, reset/delete scope, Sandbox allocation rules and fixed standalone managed club. Existing legacy offers are compatibility behavior, not autonomous Phase 9 AI.

### 5.6 Gate before P07-G06

NM-G09 must prove:

- actual browser legacy/standalone import and no source changes;
- legal deterministic native fresh careers and intended reads/writes;
- direct Rust scope/Challenge/standalone guard enforcement;
- transactional rollback, collision/retry handling, backup and app restart;
- real SQLite/native tests and generated-contract freshness;
- no Dexie fallback, production test instrumentation or fake completed features.

The app is still at the G05 feature level. P07-G06 then adds Rust Continue; bridge completion does not authorize jumping directly to Phase 8.

## 6. Dependency graph

```text
P07-G05 complete
 → NM-G01 export/vectors
 → NM-G02 shell/API
 → NM-G03 SQLite/import/backup
 → NM-G04 rules/calendar
 → NM-G05 generators/preparation
 → NM-G06 native reads/import UI
 → NM-G07 management writes
 → NM-G08 legacy writes
 → NM-G09 cutover certification
 → P07-G06 native Continue
 → P07-G07 foundation certification
 → Phase 8
```

The original pending web G06/G07 are superseded; active guides retain their original outcome but gain native prerequisites. Archives are not executable.

## 7. Acceptance criteria

1. Completed P07-G01–G05 files and SHA/evidence records are unchanged.
2. Complete consistent exports preserve source state and original origin data.
3. Actual source v1/v2 and native snapshot fixtures validate/import without invented data.
4. Invalid/colliding imports roll back; repeated file cannot overwrite later play.
5. SQLite constraints, schema upgrades, deletion scope and backups are proven with real files.
6. Rust passes deterministic PRNG/Unicode/fingerprint, valid date, checked money and policy tests. Old TypeScript equality is optional reference evidence.
7. Native creation produces a legal reproducible 72-club/3,000-player world and one opening allocation.
8. Every current feature uses typed native services, with mode/Challenge guards at direct calls.
9. Native save/read/write survives close/relaunch; browser/other campaigns stay isolated.
10. Desktop has no raw SQL command or Dexie fallback.
11. Existing frontend tests and actual Cargo/native tests are distinguished and pass.
12. July 1 remains unchanged during this bridge: no Continue or later gameplay implemented.
13. NM-G09 evidence explicitly releases the gate for P07-G06.

## 8. Verification

Before NM-G02, use existing commands; add focused export/vector checks in NM-G01:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

NM-G02 introduces:

```bash
pnpm native:bindings
pnpm native:bindings:check
pnpm native:check
pnpm tauri dev
pnpm tauri build
```

native:check runs locked workspace rustfmt/clippy/tests; binding check compares temporary generated output without silently editing tracked files. native build is separate from frontend build.

NM-G09 adds `pnpm test:desktop` against a dedicated native test binary, using test-only automation excluded from normal release artifacts. Also manually smoke the normal packaged app. Browser/mocked tests do not certify Rust/SQLite.

Final journey: original-origin export → native import legacy/standalone → inspect counts/nulls/balances → reimport harmlessly → create fixed-seed native career → edit existing workflows → close/relaunch → verify Challenge rejection → export/backup/reopen → confirm no clock progression → record gate evidence.

## 9. Risks and rollback

Preserve source browser DB and export until native verification. Use compatible forward fixes and known-good native snapshots; do not wipe or downgrade a live DB.

Main risks: origin mismatch, changed Unicode/seed algorithm, unsafe i64/JS transport, FK cycles, hidden browser writes, lost revision/audit semantics, UI blocking, duplicate import rollback of newer state and incomplete legacy port. Each has a dedicated fixture/direct-call/native test gate above.

## 10. Exit and handoff

- [ ] NM-G01–NM-G09 committed in order with actual check evidence.
- [ ] Current G05 capabilities all work on Rust/SQLite.
- [ ] Import/export/backup and native close/relaunch pass.
- [ ] Native core/generator correctness, reproducibility and direct-call guards pass.
- [ ] Source browser data and completed guide history are preserved.
- [ ] No new game progression or match simulation is falsely certified.
- [ ] Resume pointer is P07-G06, with native APIs/scripts documented.

### Progress log

| Guide    | Commit  | Checks  |
| -------- | ------- | ------- |
| `NM-G01` | `b4e9e0931ca02d7d91928159c32cf3c63b9165a4` | `pnpm lint`, `pnpm typecheck`, `pnpm test` (51 files / 676 passed), `pnpm build` via the e2e server, and `pnpm test:e2e` (7 passed). Export reads one campaign in a readonly transaction, keeps revision and audits unchanged, and rejects malformed, unsafe, and cross-campaign snapshots. Synthetic indexeddb v1/v2 fixtures and TypeScript determinism vectors are committed. Chromium exported a Harbor campaign at `http://127.0.0.1:4173`, reloaded, and left the save in place. No Rust or native check exists yet. |
| `NM-G02` | `7129a083bfa3b9adf5890f569950301cde15fafb` | `pnpm native:bindings:check`, `pnpm native:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (52 files / 681 passed), `pnpm build`, and `pnpm tauri build` (MSI and NSIS). The release shell reports storage and features unavailable and does not offer IndexedDB. The browser exporter at `http://localhost:5173` exported Playable demo and left that save in place. SQLite and gameplay remain later guides. |
| `NM-G03` | `004548f62e1cd608793234c7907ea90ef6f2a2c0` | `cargo test -p game-store --locked` (10 real temporary-file integration tests), `pnpm native:bindings:check`, `pnpm native:check` (rustfmt, locked clippy and 21 Rust tests), `pnpm lint`, `pnpm typecheck`, `pnpm test --maxWorkers=2` (52 files / 681 passed), `pnpm build`, and `pnpm tauri build` (MSI and NSIS). SQLite schema 1 persists all 23 arrays, enforces scoped/deferred foreign keys and source identities, and validates import before one transaction. Source-byte SHA-256 transport receipts make retries harmless after later edits; collisions and injected row/receipt failures leave other saves unchanged. Native export and validated/reopened online backup include WAL state and preserve the previous backup on failure. Stable app-local production/dev/test paths are integrated; native UI services remain unavailable until NM-G06. |
| `NM-G04` | `c457268097bc0f2217b7bf91d99a9a08b1c8f28b` | `cargo test -p game-core --test foundations --locked` (11 native property/integration tests), `pnpm native:bindings:check`, `pnpm native:check` (rustfmt, locked clippy and 32 Rust tests), `pnpm lint`, `pnpm typecheck`, `pnpm test --maxWorkers=2` (52 files / 681 passed), `pnpm build`, and `pnpm tauri build` (MSI and NSIS). Pure Rust money/date/finance/policy/selection/calendar/random/guard APIs are implemented. Native tests validate exact checked integer credits, scoped reversals/wages, policy limits and unknowns, exact qualification ratios, registration quotas, unique bounded selections, leap dates/age provenance, independent deterministic Unicode streams, consumed calendar boundaries and mode/scope/revision guards. DEC-003 / master 3.0.1 records the user's removal of previous-logic compatibility as a requirement. |
| `NM-G05` | IMPLEMENTATION_SHA | `cargo test -p game-core --test generation --locked` (10 native property/integration tests), `pnpm native:bindings:check`, `pnpm native:check` (rustfmt, locked clippy and 42 Rust tests), `pnpm lint`, `pnpm typecheck`, `pnpm test --maxWorkers=2` (52 files / 681 passed), `pnpm build`, and `pnpm tauri build` (MSI and NSIS). Native v1/v2 generators produce reproducible fictional worlds; v2 has 4 leagues, 72 clubs, 2,880 owned players, 120 free agents and 2,880 complete active contracts. Validated career preparation produces one consistent initialization and maps to all 23 saved-row arrays without persistence. DEC-003 governs native correctness rather than previous JavaScript output parity. |
| `NM-G06` | Pending | Not run |
| `NM-G07` | Pending | Not run |
| `NM-G08` | Pending | Not run |
| `NM-G09` | Pending | Not run |

NM-G03 verification used only synthetic committed source fixtures and injected temporary SQLite paths. The schema-0 upgrade fixture is an empty native SQLite file: there is no earlier deployed native schema to migrate. The harness imported and reopened indexeddb 1/2 and native sqlite 1 snapshots, compared all arrays/nullable values, tested concurrent retries and committed read isolation, rejected unsafe/oversized/future/cross-campaign inputs, and reopened consistent backups. Browser migrations, compatibility fixtures and completed P07-G01–G05 files are unchanged. The frontend dependency-boundary assertion now permits the guide's storage dependencies; the first run found that stale assertion, and a later default-concurrency run alongside the release build hit timing failures. The final full suite passed with two workers and unchanged test timeouts. No browser flow changed, so browser E2E was not repeated. Packaged-app interaction, native import/read UI and final release certification remain later bridge work; no Continue or new gameplay is implemented.

NM-G04 follows DEC-003 rather than an old-output parity gate. Percentage credits use exact checked integer flooring; wage-change previews replace a known previous commitment and show unknown projected wages when that input is missing. Synthetic saved rows supply test inputs, without new JavaScript golden captures or any old-logic equality requirement. No new dependency or lockfile change was needed. All core modules are checked against storage/platform/network/ambient-time/randomness dependencies. The store, shell, app services, existing source fixtures, browser domain and completed guides remain unchanged by this implementation. Calendar APIs only preview values; no storage writes, clock-advance handler, native gameplay UI or later-phase feature was added. Existing browser flows were untouched, so E2E was not repeated. NM-G05 can now build valid deterministic native worlds; the bridge gate remains pending through NM-G09.

NM-G05 verifies complete attribute/ability/potential/value/wage formulas, finite budgets, goalkeeper profiles, homegrown quotas and feasible senior registrations under Balanced and Strict. Every club supports all four formations with an XI and seven-player bench. Unicode seeds repeat exactly; campaign IDs and injected audit time do not choose football content, and explicit years choose dates. Tests reject unsupported versions, malformed settings/worlds, unsafe values, underfunded squads, foreign references, ID collisions and inconsistent initialization records. Preparation returns a revision-0 campaign with one season, July 1 clock, constitution, opening allocation, receipt and audit; it performs no writes. Core API and formula details are documented in the crate README. No dependencies, lockfiles, source fixtures, browser flows, storage paths or completed Phase 7 guides changed, so browser E2E was not repeated. Frontend tests finished before release packaging to avoid resource contention. Native read/import UI is next in NM-G06; atomic career creation remains NM-G07. No Continue, match simulation or packaged-app interaction is certified here.

**Gate status: NOT PASSED.** This planning amendment does not complete the bridge. NM-G09 records the final SHA/checks; only then execute [P07-G06](phase7/guide6.md).
