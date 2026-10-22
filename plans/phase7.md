# Phase 7 — Native standalone foundations

> **Authority:** `MASTER_PLAN.md` 3.0.3 / DEC-002 / DEC-003 / DEC-004 / DEC-005
> **Completed:** P07-G01–G05; files and evidence preserved unchanged
> **Checkpoint:** `df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3` (G05), followed by `7b3c6a0`
> **Current stage:** Phase 7; next [P07-G06 — Rust Continue](phase7/guide6.md)
> **P07-G06/G07:** Pending; native migration prerequisite passed
> **Status:** NM-G01–NM-G09 complete and [archived](archive/native-migration/native-migration.md); progression remains pending

## 1. Parent plan contract

Master 3.0.3 → active bridge/phase → guide → implementation. Preserve historical web G01–G05. Read [DEC-002/003/004/005](../DECISIONS.md) for native architecture, native correctness and standalone-only scope, and [the bridge](archive/native-migration/native-migration.md) for prerequisites. Completed manual-feature instructions are historical; they do not require continued companion gameplay.

DEC-005 governs verification: unit/integration tests plus existing code/build checks satisfy gates. Completed guides and historical evidence remain unchanged; desktop/browser E2E, manual acceptance, packaged-app smoke and user sign-off are not required.

Execution order is fixed:

```text
P07-G05 → NM-G01 … NM-G09 → P07-G06 → P07-G07 → Phase 8
```

| Guide         | Outcome                                            | Commit subject                                            | State               |
| ------------- | -------------------------------------------------- | --------------------------------------------------------- | ------------------- |
| P07-G01       | Manual journal                                     | `feat(p07-g01): record played matches`                    | Complete            |
| P07-G02       | Dexie v2 contracts/migration                       | `feat(p07-g02): introduce standalone save contracts`      | Complete            |
| P07-G03       | TS calendar/streams                                | `feat(p07-g03): define deterministic game time`           | Complete            |
| P07-G04       | Playable world generator                           | `feat(p07-g04): generate playable club worlds`            | Complete            |
| P07-G05       | Web career creation/guards                         | `feat(p07-g05): start standalone careers safely`          | Complete            |
| Native bridge | Native standalone foundations, retire manual workflows, no progression | See own nine-guide plan                       | Complete (NM-G09 PASS) |
| P07-G06       | Rust Continue / next-event UI                      | `feat(p07-g06): advance native careers deterministically` | Pending             |
| P07-G07       | Native foundation certification                    | `test(p07-g07): verify native standalone foundations`     | Pending             |

Only pending G06/G07 instructions change. Previous plan-2 phase/pending guides are archived at `plans/archive/web-standalone-v2/`.

## 2. Objective and user-visible outcome

After bridge completion, finish the standalone foundation in the native app: Continue advances a complete seeded career from July 1 through the summer deadline to September 1 kickoff, persists once, survives relaunch and refuses unsupported further simulation.

Supported standalone management remains usable. Historical manual saves are preserved/read-only, without gameplay edits or conversion. This phase still ends before match simulation; Phase 8 adds fixtures/results/league tables in Rust.

## 3. Prerequisites

Do not execute G06 based only on the G05 web SHA. First require:

- NM-G09 committed with an explicit passed bridge gate, recorded SHA/checks and working native APIs.
- Rust core calendar/PRNG/generation passes native correctness and reproducibility checks; previous TS output equality is not required (DEC-003).
- SQLite read/write/import/backup/reopen, standalone guards and retired-manual-command refusal pass (DEC-004).
- Existing native features use GameClient; no Dexie fallback.

Inspect `plans/archive/native-migration/native-migration.md` §10 and the actual Cargo/native/DTO code before trusting a checkbox. Missing bridge code is a blocked prerequisite, not permission to implement Continue in TS.

## 4. Scope

G06: pure Rust progression preview, authoritative native advance command, logical receipts/revisions and Command Center UI.

G07: unit/integration certification of the full native foundation, including migrated saves and time progression.

Out of scope: additional platform migration (belongs to bridge), match engine/fixtures, AI offers, injuries/recovery effects, growth, contract expiry, academy, awards, rollover, broad dataset import, PWA or live ticker.

## 5. Contracts

### 5.1 Retain the completed model

Current campaign mode (legacy/standalone), rules mode (Challenge/Sandbox), source kind, identities, root seeds and generator/simulation/calendar versions remain unchanged. SQLite has ported all 23 game stores plus transport metadata. Do not reinterpret legacy logs as simulated results.

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

At kickoff, replace progression with explicit Phase 8 message. Direct Rust calls must stop too. Manual creation/gameplay forms are retired in every mode; historical manual saves remain read-only and cannot use Continue.

## 6. Dependencies and guide work

- G06 depends on passed NM-G09. Modify game-core calendar/progression, game-app use case, game-store receipt transaction, thin IPC/DTO/GameClient and Command Center.
- G07 depends on G06. Add only meaningful cross-feature/native tests and docs/evidence; no new engine feature.
- Phase 8 depends on completed G07. Introduce future fixture/result/performance entities through later SQLite migrations.

See [guide6](phase7/guide6.md) and [guide7](phase7/guide7.md) for exact implementation/checks.

## 7. Acceptance criteria

1. Bridge gate is actually passed before G06 begins.
2. Original G01–G05 files and recorded rows stay unchanged.
3. Native July→deadline→kickoff transitions commit exactly once and survive real SQLite store close/reopen in integration tests.
4. Retry cannot advance the next boundary, duplicate audit or report a fictitious revision.
5. Concurrent/stale/faulted commands leave no partial state.
6. Kickoff blocks UI and direct calls with the Phase 8 message.
7. Imported histories and seed keys remain intact; standalone management works, while historical manual saves reject edits and progression.
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

Integration coverage: imported and fixed-seed standalone careers, July 1 → deadline → kickoff, store close/reopen, repeated-request handling, next-action refusal, historical data inspection/export without edits and no unrelated effects. Frontend unit/integration tests cover Continue, blockers and persisted-state refresh.

No new implementation checks have run during this scope amendment. Preserved progress rows below are historical web evidence; their manual-feature statements predate DEC-004 and do not create current product requirements.

## 9. Risks and rollback

The native bridge owns data migration/recovery. G06/G07 preserve its schemas, app identity and source exports. Use logical receipts and transaction fault tests to prevent duplicate progression; never reset a campaign to simplify a failed transition.

No unsupported fixture/market event may be skipped. A Rust build or mock UI pass alone is insufficient without SQLite/native integration evidence.

## 10. Exit and handoff

- [x] NM-G09 prerequisite evidence exists and passed.
- [ ] P07-G06/G07 have actual native commits/checks.
- [ ] Game time advances idempotently and stops at kickoff.
- [ ] Existing features/import/reopen/backup and protection remain sound.
- [ ] README accurately records native status.
- [ ] Phase 8 can start with pure Rust core and versioned SQLite/IPC services.

### Progress log

The completed rows below are preserved verbatim. They describe checks at their historical web checkpoint.

| Guide         | Commit                                     | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P07-G01`     | `b5332a73353d5fd83d1258776984d79c1ed586b6` | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (503 passed), `pnpm build`, `pnpm exec playwright install chromium`, and `pnpm test:e2e` (5 passed). Browser pass: Match Journal had no preview banner, Calder Reserve 2–1 Win survived reload with blank xG stored as null, squad minutes stayed Unknown, Fill from lineup stored the starter at 90 and left the unchecked bench off, and Seasons still showed the preview banner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `P07-G02`     | `e30da9665c440c3f95b04f6f46d790ac6abaf9ca` | `pnpm exec vitest run src/test/simulation-migration.test.ts src/test/simulation-repositories.test.ts` (54 passed), `pnpm lint`, `pnpm typecheck`, `pnpm test` (44 files / 557 tests passed), `pnpm build`, and `pnpm test:e2e` (6 passed using existing Chromium). Actual v1 fixture upgrade/reload preserves selected club, 2-1 journal entry, EUR15,000 ledger, original nulls and raw legacy/sandbox modes; four simulation stores stay empty. Frozen schemaV1, generator v1, dependencies and lockfile unchanged. Contract choices: 200-character logical keys, 512-character fingerprints, uint32 event seeds and 1-32 typed outcome refs (campaign/season/club/player/boundary); identity keys/root seed stay fixed. Direct repository transactions compose atomically with commands by preserving the async callback in runInTransaction. No new-career UI or simulation command.                                    |
| `P07-G03`     | `54ae37b5e65cea4e282cb646b9e2a3d84d19a88e` | `pnpm exec vitest run src/test/simulation-calendar.test.ts src/test/simulation-random.test.ts src/test/dates.test.ts` (3 files / 104 passed), `pnpm lint`, `pnpm typecheck`, `pnpm test` (46 files / 647 passed), `pnpm build`, and targeted Prettier checks passed. Reviewed explicit 2026 July 1 -> August 31 -> September 1/Phase 8-stop fixtures: previews leave state/season unchanged, expose source/target keys and stable seeds, and close logical summer readiness after deadline consumption. Leap/century arithmetic, supported-year bounds, invalid season/date/phase/cursor refusal, JSON key ambiguity, independent named streams, pinned version-1 seed/draw fixtures, ID-remap/audit-time independence and absence of ambient clocks/randomness/persistence are covered. Database contracts, generator v1, dependency graph and browser UI unchanged; G03 does not require browser tests.                   |
| `P07-G04`     | `040a14300067514ec84ec47dba371dda5bf1e631` | `pnpm exec vitest run src/test/generate-playable-world.test.ts src/test/player-ability.test.ts src/test/generate-world.test.ts` (3 files / 17 passed), `pnpm lint`, `pnpm typecheck`, `pnpm test` (48 files / 658 passed), and `pnpm build` passed. Generator v2 builds a deterministic 4-league, 72-club world with complete squads, contracts, registration inputs and finite club transfer balances. The same seed repeats; another campaign id remaps persistence ids only; another year changes contract dates only. Generator v1, schema v1, packages and the legacy demo identity stay unchanged. This generator does not create careers, matches or receipts.                                                                                                                                                                                                                                                       |
| `P07-G05`     | `df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3` | `pnpm lint`, `pnpm typecheck`, `pnpm test` (49 files / 665 passed), `pnpm build`, and `pnpm test:e2e` (6 passed) passed. A Balanced Challenge career starts on 2026-07-01 with one opening allocation, a fixed club, and a retry that does not rebuild the world. Conflicting settings, the legacy demo id, a missing club, and an injected write failure leave no partial save. Sandbox policy edits do not post a second allocation. Standalone match, negotiation, player, contract, ledger, club-switch, and Challenge constitution writes are refused; the legacy demo can still record a match. Browser pass: Harbor Challenge, seed browser-career-2026, year 2026, Ashford, survived reload with squad 36, contract rows, €5,000,000 capacity, locked Challenge rules, no manual match or negotiation forms, and registration drafts prefilled without saving rows. The fictional demo match form stayed available. |
| Native bridge | Pending                                    | Gate not passed; see its own progress log                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P07-G06       | Pending                                    | Not run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P07-G07       | Pending                                    | Not run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Handoff

Generate Phase 8 and all its guides from master 3.0.3 / DEC-005 after G07 passes. Add fixtures/results/both-team appearances to Rust/SQLite with one shared match engine. Historical journal rows remain separate/read-only; preserve seed/version behavior. Future market/lifecycle/analytics/import phases remain 9/10/11/12; Phase 13 is desktop release hardening. Unit/integration tests and code/build checks remain the verification gates; do not reintroduce E2E or manual sign-off requirements.
