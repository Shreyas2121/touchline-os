# Phase 7 — Standalone simulation foundations

> **Derived from:** `MASTER_PLAN.md` version `2.0.0` (2026-10-20)
> **Phase IDs:** completed `P07-G01` … `P07-G05`; pending `P07-G06` … `P07-G07`
> **Status:** Guides 1-5 are complete. A standalone career can start on 1 July with a generated world, one club, and Challenge or Sandbox rules. Continue, match simulation, and transfer negotiation remain pending.
> **Checkpoint:** `b5332a73353d5fd83d1258776984d79c1ed586b6` (`feat(p07-g01): record played matches`), followed by `e77d9a6` documenting completion.
> **Next guide:** `plans/phase7/guide6.md`. Do not restart Phase 1, reset to Phase 6 or execute the archived companion guides.

## 1. Parent plan contract

Authority: `MASTER_PLAN.md` 2.0.0 → this phase → active guide → implementation. See `DECISIONS.md` DEC-001 for the authorized pivot and adopted planning defaults.

Relevant master sections:

- §0: completed phases/guides are historical; replace only pending instructions.
- §§1–3: standalone career, instant results, lightweight availability, Board Challenge/Sandbox and honest implementation status.
- §4: mode isolation, additive migrations, simulation entities, logical keys, receipt/revision semantics.
- §5: retain rule/finance behavior; guard Challenge and standalone writes at command boundaries.
- §6.1: keep generator v1; add a playable v2 with complete squads, contracts, registration inputs and finite budgets.
- §7.1: explicit July–June calendar, Continue boundaries and the Phase 7 kickoff stop.
- §8: pure domain computations, repository reads and short transactional commands.
- §9 Phase 7: exact guide sequence and subjects below.
- §§12, 17: migration/determinism/isolation tests and documented change control.

| ID        | Deliverable                                  | Commit subject                                       | Status             |
| --------- | -------------------------------------------- | ---------------------------------------------------- | ------------------ |
| `P07-G01` | Historical manual match journal              | `feat(p07-g01): record played matches`               | Complete; preserve |
| `P07-G02` | Simulation contracts and Dexie v2 migration  | `feat(p07-g02): introduce standalone save contracts` | Complete           |
| `P07-G03` | Pure game calendar and deterministic streams | `feat(p07-g03): define deterministic game time`      | Complete           |
| `P07-G04` | Playable world generator v2                  | `feat(p07-g04): generate playable club worlds`       | Complete           |
| `P07-G05` | Atomic new-career creation and write guards  | `feat(p07-g05): start standalone careers safely`     | Complete           |
| `P07-G06` | Continue command and progression UI          | `feat(p07-g06): advance the standalone game clock`   | Pending            |
| `P07-G07` | Foundation integration/browser evidence      | `test(p07-g07): verify standalone foundations`       | Pending            |

Each pending guide has its own executable file. All are written before implementation. Completed `guide1.md` remains unchanged. Previous pending guides and the original phase plan are archived under `plans/archive/companion-v1/`.

## 2. Phase objective and user-visible outcome

At phase exit a user can:

1. Open the existing legacy demo/campaign without losing matches, players, contracts, ledger or audit history.
2. Start a distinct standalone career from a seed, explicit start year, selected club and Challenge/Sandbox choice.
3. See all 72 clubs and 3,000 players initialized with valid ownership, contracts, simulation profiles and club budgets.
4. See the game date begin on July 1 of the chosen year, independently of audit timestamps and the browser clock.
5. Keep the chosen Challenge rules locked or edit Sandbox policies through the audited editor.
6. Advance preseason through the August 31 window deadline to September 1 kickoff, then see `Match simulation arrives in Phase 8.`
7. Reload without advancing time or repeating initialization/progression.
8. Continue using the manual journal on legacy saves, while standalone saves reject the same manual write commands.

This is a foundation milestone, not a playable match or full-season milestone. No AI bids, simulated results, prizes, growth, newgens or rollover are presented as available.

## 3. Prerequisites

The completed implementation includes Phases 1–6 and P07-G01. Confirm the checkpoint with:

```bash
git log -5 --oneline
git log --grep="feat(p07-g01): record played matches" -1 --format=%H
git merge-base --is-ancestor b5332a73353d5fd83d1258776984d79c1ed586b6 HEAD
git status --short
```

At the planning checkpoint, `plans/phase6.md` and the previous pending Phase 7 guides were untracked. Preserve unrelated files and do not require a destructive cleanup or stage them indiscriminately.

Inspect before implementation:

- `src/domain/validation/schemas.ts` and `limits.ts` — strict schemas, nullable source values, bounded IDs/audits and rating/xG units.
- `src/data/db.ts` and frozen `src/data/migrations/v1.ts` — current IndexedDB version 1.
- `src/data/transactions/run-command.ts` — transaction, revision and error mapping.
- `src/data/repositories/**` — campaign ownership and referential checks.
- `src/domain/seed/generate-world.ts`, `prng.ts`, `names.ts` — v1 output must not change.
- `src/data/commands/create-campaign.ts`, `seed-demo.ts`, `reset-demo.ts` and `select-managed-club.ts`.
- Existing match, transfer, offer, contract, ledger, constitution and player-edit commands.
- `src/domain/rules/**`, `src/domain/finance/**` and current preset defaults.
- `src/features/campaigns/**`, `src/features/dashboard/**`, `src/app/copy.ts` and `src/app/layout/WorkspaceLayout.tsx`.
- `src/test/database.test.ts`, `schemas.test.ts`, `generate-world.test.ts`, `seed-demo.test.ts` and `record-match.test.ts`.
- Existing Playwright journeys and README implementation-status note.

No production dependency is needed. Keep package versions/lockfile unchanged. Do not add charting, a second database, backend, live ticker or a new state framework.

## 4. In scope / out of scope

### In scope

- Mode fields on Campaign and four simulation foundation stores.
- Explicit v1→v2 migration, new-database setup and compatibility fixtures.
- Deterministic seed derivation and game-calendar calculations.
- A new playable generator version with contracts, fitness/goalkeeping/eligibility profiles and finite budgets.
- Atomic standalone creation and separate standalone demo identity.
- Explicit legacy/standalone command guards and Challenge policy protection.
- Bounded preseason time advancement, receipts, audits and command-center states.
- Documentation and meaningful integration/browser checks.

### Out of scope

| Deferred feature                                                                             | Owning phase |
| -------------------------------------------------------------------------------------------- | ------------ |
| Fixtures, results, both-team appearances, match engine, league table, fatigue/injury updates | 8            |
| Scouting-grade role effects, match lineup validation and auto-substitutions                  | 8            |
| AI market, club/player negotiation, reservations and two-club deal settlement                | 9            |
| Midseason/end-season development, contract expiry, retirement, academy and awards            | 10           |
| Review/preview/confirm rollover and next-season fixtures                                     | 10           |
| Moneyball comparisons and insights                                                           | 11           |
| Full JSON interchange, CSV/JSON datasets and playable import completion                      | 12           |
| PWA, storage/release hardening and production performance/balancing                          | 13           |

Also excluded: rewriting completed Guide 1, manual match correction as a new feature, copying old journal rows into a league table, promoting legacy saves to standalone, expanding beyond the four independent leagues, and modifying generator v1 outputs.

## 5. Architecture impact

### 5.1 Campaign modes and compatibility

Extend Campaign with `mode: 'legacy' | 'standalone'` and `rulesMode: 'challenge' | 'sandbox'`. Keep `kind: 'fictional' | 'imported'` as dataset provenance; fictional does not imply playable.

- Stored v1 campaigns upgrade to legacy + sandbox. Existing command payloads that lack modes continue to create legacy campaigns only.
- No existing campaign receives generated contracts, budgets, simulation state or invented matches during migration.
- Old source fields and nullability remain unchanged. Do not migrate unknown wages to zero.
- New standalone creation explicitly writes both modes and initializes its entire world.
- Standalone Challenge policies cannot be modified through `saveConstitution`. Sandbox uses the same audited policy engine.
- Club selection is a setup choice for standalone careers; the old `selectManagedClub` command cannot switch a running career.
- Mode guards must work through direct command calls, not just hidden buttons.

### 5.2 Phase 7 stores

Use Zod/type contracts in `src/domain/simulation/schemas.ts` and an additive `src/data/migrations/v2.ts`. SchemaV1 stays byte-for-byte unchanged.

| Store                    | Required fields / behavior                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `simulationStates`       | `id, campaignId, activeSeasonId, rootSeed, simulationVersion='1', calendarVersion='1', currentDate, phase, lastBoundaryKey`; unique campaign                                     |
| `clubSimulationStates`   | `id, campaignId, clubId, simulationKey, transferBalanceCents, wageBudgetWeeklyCents`; unique campaign + club                                                                     |
| `playerSimulationStates` | `id, campaignId, playerId, simulationKey, fitness, sharpness, goalkeeping, injuryUntilDate, suspensionMatches, status, homegrownClub, homegrownNation`; unique campaign + player |
| `simulationReceipts`     | `id, campaignId, operationKey, inputRevision, inputFingerprint, eventSeed, simulationVersion, outcomeRefs, createdAt`; unique campaign + operation                               |

Fitness/sharpness are integers 0–100; injuryUntilDate nullable; league suspension count a nonnegative integer; goalkeeping is known for a GK, otherwise null; status is active/retired. Receipt references are compact, typed and campaign checked. Game phase is `preseason` / `league` / `review`; transfer-window status is derived from date, not a second independent mutable state.

Register versions explicitly:

```text
version(1).stores(schemaV1)
version(2).stores(schemaV2).upgrade(preserveRowsAndSetLegacyModes)
```

Simply changing `DATABASE_VERSION` in the old single declaration is not a migration. V2 adds the four stores and preserves all old indexes. Later phases add only their own stores in later versions.

Update campaign deletion/reset table scopes for the new stores. Test cleanup uses isolated database names; do not touch the user's browser save.

### 5.3 Pure clock and random stream APIs

Suggested public contracts:

```ts
type GameBoundary = {
  key: string
  date: DateOnly
  kind: 'summer-deadline' | 'league-kickoff'
}

type ClockPreview = {
  fromDate: DateOnly
  sourceBoundaryKey: string | null
  target: GameBoundary | null
  targetBoundaryKey: string | null
  eventSeed: number | null
  allowed: boolean
  reason: string | null
}

deriveEventSeed(rootSeed, simulationVersion, eventKind, logicalKeys): number
createEventStream(rootSeed, simulationVersion, eventKind, logicalKeys): () => number
eventStreamKey(rootSeed, simulationVersion, eventKind, logicalKeys): string
addDays(date, days): DateOnly
seasonDates(startYear): { startDate: DateOnly; endDate: DateOnly }
transferWindowOn(date): 'summer' | 'winter' | null
activeTransferWindow(state, season): 'summer' | 'winter' | null
nextFoundationBoundary(state, season): GameBoundary | null
previewTimeAdvance(state, season): ClockPreview
```

- Reuse pure calendar/date validation helpers; no ambient `Date`/clock or random calls.
- Season dates: July 1 year Y to June 30 Y+1. At setup validate year bounds against existing DateOnly support.
- At July 1, next foundation boundary is August 31 (summer deadline). After resolving that boundary, next is September 1 (kickoff).
- The boundary identity must record consumption: a receipt or state cursor distinguishes a deadline just reached from one already processed. No infinite loop returning today's consumed boundary.
- Window close on August 31 leaves the visible date at August 31 but logically closes summer. Persist `lastBoundaryKey` as the processed cursor; `transferWindowOn` alone describes the calendar interval, while command readiness also checks closure. A new career starts with a null cursor.
- At September 1, phase is league and further Phase 7 advancement is refused with the explicit Phase 8 message. Never skip unimplemented match events.
- Serialize seed components unambiguously. Different event kinds use independent streams; persistent keys omit campaign/entity IDs and audit timestamps.
- No fixtures, recovery or market ticks are executed in this phase. The API can later accept event handlers, but do not build a plugin framework.

G03 implementation contract:

- `addDays` uses pure Gregorian arithmetic and validates its input/output against DateOnly (1900-2199). Complete seasons can start in 1900-2198. Day offsets must be safe integers and remain within the supported dates.
- A clock references an active, unclosed season in the same campaign with exact July 1/June 30 dates. Boundary keys are `season:<startYear>:summer-deadline` and `season:<startYear>:league-kickoff`, independent of season ordinal and remappable IDs.
- Valid foundation states are preseason July 1-August 31 with a null cursor, preseason August 31 with the consumed deadline key, and league September 1 with the consumed kickoff key. Other date/phase/cursor combinations throw `RangeError`; malformed schemas throw Zod errors. Later gameplay dates/handlers are not accepted by the foundation clock.
- An unconsumed August 31 deadline may target that same day once: the target key differs from the source cursor. After consumption, `activeTransferWindow` closes summer and the next preview targets September 1. This readiness helper is limited to foundation states; `transferWindowOn` independently covers both full calendar intervals.
- Allowed previews include source/target keys and a uint32 seed from the `calendar` namespace with the target key. A valid kickoff returns a blocked preview with null target/seed and the Phase 8 reason, without changing inputs or producing persistent records.
- Named namespaces are `world`, `calendar`, `fixture`, `market`, and `development`. Stream identity is the JSON array `['simulation-stream', '1', rootSeed, eventKind, orderedLogicalKeys]`, hashed by existing `hashSeed` with the `simulation-stream` discriminator. Existing seed/key validation applies; 0-32 logical keys are supported, with an empty list naming the namespace root. Each `createEventStream` owns a fresh existing `mulberry32` generator. Fixed seed/draw fixtures pin version 1 behavior.

### 5.4 Playable generator v2

Create `src/domain/seed/generate-playable-world.ts` and share small pure role-ability helpers in `src/domain/player/ability.ts`. Existing `generateWorld` v1 and `GENERATOR_VERSION = '1'` keep their contracts/tests. New standalone creation selects `PLAYABLE_GENERATOR_VERSION = '2'` explicitly.

```ts
generatePlayableWorld({
  seed, generatorVersion: '2', campaignId, startYear
}): ParseResult<PlayableWorld>
```

The returned DTO includes leagues, clubs, players, contracts, club simulation states and player simulation states. It does not include a stored Campaign, fixture, result or audit. Entity IDs are mapped after seeded logical content; random streams never use campaignId. Limit new standalone campaign IDs to a documented length that leaves generated IDs inside the existing 64-character bound, or use a validated mapping; do not change legacy ID limits.

Required generation properties:

- Exactly 4 × 18 clubs, 2,880 owned players and 120 free agents; preserve the 36–44 roster-size distribution if practical.
- At least two GKs per club plus a legal supported XI and bench with deterministic positional coverage.
- Position-weighted ability formula and goalkeeper rating; attributes/potential are valid integers, potential at least present ability.
- Related prestige/ability, value and wage formulas with bounded seeded variation; publish constants and units. A random independent market value is not acceptable.
- Exactly one active contract for each owned active player, no active contract for a free agent. Known wage, squad tier, starts/expiry; first expiry is no earlier than June 30 of the first season.
- Finite nonnegative transfer balance and a weekly wage budget at least the sum of the generated contracts. Opening capacity for the managed club comes from the chosen preset, independently of actual available club funds.
- Initial fitness 100, known sharpness in a documented range, no injuries/bans, active status.
- Fictional homegrown flags allow at least eight non-exempt homegrown players in a legal 25-person Balanced registration and at least ten in a feasible Strict 20-person registration.
- All current facts generated here are labeled fictional/generated as appropriate; DOB stays null with reported age/reference season.
- Unsupported version returns a clear failure. A different campaignId changes references only, not logical football content.

Exact tuning constants are gameplay choices, versioned and tested in G04; they are not verified football statistics.

### 5.5 Starting a standalone career

Add `prepareStandaloneCareer` (pure) and `startStandaloneCampaign` (data command). Inputs include explicit name, seed, year, selected stable club key, Challenge preset or Sandbox, campaign/action/audit IDs and audit timestamp. UI supplies IDs/time; domain calculations do not read ambient state.

The command generates/validates the authoritative world outside its transaction. Do not trust arbitrary client-provided wages/budgets as a prepared world.

In one transaction:

1. Refuse a colliding campaign ID unless a matching initialization receipt/fingerprint proves this is a harmless retry; never overwrite the legacy demo.
2. Insert all clubs/leagues, players, owned-player contracts and simulation profiles.
3. Create the active season, Campaign, SimulationState and constitution.
4. Post exactly one opening allocation and create an initialization receipt and concise audit.
5. Return the persisted campaign/revision.

Use existing repository ownership checks or safe bulk equivalents after full DTO/reference validation. Reuse/refactor narrow constitution initialization without going through the public Challenge mutation guard. Do not write every generated player into a 20k-character audit payload.

The new playable demo ID is distinct, e.g. `standalone-demo`; legacy demo ID `demo` and its reset behavior remain supported. A default start year of 2026 is a visible editable game setting, not derived from the wall clock.

### 5.6 Guard matrix

| Existing action                                            | Legacy                | Standalone in Phase 7                                                             |
| ---------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| Record manual match                                        | Preserve              | Refuse                                                                            |
| Record manual offer / accept / reject / completed transfer | Preserve              | Refuse; negotiation arrives in Phase 9                                            |
| Manual player add/correction                               | Preserve              | Refuse direct roster/attribute changes                                            |
| Development notes and target plans                         | Preserve              | Allow scoped planning writes; they do not directly change attributes or ownership |
| Save contract                                              | Preserve              | Refuse; negotiated contracts arrive later                                         |
| Post/reverse ledger entries                                | Preserve              | Refuse manual money effects; opening initialization is internal                   |
| Save constitution                                          | Preserve              | Sandbox only; Challenge refuses                                                   |
| Switch managed club                                        | Preserve legacy setup | Refuse after standalone creation                                                  |
| Save/delete lineup and shortlist                           | Preserve              | Allow with current roster/season validation                                       |
| Save registration                                          | Preserve              | Allow with known generated eligibility and existing quota checks                  |
| Rename/archive/delete/reset selected demo                  | Preserve              | Allow with campaign scope and confirmation appropriate to action                  |

Do not expose standalone registrations as unknown when their generated profile provides explicit homegrown data. Carry them into the registration draft; only confirmed registration saves produce Registration rows.

### 5.7 Time advancement command

`advanceTime` receives campaignId, expectedRevision, expected source game date/boundary identity, action/audit IDs and timestamp. It does not accept a caller-selected future date.

- Load campaign/state/season and derive the next boundary; validate supported versions and standalone mode.
- Return an existing matching logical receipt before changing state on retry; mismatched request/state is conflict or validation failure.
- Derive operation key from logical season/boundary keys, never the fresh actionId.
- Recheck state and revision in a short transaction. Only allowed foundation boundaries commit.
- Write game date/cursor/phase, one receipt, one audit and one revision increment atomically.
- At kickoff, a request writes nothing and returns the Phase 8 message.
- No contract, balance, player, match or registration changes occur during Phase 7 time advancement.
- The pure preview, button eligibility and command share the same transition rules.

A normal receipt retry returns the persisted outcome without a second audit/revision. A new event with stale expectedRevision must still fail.

### 5.8 UI and implementation-status wording

New-career flow has labels Seed, Start year, Club, Challenge/Sandbox and Board preset. Show validation and progress; do not list a half-created career. Reload opens the persisted same career.

Command Center shows `Game date`, `Next event`, active mode and `Continue`. At kickoff replace action with `Match simulation arrives in Phase 8.` Standalone matches page has no manual entry form and clearly states fixtures/results are not available yet. Legacy journal behavior stays unchanged.

Keep README accurate after each guide. This documentation pivot changes the target product immediately; it does not claim the current code already simulates.

## 6. Work breakdown and dependency graph

```text
P07-G01 (complete)
  → G02 contracts/migration
  → G03 calendar/streams
  → G04 playable generator
  → G05 atomic creation/guards
  → G06 time progression/UI
  → G07 integration/browser certification
  → Phase 8 fixtures and instant results
```

| Guide | Expected changes                                                                                        | Required evidence                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| G02   | Simulation schemas, mode defaults, migrations/v2, db stores, scoped repositories, deletion table scopes | Actual v1 rows survive upgrade; unique keys, ownership and invalid rows refused           |
| G03   | Pure calendar/date helpers, streams, previews and consumed-boundary semantics                           | Leap/boundary dates, independent streams, same seeds under ID remapping                   |
| G04   | New generator, shared ability/valuation constants and DTO validation                                    | Full 72-club world, legal coverage, consistent contracts/potential/finance, unchanged v1  |
| G05   | New creation/preparation commands, guard helper, new-game/demo UI, registration defaults                | Atomic initialization/fault rollback, modes locked at direct calls, legacy flows retained |
| G06   | Advance command, receipts, command-center and standalone journal presentation                           | July→deadline→kickoff, no wall-clock changes, retries/stale writes and persisted reload   |
| G07   | Migration/creation/progression integration suite, Playwright foundation journey, final docs             | Full checks, separate demos and no fabricated match/market/lifecycle results              |

Use the detailed guide file for APIs, edge cases, acceptance and commit instructions. Do not start a later guide because some unrelated baseline test needs a future feature.

## 7. Acceptance criteria

1. `schemaV1` and generator v1 outputs remain unchanged.
2. Opening a real v1 fixture upgrades to v2 with preserved historical rows and legacy/sandbox mode.
3. A fresh database creates all old and four new stores, with appropriate scoped uniqueness.
4. Legacy migration creates no simulation states, contracts, money or results.
5. New standalone creation is all-or-nothing and isolated from existing saves.
6. The v2 world contains 4 leagues, 72 clubs, 3,000 players and one complete active contract per owned player.
7. Every club has two GKs, feasible lineup/registration and a sufficient known wage ceiling.
8. Seed/version/year plus the same decisions yield equal logical content regardless of campaign IDs or audit timestamp.
9. Challenge constitution writes and old manual match/transfer/finance/player mutation commands reject standalone saves without audit/revision side effects.
10. Sandbox policy editing remains audited and cannot mint a second opening allocation.
11. July 1 creation, August 31 boundary and September 1 kickoff persist exactly once each.
12. Consumed same-day boundaries are not reprocessed; logical retries return the same receipt without a second increment.
13. Stale concurrent advancement fails and has no partial state.
14. Reloading or leaving the page never advances the game.
15. Phase 7 stops at kickoff and labels matches/market/lifecycle features as future work.
16. Legacy Match Journal, tactics, transfer and finance journeys still operate.
17. Delete/reset touches only the chosen campaign, including its simulation stores.
18. No new production dependency, lockfile change, proprietary dataset or hosted service is introduced.

## 8. Verification

At each guide, run its focused tests, then the relevant full checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Install Playwright Chromium only if missing using `pnpm exec playwright install chromium`. Browser tests use fresh isolated contexts; migration tests use separate v1/v2 fixture databases.

Final manual/browser journey:

1. Open the preserved legacy demo and record a manual match. Reload and verify it once.
2. Start a new standalone career with seed `standalone-foundation-test`, year 2026 and Balanced Challenge.
3. Confirm July 1 game date, complete squad/contracts, finite funds and no manual match form.
4. Try a direct Challenge constitution change and legacy mutation through integration tests; confirm no side effects.
5. Click Continue to the summer deadline, then to kickoff. Reload between actions.
6. At September 1 verify the Phase 8 message and no extra advance, fixture/result, sale, injury or growth.
7. Start a Sandbox career and edit a rule; ensure only one initial allocation exists.
8. Switch between saves; legacy match history and standalone date stay isolated.
9. Reset/delete the standalone demo, verify all its new stores are cleaned, and confirm the legacy demo remains.
10. Repeat the critical journey on `pnpm build` + `pnpm preview`.

No check in this phase certifies a match engine or completed season. Guide 2 migration/browser evidence and Guide 3 pure calendar/seed checks are recorded in §10; guides 4-7 remain pending.

## 9. Risks, mitigations, rollback

| Risk                                          | Mitigation                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Mode inferred from fictional provenance       | Explicit migration defaults and standalone-only creation command               |
| Changing only DATABASE_VERSION breaks upgrade | Preserve explicit version(1), add version(2), test an actual opened v1 fixture |
| Upgrading creates invented wages/history      | Migration changes mode metadata only                                           |
| New generator breaks old demo                 | Separate module/version/demo ID and unchanged v1 tests                         |
| Finances or Challenge rules bypassed          | Shared command-level guard plus direct-call negative tests                     |
| Sandbox policy save posts new opening money   | Single opening initialization and standalone policy-write regression test      |
| Incomplete creation becomes visible           | One validated creation transaction and injected rollback failure               |
| Deadline keeps returning itself               | Persist cursor/receipt and test same-date consumption                          |
| Receipt retry runs next event                 | Input source identity and logical-key comparison before advancement            |
| Restoring new IDs changes future seed         | Stable simulation keys independent of entity/campaign IDs                      |
| Big payload exceeds audit cap                 | Compact refs/seed/counts in audit; world rows in their own stores              |
| Code rollback cannot parse DB v2              | Compatible forward fix; never wipe or downgrade a live DB                      |
| Old pending docs are followed accidentally    | Superseded archive banner and active next-guide pointer                        |

User saves are never test fixtures. Do not use browser data deletion or a destructive reset as a migration strategy.

## 10. Exit criteria and handoff

- [ ] All six pending guides have commits in order; Guide 1 remains historical and unchanged.
- [ ] Acceptance criteria and phase checks pass with recorded actual evidence.
- [ ] v1→v2 migration, generator version separation and command mode guards are covered.
- [ ] A standalone career starts atomically and reaches kickoff once.
- [ ] README describes the precise implemented checkpoint.
- [ ] No match simulation, transfer AI, lifecycle or rollover is falsely marked complete.

### Progress log

Historical evidence below is preserved from the prior plan. It describes tests run when Guide 1 was completed, not tests for the standalone pivot.

| Guide     | Commit                                     | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P07-G01` | `b5332a73353d5fd83d1258776984d79c1ed586b6` | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (503 passed), `pnpm build`, `pnpm exec playwright install chromium`, and `pnpm test:e2e` (5 passed). Browser pass: Match Journal had no preview banner, Calder Reserve 2–1 Win survived reload with blank xG stored as null, squad minutes stayed Unknown, Fill from lineup stored the starter at 90 and left the unchecked bench off, and Seasons still showed the preview banner. |
| `P07-G02` | `e30da9665c440c3f95b04f6f46d790ac6abaf9ca` | `pnpm exec vitest run src/test/simulation-migration.test.ts src/test/simulation-repositories.test.ts` (54 passed), `pnpm lint`, `pnpm typecheck`, `pnpm test` (44 files / 557 tests passed), `pnpm build`, and `pnpm test:e2e` (6 passed using existing Chromium). Actual v1 fixture upgrade/reload preserves selected club, 2-1 journal entry, EUR15,000 ledger, original nulls and raw legacy/sandbox modes; four simulation stores stay empty. Frozen schemaV1, generator v1, dependencies and lockfile unchanged. Contract choices: 200-character logical keys, 512-character fingerprints, uint32 event seeds and 1-32 typed outcome refs (campaign/season/club/player/boundary); identity keys/root seed stay fixed. Direct repository transactions compose atomically with commands by preserving the async callback in runInTransaction. No new-career UI or simulation command. |
| `P07-G03` | `54ae37b5e65cea4e282cb646b9e2a3d84d19a88e` | `pnpm exec vitest run src/test/simulation-calendar.test.ts src/test/simulation-random.test.ts src/test/dates.test.ts` (3 files / 104 passed), `pnpm lint`, `pnpm typecheck`, `pnpm test` (46 files / 647 passed), `pnpm build`, and targeted Prettier checks passed. Reviewed explicit 2026 July 1 -> August 31 -> September 1/Phase 8-stop fixtures: previews leave state/season unchanged, expose source/target keys and stable seeds, and close logical summer readiness after deadline consumption. Leap/century arithmetic, supported-year bounds, invalid season/date/phase/cursor refusal, JSON key ambiguity, independent named streams, pinned version-1 seed/draw fixtures, ID-remap/audit-time independence and absence of ambient clocks/randomness/persistence are covered. Database contracts, generator v1, dependency graph and browser UI unchanged; G03 does not require browser tests. |
| `P07-G04` | `040a14300067514ec84ec47dba371dda5bf1e631` | `pnpm exec vitest run src/test/generate-playable-world.test.ts src/test/player-ability.test.ts src/test/generate-world.test.ts` (3 files / 17 passed), `pnpm lint`, `pnpm typecheck`, `pnpm test` (48 files / 658 passed), and `pnpm build` passed. Generator v2 builds a deterministic 4-league, 72-club world with complete squads, contracts, registration inputs and finite club transfer balances. The same seed repeats; another campaign id remaps persistence ids only; another year changes contract dates only. Generator v1, schema v1, packages and the legacy demo identity stay unchanged. This generator does not create careers, matches or receipts. |
| `P07-G05` | `df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3` | `pnpm lint`, `pnpm typecheck`, `pnpm test` (49 files / 665 passed), `pnpm build`, and `pnpm test:e2e` (6 passed) passed. A Balanced Challenge career starts on 2026-07-01 with one opening allocation, a fixed club, and a retry that does not rebuild the world. Conflicting settings, the legacy demo id, a missing club, and an injected write failure leave no partial save. Sandbox policy edits do not post a second allocation. Standalone match, negotiation, player, contract, ledger, club-switch, and Challenge constitution writes are refused; the legacy demo can still record a match. Browser pass: Harbor Challenge, seed browser-career-2026, year 2026, Ashford, survived reload with squad 36, contract rows, €5,000,000 capacity, locked Challenge rules, no manual match or negotiation forms, and registration drafts prefilled without saving rows. The fictional demo match form stayed available. |
| `P07-G06` | Pending                                    | Not run                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `P07-G07` | Pending                                    | Not run                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Handoff to Phase 8

Phase 8 may rely on versioned complete standalone worlds, explicit mode/policy guards, a deterministic game clock at kickoff, stable keys and scoped receipt/transaction patterns.

Phase 8 must add fixture/result/appearance stores through a later migration, legal match selection and the shared instant engine. It must not populate legacy MatchRecord rows for AI games or reinterpret historical manual logs as simulated results.

The remaining former companion Phase 7 deliverables are reassigned: common performance aggregation/review belongs to Phase 8, rollover/newgens to Phase 10. New manual correction work is deferred; it cannot edit simulated outcomes. Future scouting/import/PWA phases are now 11/12/13 and are not yet implemented.
