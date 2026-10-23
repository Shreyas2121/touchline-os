# Phase 7 — Native standalone foundations

> **Authority:** `MASTER_PLAN.md` 3.0.4 / DEC-002 / DEC-003 / DEC-004 / DEC-005 / DEC-006
> **Completed:** P07-G01–G05; files and evidence preserved unchanged
> **Checkpoint:** `df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3` (G05), followed by `7b3c6a0`
> **Current stage:** Closed. Next is [Phase 8](phase8.md) / [P08-G01](phase8/guide1.md)
> **Native prerequisite:** NM-G09 certified at `93e4ad192010bd660d5d0388e7b60bc7404c1d83`; archived check evidence records gate PASS
> **P07-G06/G07a/G07:** Closed. The progress log keeps the recorded Clippy block; this status change does not claim that check was rerun.
> **Status:** Closed for execution. Phase 8 planning does not rewrite the verification evidence below.

## 1. Parent plan contract

Master 3.0.4 → active bridge/phase → guide → implementation. Preserve historical web G01–G05. Read [DEC-002/003/004/005/006](../DECISIONS.md) for native architecture, native correctness and standalone-only scope, and [the bridge](archive/native-migration/native-migration.md) for prerequisites. Completed manual-feature instructions are historical; they do not require continued companion gameplay.

DEC-005 governs verification: unit/integration tests plus existing code/build checks satisfy gates. Completed guides and historical evidence remain unchanged; desktop/browser E2E, manual acceptance, packaged-app smoke and user sign-off are not required.

Execution order is fixed:

```text
P07-G05 → NM-G01 … NM-G09 → P07-G06 (complete) → P07-G07a (complete) → P07-G07 (closed) → Phase 8
```

| Guide         | Outcome                                            | Commit subject                                            | State               |
| ------------- | -------------------------------------------------- | --------------------------------------------------------- | ------------------- |
| P07-G01       | Manual journal                                     | `feat(p07-g01): record played matches`                    | Complete            |
| P07-G02       | Dexie v2 contracts/migration                       | `feat(p07-g02): introduce standalone save contracts`      | Complete            |
| P07-G03       | TS calendar/streams                                | `feat(p07-g03): define deterministic game time`           | Complete            |
| P07-G04       | Playable world generator                           | `feat(p07-g04): generate playable club worlds`            | Complete            |
| P07-G05       | Web career creation/guards                         | `feat(p07-g05): start standalone careers safely`          | Complete            |
| Native bridge | Native standalone foundations, retire manual workflows, no progression | See own nine-guide plan                       | Complete (NM-G09 PASS) |
| P07-G06       | Rust Continue / next-event UI                      | `feat(p07-g06): advance native careers deterministically` | Complete            |
| P07-G07a      | Remove non-standalone compatibility | `refactor(p07-g07a): remove non-standalone compatibility` | Complete |
| P07-G07       | Native foundation certification                    | `test(p07-g07): verify native standalone foundations`     | Closed              |

Phase 7 guides stay as historical instructions. Previous plan-2 phase/pending guides are archived at `plans/archive/web-standalone-v2/`. Active work is [Phase 8](phase8.md).

## 2. Objective and user-visible outcome

After bridge completion, finish the standalone foundation in the native app: Continue advances a complete seeded career from July 1 through the summer deadline to September 1 kickoff, persists once, survives relaunch and refuses unsupported further simulation.

Standalone is the only campaign model. P07-G07a removed old-save compatibility code and preservation tests; no manual read-only workspace, normalization or historical import/export support is required. This phase still ends before match simulation; Phase 8 adds fixtures/results/league tables in Rust.

DEC-006 supersedes old-save preservation requirements in completed guides and bridge evidence. Those actual results remain history; they do not satisfy or override the new cleanup gate.

## 3. Prerequisites

Do not execute G06 based only on the G05 web SHA. First require:

- NM-G09 committed with an explicit passed bridge gate, recorded SHA/checks and working native APIs.
- Rust core calendar/PRNG/generation passes native correctness and reproducibility checks; previous TS output equality is not required (DEC-003).
- SQLite read/write/import/backup/reopen, standalone guards and retired-manual-command refusal pass (DEC-004).
- Existing native features use GameClient; no Dexie fallback.

Inspect `plans/archive/native-migration/native-migration.md` §10 and the actual Cargo/native/DTO code before trusting a checkbox. Missing bridge code is a blocked prerequisite, not permission to implement Continue in TS.

## 4. Scope

G06: pure Rust progression preview, authoritative native advance command, logical receipts/revisions and Command Center UI.

G07a: standalone-only native model, contracts, storage/import/UI cleanup and replacement tests under DEC-006.

G07: unit/integration certification of the cleaned standalone foundation, supported save round trips and time progression.

Out of scope: additional platform migration (belongs to bridge), match engine/fixtures, AI offers, injuries/recovery effects, growth, contract expiry, academy, awards, rollover, broad dataset import, PWA or live ticker.

## 5. Contracts

### 5.1 Retain the completed model

Standalone is the sole campaign model; Challenge/Sandbox are rule choices and fictional/imported are dataset kinds. Schema 2 and SQLite-origin source-schema-2 snapshots use 21 collections. Manual-mode variants, generator/demo, journal/appearance tables, browser normalization, historical views and compatibility-only commands are removed. Earlier databases and browser snapshots are rejected without converting or deleting their files. The normal frontend entry contains only the native application.

### 5.2 Rust clock progression

Use the ported core calendar APIs and explicit source date/cursor. Foundation states:

1. July 1 / no consumed boundary → August 31 summer deadline.
2. August 31 / deadline consumed → September 1 kickoff.
3. September 1 / kickoff consumed / league phase → blocked: `Match simulation arrives in Phase 8.`

Preserve consumed-boundary semantics: a deadline just processed must not remain today's next action. Calendar window intervals and logical closed-window readiness are distinct.

### 5.3 Native preview/commit

- UI requests preview and sends source revision/date/cursor and target boundary identity, not an arbitrary future date.
- Derive operation key from stable season/boundary keys. Fingerprint includes critical source/target inputs and input revision; fresh transport IDs/audit timestamps do not cause a reroll.
- Matching logical receipt returns the persisted outcome/current actual revision without a new write. Different fingerprint, stale source/revision or unsupported version fails.
- Compute outside a short transaction; recheck authoritative state/receipt/policy on the DB worker.
- Write state date/cursor/phase, one audit/receipt and one revision increment together. A failed command writes nothing.
- No player, contract, money, result or registration changes in foundation advancement.
- Loading, polling, focus, reload, app restart and real time never advance the game.

### 5.4 UI and errors

GameClient exposes native preview/advance. Show Game date, Next event, Continue, pending feedback, structured validation and stale-save remedy. Disable duplicate submit and re-read persisted state after success.

At kickoff, replace progression with explicit Phase 8 message. Direct Rust calls must stop too. No manual campaign mode, historical workspace or old-client command compatibility remains after G07a.

## 6. Dependencies and guide work

- G06 depends on passed NM-G09. Modify game-core calendar/progression, game-app use case, game-store receipt transaction, thin IPC/DTO/GameClient and Command Center.
- G07a depends on G06; remove remaining compatibility code and obsolete tests before certification.
- G07 depends on G06 and G07a. Add only meaningful cross-feature/native tests and docs/evidence; no new engine feature.
- Phase 8 depends on completed G07. Introduce future fixture/result/performance entities through later SQLite migrations.

See completed [guide6](phase7/guide6.md), completed [guide7a](phase7/guide7a.md) and [guide7](phase7/guide7.md) for exact implementation/checks.

## 7. Acceptance criteria

1. Bridge gate is actually passed before G06 begins.
2. Original G01–G05 files and recorded rows stay unchanged.
3. Native July→deadline→kickoff transitions commit exactly once and survive real SQLite store close/reopen in integration tests.
4. Retry cannot advance the next boundary, duplicate audit or report a fictitious revision.
5. Concurrent/stale/faulted commands leave no partial state.
6. Kickoff blocks UI and direct calls with the Phase 8 message.
7. Supported standalone snapshots retain seed keys, clock and receipts; management works after progression. No manual mode, v1 normalization or historical-save viewer is supported.
8. Command Center never uses Dexie or TS policy/clock authority.
9. No later gameplay or production-platform claim is fabricated.

## 8. Verification

Use scripts introduced by the completed bridge:

```bash
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

Unit/integration tests and the listed code/build checks are sufficient (DEC-005). Native tests use real temporary SQLite/file paths. Existing browser E2E is optional; no desktop automation, manual checklist or user sign-off is required.

Integration coverage: imported and fixed-seed standalone careers, July 1 → deadline → kickoff, store close/reopen, repeated-request handling, next-action refusal, supported standalone snapshot export/import and backup and no unrelated effects. Frontend unit/integration tests cover Continue, blockers and persisted-state refresh.

No new implementation checks have run during this scope amendment. Preserved progress rows below are historical web evidence; their manual-feature statements predate DEC-004 and do not create current product requirements.

## 9. Risks and rollback

The native bridge owns data migration/recovery. G07a removes old-save compatibility; G07 certifies supported standalone storage. Unsupported user files remain untouched. Use logical receipts and transaction fault tests to prevent duplicate progression; never reset a campaign to simplify a failed transition.

No unsupported fixture/market event may be skipped. A Rust build or mock UI pass alone is insufficient without SQLite/native integration evidence.

## 10. Exit and handoff

- [x] NM-G09 prerequisite evidence exists and passed.
- [ ] P07-G06/G07a/G07 have actual native commits/checks.
- [x] Game time advances idempotently and stops at kickoff.
- [x] Standalone-only cleanup and supported import/reopen/backup/protection checks pass.
- [x] README accurately records native status.
- [x] Phase 8 plans and guides exist. Implementation starts at [P08-G01](phase8/guide1.md), on the pure Rust core and versioned SQLite/IPC services.

### Progress log

The completed rows below are preserved verbatim. They describe checks at their historical web checkpoint.

| Guide         | Commit                                     | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P07-G01`     | `b5332a73353d5fd83d1258776984d79c1ed586b6` | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (503 passed), `pnpm build`, `pnpm exec playwright install chromium`, and `pnpm test:e2e` (5 passed). Browser pass: Match Journal had no preview banner, Calder Reserve 2–1 Win survived reload with blank xG stored as null, squad minutes stayed Unknown, Fill from lineup stored the starter at 90 and left the unchecked bench off, and Seasons still showed the preview banner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `P07-G02`     | `e30da9665c440c3f95b04f6f46d790ac6abaf9ca` | `pnpm exec vitest run src/test/simulation-migration.test.ts src/test/simulation-repositories.test.ts` (54 passed), `pnpm lint`, `pnpm typecheck`, `pnpm test` (44 files / 557 tests passed), `pnpm build`, and `pnpm test:e2e` (6 passed using existing Chromium). Actual v1 fixture upgrade/reload preserves selected club, 2-1 journal entry, EUR15,000 ledger, original nulls and raw legacy/sandbox modes; four simulation stores stay empty. Frozen schemaV1, generator v1, dependencies and lockfile unchanged. Contract choices: 200-character logical keys, 512-character fingerprints, uint32 event seeds and 1-32 typed outcome refs (campaign/season/club/player/boundary); identity keys/root seed stay fixed. Direct repository transactions compose atomically with commands by preserving the async callback in runInTransaction. No new-career UI or simulation command.                                    |
| `P07-G03`     | `54ae37b5e65cea4e282cb646b9e2a3d84d19a88e` | `pnpm exec vitest run src/test/simulation-calendar.test.ts src/test/simulation-random.test.ts src/test/dates.test.ts` (3 files / 104 passed), `pnpm lint`, `pnpm typecheck`, `pnpm test` (46 files / 647 passed), `pnpm build`, and targeted Prettier checks passed. Reviewed explicit 2026 July 1 -> August 31 -> September 1/Phase 8-stop fixtures: previews leave state/season unchanged, expose source/target keys and stable seeds, and close logical summer readiness after deadline consumption. Leap/century arithmetic, supported-year bounds, invalid season/date/phase/cursor refusal, JSON key ambiguity, independent named streams, pinned version-1 seed/draw fixtures, ID-remap/audit-time independence and absence of ambient clocks/randomness/persistence are covered. Database contracts, generator v1, dependency graph and browser UI unchanged; G03 does not require browser tests.                   |
| `P07-G04`     | `040a14300067514ec84ec47dba371dda5bf1e631` | `pnpm exec vitest run src/test/generate-playable-world.test.ts src/test/player-ability.test.ts src/test/generate-world.test.ts` (3 files / 17 passed), `pnpm lint`, `pnpm typecheck`, `pnpm test` (48 files / 658 passed), and `pnpm build` passed. Generator v2 builds a deterministic 4-league, 72-club world with complete squads, contracts, registration inputs and finite club transfer balances. The same seed repeats; another campaign id remaps persistence ids only; another year changes contract dates only. Generator v1, schema v1, packages and the legacy demo identity stay unchanged. This generator does not create careers, matches or receipts.                                                                                                                                                                                                                                                       |
| `P07-G05`     | `df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3` | `pnpm lint`, `pnpm typecheck`, `pnpm test` (49 files / 665 passed), `pnpm build`, and `pnpm test:e2e` (6 passed) passed. A Balanced Challenge career starts on 2026-07-01 with one opening allocation, a fixed club, and a retry that does not rebuild the world. Conflicting settings, the legacy demo id, a missing club, and an injected write failure leave no partial save. Sandbox policy edits do not post a second allocation. Standalone match, negotiation, player, contract, ledger, club-switch, and Challenge constitution writes are refused; the legacy demo can still record a match. Browser pass: Harbor Challenge, seed browser-career-2026, year 2026, Ashford, survived reload with squad 36, contract rows, €5,000,000 capacity, locked Challenge rules, no manual match or negotiation forms, and registration drafts prefilled without saving rows. The fictional demo match form stayed available. |
| Native bridge | `93e4ad192010bd660d5d0388e7b60bc7404c1d83` | Gate PASS. Evidence stays in the archived bridge progress log.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P07-G06       | `3b190ba255ae8a56670c571b10bf235119fe4211` | `pnpm native:bindings:check`; `pnpm native:check` (rustfmt, locked Clippy and 64 Rust tests); `pnpm lint`; `pnpm typecheck`; `pnpm test` (55 files / 701 passed); `pnpm build`; `pnpm tauri build` (Windows x64 release executable, MSI 5.20 MiB and NSIS 3.55 MiB). Real SQLite tests cover July 1 to the summer deadline and September 1 kickoff, stable operation keys, replay of the first request after later progress, transport-id retries, fingerprint and stale-source conflicts, one effect from concurrent same-event calls, injected audit-insert rollback, close/reopen, the Phase 8 kickoff stop, unchanged entity and finance rows, historical read-only refusal, and campaign isolation. Command Center Continue advances only after an explicit click. |
| P07-G07a      | `64758ae988d19352fbb784ada62f032960dc8a62` | `pnpm native:bindings`; `pnpm native:bindings:check`; `pnpm native:check` (rustfmt, locked Clippy and 63 Rust tests); `pnpm lint`; `pnpm typecheck`; `pnpm format:check`; focused native UI (4 files / 23 tests); `pnpm test --maxWorkers=2` (55 files / 699 passed); `pnpm build`; `pnpm tauri build` (Windows x64 MSI 5.02 MiB, NSIS 3.40 MiB). Production bundle audit confirms browser database/gameplay and compatibility inventory are excluded. |
| P07-G07       | `364f4d333629efc4f24cd3a5c6b7359c06a0ff95` | Coverage committed; certification pending. Required `pnpm native:check` is blocked by Windows Application Control refusing the pinned Clippy executable (OS error 4551), including an approved retry outside the sandbox. See current verification evidence below. |

### P07-G07a implementation evidence

Completed 2026-10-22 under DEC-006. Native DTOs accept one campaign mode, one generator, Career/StandaloneDemo creation and only supported management actions. Removed the manual generator/world models, manual player/club wire variants and customization, the old generic operation inventory/handler, browser-origin snapshots/v1 normalization, historical read-only UI and club-choice workspace route. Manual match journals/appearances and their DTOs/mappings are removed. Native audit actions now cover supported workflows. Generated bindings are rebuilt from a temporary directory and stale generated files are pruned; freshness checks pass.

Fresh SQLite schema 2 (`0002_standalone.sql`) contains 21 standalone collections and requires standalone mode, seed and generator metadata. SQLite-origin snapshots must declare source schema 2 and include a clock; schema 1, browser origin, unsupported modes, missing metadata and old journal fields refuse without normalization. Real-file tests prove an earlier database is rejected byte-for-byte unchanged, and rejected imports do not alter another career or its transport receipts. No actual application save files were accessed or deleted.

Native suites now use the standalone fixture and independently scoped save identities; old-mode preservation/generation tests were removed, retaining arithmetic, world legality, Challenge/scope/revision, transaction fault, retry, receipt, progression, backup/reopen and demo-isolation properties. Four rejection tests cover unsupported DTOs, snapshot metadata, partial-write refusal and old database versions. Browser source fixtures remain historical inputs to the unchanged browser unit suites, with original bytes/digests preserved. Completed guides/progress and dependency/lockfiles remain unchanged.

The normal application entry renders NativeBootstrap directly and no longer imports browser routes or the database provider. Native screens have no historical branch; Fixtures & Results has no manual journal tables. The production JavaScript is 300,802 bytes (112 transformed modules), down from the earlier roughly 804 kB bundle, and excludes Dexie, TouchlineDatabase, historical-demo/workspace strings, browser snapshot origin and the compatibility command inventory. Frontend, native workspace and Windows packaging checks passed; desktop/manual testing was not required or performed. An initial empty binary-test harness was blocked by Windows Application Control, then passed on the authorized retry; the final full native check also passed normally. Hosted CI, other OS, installer interaction, signing and updater certification are not claimed.

P07-G07 is next. No Phase 8 fixtures, simulation, market or lifecycle feature was added.

### P07-G07 verification evidence

Audit performed 2026-10-22. The NM-G09, P07-G06 and P07-G07a implementation commits are ancestors of the current checkpoint; their recorded checks were reviewed. Completed G01–G06/G07a guides, archived bridge evidence, browser reference source/fixtures, dependencies and lockfiles remain unchanged. Native bootstrap, typed command registration, scoped SQLite services, generated bindings and production bundle retain standalone authority without a browser database fallback, generic SQL API or test instrumentation.

Added `progressed_saves_keep_guards_and_receipts_across_export_backup_and_demo_reset` to the Rust application progression suite. It advances an imported Challenge save and a generated Sandbox demo to kickoff, proves Challenge board refusal and a single Sandbox policy edit without extra allocation, then exports/reimports snapshots and takes a live SQLite backup. After closing and reopening all three databases, entire campaign tables match, original deadline requests replay with current revisions and original receipts, and matchday calls stop without writes. Exact-byte source import cannot rewind progress; resetting the demo is idempotent, starts July 1 and leaves the other career and backup/restored copies unchanged. The focused progression suite passes all 3 tests.

`pnpm native:bindings:check`, `cargo fmt --all --check`, `cargo test --workspace --locked` (64 Rust tests), `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test --maxWorkers=2` (55 files / 699 tests), `pnpm build` and `pnpm tauri build` passed. Cargo commands ran from `src-tauri`. Windows x64 release packaging produced MSI 5.02 MiB and NSIS 3.39 MiB. The 300,802-byte production JavaScript bundle excludes Dexie, TouchlineDatabase, historical-demo/workspace strings, browser snapshot origin and the compatibility command inventory. Installer interaction, other platforms, signing, updater and hosted CI are not claimed; desktop/E2E/manual testing is not required under DEC-005.

Certification remains pending: `pnpm native:check` cannot launch pinned Rust 1.99.0 `clippy-driver.exe` because Windows Application Control returns OS error 4551. The approved outside-sandbox retry fails identically, and a direct version diagnostic confirms the executable is blocked. No policy, compiler pin, lint requirement or test gate was weakened. Resolve the host execution restriction and rerun the complete native check before marking Phase 7 complete or beginning Phase 8 implementation.

### Handoff

Phase 8 and all six guides are written from master 3.0.4 / DEC-005 / DEC-006: [plans/phase8.md](phase8.md). Add fixtures, results, and both teams' appearances to Rust/SQLite with one shared match engine. No manual journal or old-save compatibility is required; preserve supported standalone seed/version behavior. Future market, lifecycle, analytics, and import phases remain 9/10/11/12; Phase 13 is desktop release hardening. Unit and integration tests and code/build checks remain the verification gates; do not reintroduce E2E or manual sign-off requirements.
