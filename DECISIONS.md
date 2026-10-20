# Architecture and product decisions

> Current architecture: DEC-002 / master 3.0.0. DEC-001 records the earlier web decision and its historical checkpoint; it is superseded where DEC-002 changes platform or execution order.

## DEC-001 — Pivot to Standalone Sporting Director Sim

- **Date:** 2026-10-20
- **Status:** Accepted for planning by the user's documentation-update request; implementation pending
- **Plan change:** `MASTER_PLAN.md` 1.0.0 → 2.0.0; product release target remains v1
- **Checkpoint:** Phases 1–6 complete; P07-G01 complete at `b5332a73353d5fd83d1258776984d79c1ed586b6`, followed by progress commit `e77d9a6`

### Motivation and outcome

The user wants a playable local sporting-director game rather than a workspace requiring a career played in an external game. Preserve the implemented stack, saves, policy engine, finance, squad/tactics UI and transactional commands while adding deterministic autonomous gameplay.

### Planning defaults

Use instant results with reports and automatic substitutions; lightweight fitness/sharpness, 7–28 game-day injuries and one-match straight-red league bans; Board Challenge presets with command-enforced locked rules and audited editable Sandbox. These are defaults adopted from the preceding review, not claims that the user separately selected each option. Changes before implementation require updating the master and affected pending guides.

Keep four independent 18-club leagues and 3,000 players. Defer live match ticker, cups, promotion/relegation, staff, morale, dismissal, detailed commercial accounting and hosted services.

### Technical and data decisions

1. Keep Vite/React/TypeScript/Dexie, pure domain functions and command-level transactions.
2. Preserve completed phases/guides. Resume at the replacement P07-G02; no Phase 1 regeneration.
3. Existing campaigns migrate to legacy/sandbox. Dataset kind and gameplay mode are separate fields. No implicit conversion or invented match history.
4. Preserve schemaV1 and generator v1. Add Dexie v2 plus playable generator v2 and separate standalone demo identity.
5. Initialize contracts, legal squad coverage, finite budgets and simulation profiles for the entire world.
6. Use explicit in-game dates and versioned event streams/keys independent of audit time and remappable entity IDs.
7. Keep canonical simulated fixtures/results/both-team appearances separate from legacy manual logs. Results are immutable and operations have idempotency receipts.
8. Make AI bids binding/affordable before a mandatory-sale rule can lock progression; reserve funds and pre-agree player terms.
9. Settle prizes/objective bonuses as awards earned in the closing season but credited once in the opening season, excluding them from closing carryover.
10. Challenge guards apply at every command path. Legacy manual money, deal, player and match writes reject standalone careers.

### Roadmap and document impact

| Phase | Revised scope                                                                      |
| ----- | ---------------------------------------------------------------------------------- |
| 7     | Migration/contracts, clock, playable generation, new career, preseason progression |
| 8     | Fixtures, instant engine, availability, reports and league tables                  |
| 9     | AI market, negotiations and both-club settlement                                   |
| 10    | Development, expiry, retirement, academy, objectives and season settlement         |
| 11    | Moneyball/scouting, formerly future Phase 8                                        |
| 12    | Import/backup/restore, formerly future Phase 9                                     |
| 13    | PWA/accessibility/performance/balancing/release, formerly future Phase 10          |

Amend MASTER_PLAN and phase7; replace only pending guides 2–6 and add guide7. Preserve Guide 1 byte-for-byte and its progress evidence. Archive the superseded phase7 plan/guides because several were untracked. Phase1–6 docs remain historical; future phase8–13 plans are generated when active.

Update README to distinguish the new product target from the currently implemented companion checkpoint. No gameplay code, schema migration or package upgrade is part of this documentation change.

### Verification and compatibility obligations

Future implementation must test actual v1 upgrades, atomic creation/rollback, complete legal worlds, mode/Challenge guards, seed/ID-remap stability, deadline consumption, retries and stale-tab conflicts. Later phases prove full-world simulation, coherent match records, budget conservation, actionable compulsory sales, exact award accounting, sustainable multi-season squads and deterministic restore.

This planning amendment makes no new runtime verification claim. The prior review's existing baseline was 42 passing test files / 503 tests; all new standalone deliverables remain pending.

---

## DEC-002 — Native migration bridge before P07-G06

- **Date:** 2026-10-20
- **Status:** Accepted for planning; user explicitly requested a bridge before continuing Phase 7
- **Plan change:** 2.0.0 → 3.0.0; standalone game design remains
- **Checkpoint:** P07-G05 `df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3`; evidence `7b3c6a0`

### Outcome and rationale

The destination is a desktop Tauri application with Rust-owned game logic and SQLite. First port the existing usable G05 application; then add new clock/match gameplay. This avoids implementing future engine/market/lifecycle systems twice and makes cutover independently verifiable.

### Decisions

1. Keep React/Vite/TypeScript presentation. Use Tauri 2, pure Rust game-core, game-app services and game-store persistence through rusqlite (bundled SQLite/backup).
2. Introduce serde DTOs/generated TS bindings and GameClient. Rust owns validation, policies, revisions, receipts and writes; frontend SQL and native Dexie fallback are prohibited.
3. Preserve completed P07-G01–G05 files, SHAs and evidence. Do not renumber or re-execute them.
4. Insert separate `plans/native-migration.md` with NM-G01–NM-G09 and its own guides/progress. **P07-G06 cannot begin until NM-G09 passes.**
5. Keep G06 as Rust Continue and G07 as native foundation certification. Match engine still starts in Phase 8.
6. Pull forward original-origin browser export and basic native snapshot import/export/backup. Preserve source browser DB and every supported legacy/standalone row, ID, null, revision, seed and receipt.
7. SQLite schema 1 is independent of Dexie 1/2. Separate transport receipts track import; no fake gameplay audit or revision increment.
8. Exact JS/Rust UTF-16/u32/PRNG/JSON/date/money/generator parity is a gate. Keep TS as frozen oracle; do not rebalance while porting.
9. App/schema/export/generator/calendar/simulation versions remain independent with tested compatibility.
10. Desktop is primary, Windows first tested. Full PWA/WASM browser play is deferred. Phase 13 changes to native packaging/signing/upgrades/accessibility/performance/release.

### Ordered bridge

```text
P07-G05 → NM-G01 export/vectors → NM-G02 shell/API
 → NM-G03 SQLite/import/backup → NM-G04 core rules/calendar
 → NM-G05 generators → NM-G06 reads/import UI → NM-G07 management writes
 → NM-G08 legacy writes → NM-G09 native cutover gate
 → P07-G06 Continue → P07-G07 foundation → Phase 8
```

Archive the superseded plan-2 Phase 7 and pending G06/G07 instructions. Update README/master/phase pointers to NM-G01. No code, dependencies, migrations or native tests are executed as part of this docs change.

### Required evidence

Actual source v1/v2 import and source preservation; native feature parity; exact seed/generator vectors; transaction rollback/collision/retry behavior; direct Rust Challenge/scope guards; close/relaunch/consistent backup; generated contracts; real Cargo/SQLite/native E2E checks.

References: [Tauri](https://v2.tauri.app/start/frontend/vite/), [rusqlite](https://github.com/rusqlite/rusqlite), [ts-rs](https://github.com/Aleph-Alpha/ts-rs).
