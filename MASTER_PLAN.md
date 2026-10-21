# TOUCHLINE OS — MASTER IMPLEMENTATION PLAN

> **Document type:** Authoritative product and engineering plan
> **Product:** Touchline OS (working name)
> **Product choice:** **Standalone Sporting Director Sim**
> **Target:** Offline desktop application: Tauri 2 + React/Vite UI + Rust game backend + SQLite
> **Status:** Web implementation complete through P07-G05; native bridge NM-G01–NM-G06 implemented, cutover gate pending
> **Plan version:** `3.0.1` (product release target remains v1)
> **Last revised:** 2026-10-21
> **Execution chain:** master → active phase → guide → one reviewed Git commit per guide

## 0. HOW AN AI CODING AGENT MUST USE THIS FILE

This is the source of truth for current scope, data semantics, invariants, milestone order and release gates. Plan 3.0.0 changes platform/backend at the P07-G05 checkpoint; the standalone game-design decisions from 2.0.0 remain. Plan 3.0.1 / DEC-003 removes compatibility with previous TypeScript business logic as a requirement. Native correctness, deterministic execution and the intended product rules govern remaining implementation; historical parity instructions in pending guides are superseded. Existing save-data preservation remains in scope.

### Hierarchy and execution

1. `MASTER_PLAN.md` — product and architecture contract.
2. `plans/native-migration.md` during the bridge, otherwise `plans/phase<number>.md` — active stage contract.
3. The active stage's `guide<number>.md` — executable commit-sized work.
4. Code/tests — implement the contracts above.

Read master and the active bridge/phase plan before a guide. Resolve conflicts by amending the higher-level document before coding. Generate all pending guides for the active phase before implementation. Preserve unrelated user changes; stage only the active guide's files. Do not commit failing required checks or invent completion evidence.

### Current checkpoint and history

- Phases 1–6 and `P07-G01` are completed companion foundations under plan 1.0.0.
- `P07-G02` through `P07-G05` are completed web standalone foundations under plan 2.0.0. Preserve every completed guide file, SHA and recorded check.
- Web checkpoint: `df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3` (G05), followed by evidence commit `7b3c6a0`. New browser careers exist in IndexedDB v2. The native shell, SQLite persistence, pure core foundations, world generation, career preparation, bounded screen reads and migration UI are implemented through NM-G06. Native gameplay writes, career creation persistence, Continue and match simulation remain pending. See the bridge progress log for actual native SHAs, checks and desktop verification limits.
- **Next execution: `plans/native-migration/guide7.md` (NM-G07)**. Phase 7 G06/G07 are blocked until the separate native migration bridge passes. Do not rerun completed guides or reset to an earlier phase.
- Keep completed P07-G01–G05 unchanged. The bridge has NM-G01–NM-G09 with its own plan/guide IDs. After its cutover gate, resume P07-G06 (Rust Continue), then P07-G07 (native foundation certification).
- Superseded companion instructions remain under `plans/archive/companion-v1/`. Superseded plan-2 Phase 7 and pending guides are under `plans/archive/web-standalone-v2/`. Archives are reference only.
- Future Phases 8–12 retain their gameplay/analytics/import outcomes but execute on Rust/SQLite. Phase 13 becomes desktop release hardening.
- Legacy and standalone saves both remain supported. Migration changes storage/ownership of logic, not campaign mode or game history.

### Engineering rules

- Authoritative domain logic is pure Rust in `game-core`; no Tauri, SQL, filesystem, ambient clock, browser or network dependencies there.
- Rust application services own validation, policies, revisions, receipts and transactions. React handles presentation/form drafts and calls a typed GameClient.
- TypeScript business logic is a reference and browser migration path, not an authority for native behavior. Native code may correct or simplify previous logic without matching its outputs or bugs. Do not maintain two production gameplay engines.
- Use one native DB adapter: SQLite through rusqlite. Dexie v1/v2 remain intact for reading/exporting browser saves; never replace the source browser data during migration.
- Native dependencies are explicitly authorized by these guides. Verify compatible stable versions when introduced, pin Rust tooling and commit both lockfiles. Preserve existing frontend versions unless a documented native compatibility issue requires a change.
- One guide = one logical commit. If too large, split pending work in master/phase first; never rewrite completed guide identities.
- A docs amendment does not claim native implementation or runtime verification. Record actual checks and limitations.

### Planning paths

```text
MASTER_PLAN.md
DECISIONS.md
plans/phase1.md ... phase13.md
plans/phase7/guide1.md ... guide5.md    # completed, unchanged
plans/native-migration.md
plans/native-migration/guide1.md ... guide9.md  # prerequisite migration bridge
plans/phase7/guide6.md ... guide7.md            # resume only after NM-G09
plans/archive/companion-v1/
plans/archive/web-standalone-v2/
```

Guide numbers restart per stage; use P07-G06 and bridge IDs NM-G01. The bridge is the explicitly authorized prerequisite between P07-G05 and P07-G06, not a new gameplay phase. Future phase plans are generated only when their phase is ready.

---

## 1. PRODUCT DEFINITION

### 1.1 One-line pitch

**Touchline OS is an offline-first standalone sporting director game: build a squad, negotiate transfers, satisfy board philosophies, simulate a fictional football world, and grow a club across seasons.**

### 1.2 Primary user and setting

- A player seeking short sessions of squad building, recruitment and financial decisions, with instant match results.
- A reviewer installing the desktop demo and starting a fictional career without accounts or external services; a lightweight website can explain and distribute the game.
- A tinkerer importing a personal or appropriately licensed dataset locally, with explicit simulation assumptions for missing inputs.

### 1.3 Core loop

1. Create a seeded world, select a club and choose a Challenge preset or Sandbox.
2. Review board expectations, available transfer funds, wages, squad availability and upcoming events.
3. Scout, shortlist and negotiate with AI clubs and players; validate decisions against board policies.
4. Register players and prepare a legal XI, bench and tactical roles.
5. Click **Continue** to reach the next decision or **Sim Matchday** to calculate instant results for all four leagues.
6. Review the score, xG, timeline, ratings, minutes, fatigue, injuries, standings and resulting offers.
7. Complete the season, settle prizes/objectives once, develop players and begin the next season with an explicit budget.

No external football game is required. AI clubs are deterministic local algorithms; no LLM or hosted AI service is involved.

### 1.4 Success criteria

- A desktop user starts a playable fictional campaign with no authentication or dataset upload.
- One complete season and the beginning of a second season can be played offline after desktop installation.
- Tactical selection, squad depth, recruitment and board rules materially affect decisions and simulation inputs.
- The same saved state, simulation version and player decisions produce the same outcomes, including after restore.
- AI clubs obey finite transfer and wage budgets and preserve legal player ownership/contracts.
- A failed or repeated command never leaves partial results or duplicates money, minutes, growth or progression.
- Save export/restore preserves history, pending negotiations and the same future simulation.
- Existing legacy campaigns are preserved without fabricating missing competitive history.

### 1.5 Scope choices and non-goals

**Initial release defaults:** instant results only; lightweight fatigue/sharpness, injuries lasting 7–28 game days and simple match bans; Board Philosophies / Challenge presets with editable Sandbox.

In scope: four independent fictional leagues, 18 clubs each; double round-robin schedules; one managed club; automatic substitutions; deterministic transfer decisions and player progression.

Out of scope for v1:

- Interactive live ticker, pause/resume match management, live tactical changes, 2D/3D match animation or physics.
- Cups, continental competitions, promotion/relegation, club switching during a standalone career, staff hiring, agents, morale systems or manager dismissal.
- Detailed commercial income, debt/FFP, weekly payroll cash accounting or replication of official league regulations.
- Scraping commercial databases, console saves or external games; automatic two-way game integration.
- Remote backend servers, accounts, cloud saves, multiplayer, subscriptions or real-money mechanics. The local Rust backend is in scope.
- A second playable web edition, WASM/OPFS persistence, Drizzle, paid model APIs, hosted LLMs or exposed secret keys. A shared WASM core is a later decision; desktop is primary.

The SVG board supplies tactical decisions to the match engine. A simulated result is an outcome in this game, never a claim about a real match.

---

## 2. NATIVE TECHNICAL DECISIONS

| Area                      | Decision                                                                                         | Constraint                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Desktop shell             | Tauri 2; Windows first                                                                           | Retain Vite frontend; cross-platform release claims require actual platform tests                         |
| UI                        | React + TypeScript, existing router, styles, SVG and tables                                      | No UI rewrite or framework swap                                                                           |
| Game core                 | Pure Rust `game-core` crate                                                                      | Rules, money, calendar, generation and future simulation; no persistence/Tauri dependencies               |
| Application layer         | Rust `game-app` crate                                                                            | Typed queries/commands, policies, idempotency, revision checks and transaction orchestration              |
| Persistence               | SQLite using rusqlite with bundled SQLite and backup support                                     | One Rust-owned connection worker; no frontend SQL API                                                     |
| Storage layer             | Rust `game-store` crate                                                                          | Scoped repositories, indexes, foreign keys, migrations, import and consistent backups                     |
| IPC                       | Tauri commands; serde wire DTOs; generated TypeScript using ts-rs                                | Runtime Rust validation is mandatory; generated types alone are not validation                            |
| Frontend API              | `GameClient` plus native invoke adapter                                                          | Replace concrete Dexie provider/repository use in UI                                                      |
| Validation                | Rust trust-boundary/domain validation; Zod for browser export and forms                          | Preview and commit share authoritative Rust policy code                                                   |
| Background work           | Dedicated DB worker; CPU work on blocking/worker tasks                                           | Async alone is insufficient for CPU-bound work; never block the UI or hold transactions during simulation |
| Progress                  | Typed ordered channels for long operations                                                       | Progress is not authority; only committed results become visible                                          |
| Native files              | App-local data directory; native dialogs and scoped file access                                  | Stable bundle identifier; distinct dev/test paths; no save DB in install assets                           |
| Versions                  | Application, SQLite schema, export format, generator, calendar and simulation tracked separately | Preserve supported old behavior or apply an explicit tested migration                                     |
| Tests                     | Cargo core/SQLite tests; existing Vitest/React tests; native E2E                                 | Mocked invoke/browser tests do not certify a desktop DB                                                   |
| Desktop E2E               | WebdriverIO with official Tauri service/embedded driver, configured after core integration       | Test-only instrumentation excluded from release builds                                                    |
| Delivery                  | Native installers; optional signed updater                                                       | Gameplay offline; updates must not silently invalidate saves                                              |
| Browser compatibility     | Frozen existing app plus migration-export route                                                  | No native fallback to Dexie; no ongoing dual-write synchronization                                        |
| Data visuals/UI libraries | Keep current frontend; add planned charting/accessibility libraries only in their phase          | Preserve unrelated package versions                                                                       |

Use serde/serde_json, ts-rs and rusqlite in the native workspace. Verify current APIs/features and pin versions at implementation; do not invent package versions. No SQL server, ORM, HTTP service or LLM is required.

### 2.1 Platform, files and save safety

- Windows is the first tested native target, matching the development environment. Rust/MSVC linker, Windows SDK and WebView2 prerequisites are checked explicitly in NM-G02; missing system installation is a prerequisite, not a reason to rewrite the platform.
- SQLite path: `appLocalDataDir()/touchline.sqlite3`. Keep application identity stable. Dev/test runs use isolated paths, never production saves.
- Support all imported legacy and standalone campaign rows. Never assume Chrome/Edge IndexedDB is automatically available in Tauri's WebView.
- Export from the original browser origin, validate and import into desktop. Preserve the original browser DB and file until the desktop save is verified.
- Newer unsupported DB/save/engine versions fail with an actionable compatibility state; never silently downgrade, wipe or regenerate.
- Use a consistent SQLite backup API and tested restore; do not copy a live main DB file while ignoring its journal.
- Native security uses scoped capabilities/CSP and local bundled content. Do not expose arbitrary SQL, filesystem paths or remote command access to UI content.
- A playable browser edition/PWA is not required for desktop v1. Keep a simple portfolio/download website separate from native gameplay.

---

## 3. INFORMATION ARCHITECTURE AND UX

### 3.1 Global app structure

```text
Desktop Welcome / Demo Launcher
  ├─ Play Fictional Demo
  ├─ New Standalone Career (seed, club, Challenge / Sandbox)
  └─ Migrate Browser Save (Native bridge) / Dataset (Phase 12)

Campaign Workspace
  ├─ Command Center — game date, Continue, blockers, inbox, next fixture
  ├─ Squad — contracts, availability, development, performance
  ├─ Tactics — SVG formation, roles, XI, bench
  ├─ Transfers — shortlist, negotiations, incoming offers, completed deals
  ├─ Finance — transfer capacity, club spending limit, wages, ledger
  ├─ Registration — eligibility, homegrown quota, match selection
  ├─ Fixtures & Results — calendar, match reports, league tables
  ├─ Seasons — review, objectives, settlement, next-season preview
  ├─ Scouting — comparisons and Moneyball signals (Phase 11)
  └─ Board Philosophies — challenge rules or Sandbox editor

Global Utilities
  ├─ Campaign Switcher (standalone / legacy labeled)
  ├─ Search / Command Palette
  ├─ Backup / Restore
  ├─ Settings / Accessibility
  └─ Help / Data Provenance
```

Client-side routes work inside the desktop shell and preserve current slugs. Existing route slugs may remain for compatibility; the `/matches` route becomes Fixtures & Results for standalone saves and retains the legacy journal for old saves.

### 3.2 Visual system

- Preserve dark graphite surfaces, restrained amber/teal indicators, dense tables and the SVG pitch.
- Use explicit units and tabular numerals: EUR, EUR/week, dates, minutes, ratings and percentages.
- Blocked / Warning / Informational / Passed are text plus icons, never color alone.
- Instant results show a final score, xG, accessible event list and both teams' player performance. A loading state is not a promise of a live simulation.
- Crests and identities are fictional; no licensed photos, badges or copied rosters.
- Prioritize desktop and landscape tablet; provide usable condensed mobile reports and controls.
- Keyboard operation, visible focus, legible contrast, touch targets and reduced-motion support are acceptance requirements.

### 3.3 App behavior

- Campaign URLs are scoped to `/app/:campaignId/<section>` and guard missing/invalid campaigns.
- Show the game date and the exact next action: Continue, Resolve offer, Select lineup, Sim Matchday or Review season.
- A pending decision shows evidence and a concrete remedy. A match form cannot disable a board rule.
- Challenge policies are locked at the command boundary. Sandbox customization is explicit and audited.
- Prevent duplicate submission; reload on a stale revision. Render results only after successful persistence.
- Preserve clear loading, empty, error, first-run and unavailable-feature states. During staged implementation, label future features as unavailable rather than pretending they exist. Never silently use browser storage when a native service is unavailable.

---

## 4. DOMAIN MODEL AND INVARIANTS

### 4.1 Shared invariants

1. **Campaign isolation:** all owned rows and writes carry and validate `campaignId`.
2. **Stable identity:** entity IDs are independent of names. Simulation keys and event seeds survive restore ID remapping.
3. **Money:** EUR only; nonnegative integer cents at boundaries. Typed ledger kinds express direction.
4. **Time:** game dates are `YYYY-MM-DD`; audit timestamps are UTC. Real-world time never advances a campaign. Creation takes an explicit in-game start year.
5. **Age:** use DOB or reported age + reference season; estimated age stays labeled. Never turn generated or inferred DOB into imported fact.
6. **Unknown is not zero:** preserve source data and missing values. Simulation requires complete inputs or a separately labeled generated profile; legacy statistics remain incomplete where appropriate.
7. **Authority:** user confirmation authorizes a bounded action and its autonomous consequences. Previews and loading a screen do not write gameplay state.
8. **Auditability:** persisted gameplay changes have operation receipts and concise audits. Financial history uses compensating entries.
9. **Determinism:** explicit seed, versions, ordered inputs and decisions; no network, ambient clock or `Math.random` in domain code.
10. **Provenance:** distinguish original fictional/imported/user-entered data from generated profiles and simulated outcomes.
11. **One canonical result:** one completed result per fixture and one appearance per fixture/player. Legacy journal entries never enter standalone standings.
12. **Atomic progression:** Rust services commit results, appearances, availability, finances, receipt and time pointer together for each bounded event in SQLite.
13. **Compatibility:** browser-to-native import and SQLite upgrades preserve legacy/standalone modes, identities and history; migration never silently promotes a manual save.

### 4.2 Existing entities retained

These are domain contracts, not literal Dexie store declarations. Existing IDs and historical rows remain valid.

| Entity                             | Standalone treatment                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Campaign`                         | Retain kind/seed/generatorVersion/managed club/active season/revision; add `mode: legacy \| standalone` and `rulesMode: challenge \| sandbox`, separate from dataset kind |
| `Season`                           | Retain ordinal/status; standalone dates are explicit July–June, exactly one active season                                                                                 |
| `League` / `Club`                  | Retain identities, colors, prestige and academy tier; leagues remain independent                                                                                          |
| `Player`                           | Retain source identity, attributes, potential and value; no unsourced imported data overwrite                                                                             |
| `Contract`                         | Both clubs' transfers and player consent are represented; exactly one active contract per owned, active standalone player                                                 |
| `Constitution`                     | Versioned rule snapshot; Challenge locks it, Sandbox allows audited edits                                                                                                 |
| `LedgerEntry`                      | Append-only typed money effects; awards identify the earning season and settlement                                                                                        |
| `Transfer`                         | Completed world moves only; buyer and seller are explicit, never an unconfirmed proposal                                                                                  |
| `Offer`                            | AI incoming bid with origin, deadline, qualification snapshot and resolution; extend the legacy shape through migrations when needed                                      |
| `Lineup`                           | Reusable planning artifact; selected snapshot validated again at kickoff                                                                                                  |
| `Registration`                     | Competition-scoped eligibility; generated players have explicit fictional homegrown metadata                                                                              |
| `MatchRecord` / `Appearance`       | Historical manual journal; remain legacy-only, with their existing units and nullability                                                                                  |
| `ShortlistItem` / `ScoutingReport` | Retain target tracking and evidence; simulated records are labeled                                                                                                        |
| `DevelopmentPlan`                  | Target role controls bounded future development; free text alone does not grant growth                                                                                    |
| `AuditEvent` / `ImportReceipt`     | Retain command/import history; add typed action names without deleting old variants                                                                                       |

### 4.3 New simulation contracts

| Entity                                     | Minimum semantics                                                                                                                                                      | First phase |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `SimulationState`                          | Unique per campaign; root seed, simulation/calendar version, current date, active season, lifecycle phase, last consumed boundary key, initialization receipt          | 7           |
| `ClubSimulationState`                      | Club ID, stable simulation key, finite transfer balance and weekly wage budget                                                                                         | 7           |
| `PlayerSimulationState`                    | Player ID, stable simulation key, fitness/sharpness 0–100, goalkeeper rating if GK, injury end date, league ban count, active/retired state, generated homegrown flags | 7           |
| `SimulationReceipt`                        | Unique campaign + logical operation key; input revision/fingerprint, outcome references, persisted event seed/version                                                  | 7           |
| `Fixture`                                  | League/season/round/date, home and away club IDs, stable fixture key, scheduled/played state                                                                           | 8           |
| `SimulatedMatch`                           | Unique fixture reference; score, xG milli-units, event timeline, seed/version and immutable tactical/input snapshot                                                    | 8           |
| `SimulatedAppearance`                      | Fixture/match, player and historical club ID, started/minutes/goals/assists/rating/cards, unique fixture + player                                                      | 8           |
| `Negotiation`                              | Club fee and player terms, deterministic response state, reserved funds, expiry and bounded counteroffers                                                              | 9           |
| `BoardObjective`                           | Immutable season target, reward and evaluated settlement outcome; no dismissal system                                                                                  | 10          |
| `SeasonSettlement` / `DevelopmentSnapshot` | Immutable final table/awards and player before/after progression, uniquely applied per period                                                                          | 10          |

- Keep v1 `Appearance.rating` and simulation ratings on 0–100; a UI may render 68 as 6.8/10 with an explicit scale.
- xG stays integer milli-units, reusing the existing parse/format convention. Do not change legacy units.
- Both teams' simulated appearances are canonical. Use read adapters for common player reports, not duplicate manual match rows.
- Future entities receive SQLite migrations in their owning phase; the native bridge ports only the 23 existing game stores and transport metadata.
- Large world snapshots/results belong in their own stores, not the bounded audit payload.

### 4.4 Native ownership and storage boundary

- `game-core`: domain models, schemas/invariants and pure computations. Port current TypeScript behavior using golden fixtures; all new engine/market/lifecycle work is Rust.
- `game-store`: SQLite mappings for the 23 current game stores, scoped queries, constraints, migrations and consistent backups. Preserve rows and null/optional semantics.
- `game-app`: use cases, fresh-state validation, policy preview/commit, optimistic revisions, receipts and atomic business effects.
- `src-tauri/src`: thin Tauri bootstrap/commands, app paths, file dialogs, ID/time providers and progress transport.
- `src/platform`: generated DTO types and GameClient native adapter. React never receives a connection or arbitrary SQL capability.

Use normalized entity tables with typed IDs, money, dates and queried/indexed fields. JSON columns are allowed for attributes, rule arrays, formations and audit payloads, not one opaque whole-campaign blob. Enforce campaign-scoped references and uniqueness; map enum/field names explicitly.

The frozen Dexie v1/v2 schemas remain migration sources and test fixtures. SQLite starts its own independent schema version 1; it is not Dexie version 3. Later native schema versions are forward migrations with backup and actual upgrade tests.

### 4.5 Browser-to-native save contract

The native bridge migration export is a complete versioned campaign snapshot, not the future CSV/JSON dataset importer.

- Envelope: `format='touchline-campaign'`, `formatVersion=1`, `sourceStorage='indexeddb'|'sqlite'`, source-specific `sourceSchemaVersion`, `exportId`, export timestamp, campaign revision and explicit arrays for all 23 game stores.
- Export one campaign from a consistent readonly IndexedDB transaction. Raw browser schema 1 fixtures normalize only missing mode metadata to legacy/sandbox and supply empty simulation arrays. Existing schema 2 records retain their actual modes.
- Validate envelope, safe numeric ranges, known versions, record counts/limits, IDs, every relationship and supported simulation/generator versions. Missing fields remain null/absent according to their schema; no invented wages, dates, fixtures or contracts.
- Import preserves IDs, revisions, seeds, logical keys, receipt fingerprints and audit strings. It never reruns generation or policies to reconstruct saved rows.
- Import is one SQLite transaction. A separate transport import receipt records source-file digest and outcomes; do not fabricate gameplay audits or increment campaign revision merely to change storage.
- Same-file retry is harmless, including after the imported game has progressed. A colliding campaign ID with different source content is refused; overwrite and duplicate-as-new with ID remapping are deferred to Phase 12.
- Browser data is never deleted or modified by desktop import. Verify imported counts/balances and reopen before the user retires the source.
- NM-G01 adds browser export/fixtures; NM-G03 implements SQLite import, native snapshot export and consistent backups; NM-G06 connects native dialogs/UI. IndexedDB source versions 1/2 and SQLite source version 1 are distinct supported origins. Phase 12 expands formats, remapping and dataset readiness.

### 4.6 Determinism and engine upgrade protocol

- Keep root seeds, generator v1/v2, simulation/calendar version 1 and stable logical keys unchanged across this port.
- Native PRNGs, stream identities and fingerprints must be explicit, deterministic and tested, including Unicode seeds and ordered inputs. They need not reproduce previous TypeScript draws, worlds or fingerprints. Imported stored fingerprints and seeds remain unchanged data.
- Historical TypeScript golden fixtures are optional reference evidence. Native tests assert product invariants, integer arithmetic, valid dates, policy decisions, legal worlds and reproducibility; old-output equality is not an acceptance gate.
- Persist integer cents in checked i64; IPC/JSON numeric values remain within the JavaScript safe-integer range. Reject overflow and unsafe transport values; do not silently round a save.
- Derive independent world/fixture/market/development streams from seed + pinned version + stable logical keys, excluding remappable IDs and audit time.
- Compute outside the short commit transaction; recheck revision, source date/cursor, ownership, policy and logical receipt on write. Matching retries return the original outcome without a new revision or audit.
- Application update, SQLite schema, save format, generator, calendar and simulation versions are independent. A new binary does not authorize rerunning historical results.
- Preserve supported engine versions for existing saves or provide an explicit tested forward migration for future events. Never silently switch balance rules or claim Rust alone guarantees save compatibility.

---

## 5. BOARD PHILOSOPHIES, CONSTITUTION AND FINANCE

### 5.1 Design principle

Reuse `evaluateAction` and its explainable BLOCK/WARN/INFO reports. Preview and commit evaluate the same policy against fresh authoritative state. Add action variants for window close, matchday selection and settlement in their owning phases; do not scatter rule checks into components.

Challenge mode locks the chosen board policy through command checks. Sandbox exposes the existing audited editor. Switching a Challenge career to Sandbox, if offered, is explicit, irreversible for that career's challenge status and audited; silently toggling a rule is prohibited.

### 5.2 Rules and gameplay semantics

| Rule                 | Retained setting                                                                   | Standalone enforcement                                                                   |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `SELL_TO_BUY`        | Balanced: sales 70%, prize 100%; explicit opening allocation and carryover percent | Incoming deal cannot exceed policy capacity or actual club spending limit                |
| `MAX_SIGNING_AGE`    | Balanced age 26; configurable free-transfer exemption                              | Incoming transfer preview and settlement                                                 |
| `WAGE_TIER_CAP`      | Key / Rotation / Youth caps; Balanced EUR45k / EUR20k / EUR5k per week             | Contract offer and execution; club-wide wage budget is a separate finite ceiling         |
| `PRESTIGE_BID_SALE`  | Balanced ratio 3/2 and strictly higher prestige; Strict retains ratio 2/1          | Qualifying rejection, window close and season rollover block until a valid sale resolves |
| `REGISTRATION_QUOTA` | Balanced roster 25, minimum 8 homegrown, under-21 exemption                        | Registration and actual kickoff eligibility; injuries and bans checked separately        |

Existing Strict/Balanced presets remain starting configurations, not claims of official football rules. Newly generated worlds must be able to satisfy them through legal selections and recruitment.

### 5.3 Financial semantics

For managed club C in season S, all amounts are integer cents:

```text
authorizedCapacity = initialAllocation
                   + floor(completedPlayerSales * salesReinvestmentPct / 100)
                   + floor(postedPrizeIncome * prizeReinvestmentPct / 100)
                   + approvedCarryover

remainingTransferCapacity = authorizedCapacity - completedIncomingTransferFees
spendableForDeal = min(remainingTransferCapacity, availableClubTransferBalance)
```

- New seasons receive an explicit board allocation, not a side effect of saving the constitution. Legacy behavior remains compatible.
- Incoming fees debit the buyer and credit the seller once. A reservation reduces availability while a negotiation is open and is released or consumed once.
- Only completed deals and settled awards affect credits. Speculative offers never finance a signing.
- Wage commitment is the sum of active weekly contracts. Compare it with tier caps and the club weekly wage budget; v1 does not debit weekly payroll from transfer capacity.
- Sandbox may change board rules, but normal transactions still require finite club funds and valid ownership. Any Sandbox budget adjustment is explicit and audited.
- Free transfers have zero fee, not zero wages. EUR is the only campaign currency.

**Award timing contract:** a `SeasonSettlement` records prizes and objective bonuses earned in the closing season. Their cash and `prize_income` ledger entries are credited to the **new season**, effective on its July 1, with earning-season and award-kind metadata. Apply `prizeReinvestmentPct` there once. The closing ledger receives no duplicate prize credit.

`approvedCarryover = floor(max(0, closingRemainingCapacity) * carryoverPct / 100)`. Closing capacity excludes the awards that will be credited to the new season. Settlement posts carryover, new board allocation and award credits once, with independent identities; repeated rollover cannot repeat any of them. No award is counted both in carryover and in new-season prizes.

### 5.4 Mandatory offers and deadlock prevention

- AI incoming bids are affordable and include pre-agreed player terms. Reserve buyer funds so Accept can complete the sale; unreserved speculative interest cannot become compulsory.
- Store fee, value and both prestige values at offer creation. Qualification uses that immutable snapshot and the board rule version, not a fluctuating current valuation.
- Allow at most one open compulsory bid per player. On transfer, competing offers for that player become superseded and release reservations.
- A compulsory offer remains actionable until resolved. It cannot expire or be withdrawn to bypass a window-close blocker; the engine must not generate an impossible compulsory sale.
- Other bids may expire by game date. An accepted, rejected, expired, withdrawn or superseded bid cannot block progression.
- Pure preview and commit use the same qualifying-offer definition. Sandbox changes to policy are audited; Challenge cannot remove the obligation through a hidden alternate command.

### 5.5 Registration and incomplete data

Generated profiles carry explicit fictional homegrown/eligibility data. Imported unknowns remain unknown until the user supplies data or explicitly accepts generated simulation metadata. Never count unknown as homegrown.

Kickoff validates a legal selection, registered or age-exempt players, active ownership/contracts, a goalkeeper and availability. A reusable planning lineup may be incomplete; that does not authorize a match. Define a deterministic AI emergency selection/recruitment policy and test it, rather than allowing a save to become permanently stuck.

---

## 6. DATA PIPELINES AND PLAYABLE WORLD

### 6.1 Loader A — versioned fictional world

Retain the deterministic 4-league / 72-club / 3,000-player generator framework. Native generator v1 produces legacy demo data and v2 produces playable worlds. Each native version is reproducible; DEC-003 does not require previous JavaScript outputs. Import existing saved rows directly without regeneration.

- Four independent leagues of 18 clubs; fictional players, names and crests.
- Preserve the total of 2,880 owned players and 120 free agents; improve squad composition, not the scale.
- Every club has at least two goalkeepers and positional coverage for a legal supported formation and bench.
- Generate ability distributions related to club prestige; potential is at least current role-weighted ability. Values and wages follow declared, versioned formulas using ability, age and potential, with bounded seeded variation.
- Six existing attributes remain. A separate declared goalkeeper rating in the simulation profile avoids treating outfield finishing as goalkeeper quality.
- Owned active players receive exactly one complete contract: wage, tier and expiry. Free agents have no active contract.
- Every club has a finite transfer balance and weekly wage ceiling; initial contracts fit that ceiling. The selected challenge has a feasible starting registration and XI.
- Standalone calendars start July 1 of an explicit year. Root seeds are user supplied or explicitly generated at the native application boundary and then persisted; audit time does not select world content.
- The playable demo has a separate campaign identity from the existing legacy demo. Reset acts on the selected demo only.
- Rust world computation/validation precedes one atomic SQLite creation transaction. No partially initialized save is listed as playable.
- Featured gameplay history is produced by the engine or explicitly labeled scripted tutorial state; do not mix authored legacy scores into a competitive table.

### 6.2 Loader B — local CSV/JSON import (Phase 12)

The general dataset importer is planned, not implemented at the pivot checkpoint. Phase 12 uses Rust background parsing and native file selection, retaining field mapping, sample preview, units, row limits, source labels, safe staging and receipts. The bridge's browser-save exporter is a separate compatibility path. No hosted proprietary player data or automatic licensing assertions.

An imported dataset does not necessarily describe a playable world. Before career creation:

1. Validate club/league mapping, competition sizes, legal squads, contracts, attributes, finances and registration inputs.
2. Preserve unknown original values. Show which simulation fields are missing.
3. Let the user supply values or explicitly accept a reproducible generated simulation profile/world completion with separate provenance.
4. Use 18-club leagues for v1; explicitly complete a partial league with fictional clubs or refuse playable creation. General arbitrary competition formats are deferred.
5. Preview all additions and assumptions before committing a new standalone campaign.

Imported data may remain a non-playable preview until requirements are met; never claim sparse identity-only rows are simulation ready. Existing legacy campaigns are not automatically converted. Target 25,000 imported players with measured reference-hardware results in Phase 13.

### 6.3 Academy, retirement and development (Phase 10)

Newgens in standalone careers are real fictional gameplay participants. Generate and offer academy intakes for every club, using academy tier and stable season keys; acceptance/promotion establishes an actual contract and roster place through the same eligibility rules.

Replace the companion-only optional planning-candidate workflow for standalone saves. Import-created careers disclose fictional replenishment during setup; it cannot be silently presented as real-world data. Legacy saves retain historical behavior.

Bounded role-targeted development uses age, potential, simulated minutes and development plans at midseason and season end. Split an annual growth budget across these checkpoints; do not automatically add 1–4 twice. Age-related decline is position-aware, and retirement plus youth intake maintain a playable world over multiple seasons.

---

## 7. FEATURE CONTRACTS

### 7.1 Campaigns, clock and command center

- New Standalone Career selects seed, start year, club and Challenge/Sandbox; legacy saves remain labeled and openable.
- `Continue` advances to the earliest due decision boundary, never the browser clock. Show current date, next event, progress and blockers.
- Calendar v1: July 1–June 30 seasons; summer transfers July 1–August 31; winter transfers January 1–31; league round 1 September 1, then 33 weekly rounds. This is a fictional game calendar, not a real league schedule.
- Same-day order: user-required decisions and deadline guards → closing/opening window transitions → kickoff/results → post-match recovery/development boundaries. Contract expiry and year-end settlement are handled before next-season initialization.
- Market ticks and recovery intervals use game dates and stable event keys. A command stops at the first unresolved decision or unsupported handler.
- After the migration bridge, Phase 7 G06 Rust Continue stops at the first league kickoff with `Match simulation arrives in Phase 8.` No fixtures or results exist yet.
- Phase 8 permits playing all 34 rounds and reviewing the final table; rollover remains unavailable until Phase 10.

### 7.2 Squad, contracts and development

Retain searchable/sortable squad tables, profiles, wage pyramid, contracts and development plans. Add fitness/sharpness, injury return, league bans, role fit, simulated minutes and development history.

Player metadata correction is legacy-only; Sandbox editing, if later exposed, uses a separate audited command. Challenge users cannot manufacture attributes, values or money through existing forms. Contract expiry/renewal and retirement are simulated in Phase 10. All generated first-season contracts run at least to June 30 so intermediate milestones do not expire players without a handler.

### 7.3 Tactical decisions and selection

Keep SVG formations `4-3-3`, `4-2-3-1`, `4-4-2` and `3-5-2`, named lineups and keyboard/touch assignment. Define documented role/position weights and out-of-position effects; use the same ability functions for generation, selection and simulation.

At kickoff require 11 eligible starters including a goalkeeper, unique bench selections and available players. AI clubs choose legal lineups with deterministic tie-breaking and fatigue-aware rotation. Automatic substitutions use a documented policy; the instant result cannot accept mid-match manual changes.

### 7.4 AI transfer market and negotiations

During windows, AI clubs evaluate positional shortages, player age, affordability and team strength, and generate bounded incoming bids or AI-to-AI deals. Actual simulated form may influence demand once available; no invented performance data.

Incoming purchases require board approval, selling-club agreement and player agreement on wage, role and term. Use deterministic valuation/willingness formulas, bounded counters, deadlines and budget reservations. Repeating an identical proposal does not reroll acceptance.

One settlement command updates ownership, both clubs' finances, old/new contracts, registrations, affected lineups, offers, receipt and audit atomically. Retain the existing manual transfer commands only for legacy saves. AI clubs cannot sign indefinitely or send unaffordable binding offers.

### 7.5 Registration and availability

Use the existing quota engine with generated fictional eligibility. Matchday validation also checks actual registration, contract, injury and suspension status. Lightweight fitness and sharpness influence performance and injury risk; they are not medical predictions.

Injury duration is 7–28 game days; recovery uses game-date differences. A straight red creates a one-league-match ban for v1. The ban applies starting with the next fixture; serving a ban and receiving a new one cannot cancel each other. More elaborate disciplinary accumulation is deferred.

### 7.6 Fixtures, match reports and seasons

- Generate 34 rounds per league: 9 fixtures per round, 306 per league, 1,224 across four leagues. Each pair meets once at each ground.
- One Sim Matchday command handles all 36 fixtures in that round. AI results use the same core engine as the managed match.
- The pure seeded engine computes chances/xG, goals, timeline, appearances, ratings and availability effects from tactical strength, attributes, fitness and home advantage. Publish formulas as gameplay heuristics.
- Scores equal goal-event totals; scorer/assist/minute/card records reconcile. An own-goal representation must be explicit if supported. A precomputed final score is not an independent second source of truth.
- Derive standings: 3 points for win, 1 for draw; order by points, goal difference, goals scored, then stable club simulation key. Show this fictional tiebreak rule.
- Historical lineups/club identity and performance survive later transfers and growth.
- Simulated results are immutable. Legacy journal corrections, if provided, cannot change standalone fixtures, finances or standings.
- Phase 10 rollover requires all fixtures resolved, obligations cleared and an explicit review/preview/confirm. Settle awards, contracts, growth, academy and next-season data once.

### 7.7 Moneyball analytics and scouting (Phase 11)

Retain age/minutes scatter, wage pyramid, six-attribute radar, transparent archetype scores, comparisons and grounded insight text. Source metrics from canonical simulated history or labeled legacy logs.

No fabricated radar axes or percentiles for missing imported data. Separate goalkeeper-specific evaluation from outfield six-axis comparisons. Cite source records and formula versions; call this Insights or Scouting Signals, not LLM predictions.

### 7.8 Save migration, backup and dataset import

The prerequisite native bridge delivers browser-to-native import, basic complete native snapshots and consistent SQLite backups before Phase 7 G06. Phase 12 expands portable backup/restore, remapped duplicate campaigns and CSV/JSON dataset imports. Each export covers every store implemented at that point, including keys, versions and receipts; future fixtures/offers/development must be added when introduced.

The native bridge import preserves IDs and refuses different-content collisions. Phase 12 restore-as-new remaps IDs while preserving simulation keys, root/event seeds and identical future outcomes. Validate versions, limits, relationships, ownership and source labels before promotion; failed import leaves existing saves intact. Destructive overwrite is out of scope. SQLite backup files are native recovery artifacts, distinct from portable JSON exports.

Use native save paths, disk/permission errors, backup reminders and recovery controls, with no telemetry by default. Import/export is not available merely because the data model contains an ImportReceipt.

---

## 8. TECHNICAL ARCHITECTURE / REPOSITORY SHAPE

```text
src/
  app/ components/ features/ styles/       # existing React UI
  platform/
    game-client.ts                        # application-facing query/command interface
    native-client.ts                      # typed invoke transport
    browser-client.ts                     # frozen browser compatibility only
    generated/                            # generated Rust DTO TypeScript
  domain/ data/                           # frozen TS oracle + browser exporter during migration
src-tauri/
  Cargo.toml                              # workspace and desktop package
  Cargo.lock
  rust-toolchain.toml
  tauri.conf.json
  capabilities/
  src/                                    # thin shell, commands, paths and providers
  crates/
    game-core/src/                        # pure Rust models and rules
    game-store/src/                       # SQLite repositories, migration, backup
    game-app/src/                         # application services and typed DTOs
  migrations/0001_initial.sql
  tests/
scripts/
  native-check.mjs
  native-bindings.mjs
desktop-e2e/
compatibility/                            # NM-G01 committed JSON golden fixtures
plans/native-migration/guide1.md ... guide9.md
plans/phase7/guide6.md ... guide7.md
```

New directories are planned, not present at the P07-G05 checkpoint. Preserve the frontend build and established styling/routing.

### Dependency direction

`React → GameClient → Tauri commands → game-app → game-core / game-store`.
game-store may use shared core models; game-core imports neither store nor Tauri. No IPC method exposes arbitrary SQL, raw filesystem access or a mutable database object.

### Threading and write protocol

1. Validate request/DTO and load a consistent scoped snapshot with revision.
2. Perform pure policy/generation/simulation work outside a transaction on a worker appropriate to CPU work.
3. Send a bounded commit operation to the SQLite connection worker; recheck source revision/date/receipt and critical policy/ownership.
4. Commit records, financial effects, receipt and audit in one transaction; increment the campaign revision once.
5. Return the persisted outcome. Progress messages carry no permission to mutate frontend gameplay data.

One worker owns the rusqlite connection and serializes DB operations. Do not hold its connection mutex or a DB transaction while awaiting computation/IPC. Multi-window contention still uses revisions/unique receipts. Cancellation may abort before commit; once commit begins it resolves atomically and UI retrieves the receipt after disconnect/restart.

### Typed contract and test scripts

serde DTOs use documented camelCase fields/tagged results and generated TS bindings via ts-rs. Keep runtime validation in Rust; form Zod schemas do not authorize writes. Return bounded screen projections/paged results, not all 3,000 players on every invoke.

NM-G02 introduces `pnpm tauri dev`, `pnpm tauri build`, `pnpm native:check`, `pnpm native:bindings` and `pnpm native:bindings:check`. Native checks run rustfmt, clippy with warnings denied and locked workspace tests. Binding check generates to a temporary location and compares against committed output without silently rewriting it. NM-G09 adds `pnpm test:desktop` for real packaged application tests.

Existing `pnpm build` remains the frontend build; it is not proof that a desktop installer or Rust database works. Existing Vitest/Playwright tests remain browser/UI compatibility tests; Rust and desktop checks are separate gates.

### Development and release

- Freeze the browser app at G05 plus export/recovery fixes; no new web simulation, service worker or Dexie v3 is required.
- Desktop uses no Dexie fallback or dual writes. Missing native service is an explicit unavailable state.
- Pin native toolchain/dependencies and commit Cargo.lock. Install system prerequisites only through normal authorization.
- Keep logs local and exclude imported private content and debug automation from release artifacts.
- Measure startup, snapshots, generation, IPC volume and later full-world simulation; do not promise speedups without benchmarks.

---

## 9. PHASE EXECUTION ROADMAP

### Historical foundation: Phases 1–6

The entries below preserve completed guide identities under plan 1.0.0. Their original outcomes and non-goals describe the implemented companion foundation; standalone enhancements are forward commits in Phases 7–13. Existing phase1–6 plans are historical and are not regenerated.

### PHASE 1 — Project foundation and visual shell

**Outcome:** A production-buildable, visually distinctive static PWA shell with navigation, testing and quality gates; no fake persistence.

- `P01-G01` — Scaffold Vite/React/TypeScript/pnpm, strict config, lint, format, scripts, README. Commit: `chore(p01-g01): scaffold typed application`.
- `P01-G02` — Install router and create welcome/workspace routes with explicit placeholders and missing-campaign handling. Commit: `feat(p01-g02): add app routing and layouts`.
- `P01-G03` — Build design tokens, typography, dense dark UI primitives and responsive shell. Commit: `feat(p01-g03): establish terminal design system`.
- `P01-G04` — Implement navigable page skeletons, demo landing view and empty/error states (static mock presentation clearly marked). Commit: `feat(p01-g04): build navigable product shell`.
- `P01-G05` — Configure Vitest/RTL/Playwright smoke suites and CI scripts; ensure clean production build. Commit: `test(p01-g05): establish verification gates`.

**Exit:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass; shell navigates; no invented database data shown as real.

### PHASE 2 — Canonical domain, IndexedDB, command infrastructure

**Outcome:** Typed and tested persistence; isolated saves and atomic command scaffolding.

- `P02-G01` — Declare domain type unions, money/date utilities, Zod entity schemas, source provenance fields. Commit: `feat(p02-g01): define canonical domain contracts`.
- `P02-G02` — Create Dexie database v1, indexes and migration discipline; provide typed repositories. Commit: `feat(p02-g02): add versioned local database`.
- `P02-G03` — Implement campaign/season/club/player CRUD repositories and campaign-scoped queries. Commit: `feat(p02-g03): add isolated repository operations`.
- `P02-G04` — Build transaction/command result framework, revision conflict behavior and audit events. Commit: `feat(p02-g04): introduce atomic command boundary`.
- `P02-G05` — Test schema migration baseline, isolation, rollback, ID collisions, query failures and state rehydration. Commit: `test(p02-g05): protect persistence invariants`.

**Exit:** A smoke test creates two campaigns and proves that one campaign's mutations and reads cannot affect the other; rollback and refresh persistence pass.

### PHASE 3 — Fictional dataset, onboarding and save management

**Outcome:** Launch URL boots into a believable fictional save without downloads or accounts.

- `P03-G01` — Implement deterministic PRNG, generators for league/club/player/wage/value/rating, and seed unit tests. Commit: `feat(p03-g01): generate deterministic fictional world`.
- `P03-G02` — Add batch idempotent demo seeding and featured campaign events with progress/recovery. Commit: `feat(p03-g02): provision playable demo campaign`.
- `P03-G03` — Build campaign create/switch/rename/archive and confirmed delete/reset flows. Commit: `feat(p03-g03): manage persistent campaigns`.
- `P03-G04` — Wire dashboard summary from real local records and activity events. Commit: `feat(p03-g04): connect command center to save data`.
- `P03-G05` — Implement onboarding/club selection and e2e tests for refresh, duplicate seed prevention and reset. Commit: `test(p03-g05): validate first-run demo journey`.

**Exit:** Deterministic 72-club/~3,000-player seed; refreshing retains save; demo reset is explicit; user can switch saves.

### PHASE 4 — Squad workspace and 2D tactics planning

**Outcome:** Useful second-screen squad/tactics management.

- `P04-G01` — Player selectors and searchable/sortable squad table, known/missing field handling. Commit: `feat(p04-g01): build squad browser`.
- `P04-G02` — Player profile, manual edits with provenance and development notes. Commit: `feat(p04-g02): add player details and notes`.
- `P04-G03` — Procedural SVG club crests and accessible SVG pitch geometry. Commit: `feat(p04-g03): render generated clubs and pitch`.
- `P04-G04` — Formation presets, assign/swap/bench workflow with mouse, touch and keyboard. Commit: `feat(p04-g04): enable interactive tactical planning`.
- `P04-G05` — Persist multiple named lineups, validate roster consistency, add tactical e2e tests. Commit: `test(p04-g05): persist and validate lineup workflows`.

**Exit:** Can set a lineup, reload it, switch formation, and cannot place a player twice; keyboard operation works.

### PHASE 5 — Club constitution and finance engine

**Outcome:** Enforced differentiator: reproducible rule verdicts and accurate sell-to-buy ledger.

- `P05-G01` — Define constitution presets/settings and pure rule registry, report/verdict types and snapshots. Commit: `feat(p05-g01): introduce explainable policy engine`.
- `P05-G02` — Implement integer-cent ledger, transfer capacity, wage commitment and reversal operations. Commit: `feat(p05-g02): calculate auditable club finances`.
- `P05-G03` — Implement sell-to-buy, age-cap, wage-tier and prestige-offer evaluations with fixtures. Commit: `feat(p05-g03): enforce club constitution rules`.
- `P05-G04` — Build finance dashboard/ledger table/wage pyramid/constitution editor with audit entries. Commit: `feat(p05-g04): expose finances and rule settings`.
- `P05-G05` — Build reusable before/after action preview and blocker/warning UI. Commit: `feat(p05-g05): explain rule impacts before commits`.
- `P05-G06` — Property/integration tests: zero cost, sale allocations, repeated spend prevention, unknown data, reversals, different season. Commit: `test(p05-g06): lock financial policy invariants`.

**Exit:** Same proposed transfer produces same verdict; no overspending via normal command flow; finance figures reconcile exactly.

### PHASE 6 — Transfers, contracts, registration

**Outcome:** Plan, check and record external-game football operations reliably.

- `P06-G01` — Transfer proposals/scenarios and shortlist, without mutating roster. Commit: `feat(p06-g01): plan transfer scenarios`.
- `P06-G02` — Atomic completed incoming/outgoing/free transfer commands with ledger, roster and audit updates. Commit: `feat(p06-g02): record completed player moves`.
- `P06-G03` — Offer inbox, accept/reject actions and prestige rule enforcement. Commit: `feat(p06-g03): manage external transfer offers`.
- `P06-G04` — Contract renewal/tier workflows, active wage totals and hard-tier validation. Commit: `feat(p06-g04): govern contract decisions`.
- `P06-G05` — Registration preset engine, eligibility fields and quota/check screen. Commit: `feat(p06-g05): validate squad registration`.
- `P06-G06` — End-to-end rule examples: failed signing, successful sale-to-buy, rejected qualifying bid, unknown eligibility correction. Commit: `test(p06-g06): verify controlled market workflows`.

**Exit:** Rule bypass is impossible from UI actions; blocked actions do not partially write; completed deals survive refresh.

### PHASE 7 — Standalone foundations, interrupted for native migration

Completed G01–G05 retain their original subjects and implementation evidence:

- `P07-G01` — manual journal; `feat(p07-g01): record played matches`.
- `P07-G02` — Dexie v2 contracts/migration; `feat(p07-g02): introduce standalone save contracts`.
- `P07-G03` — TS calendar/streams; `feat(p07-g03): define deterministic game time`.
- `P07-G04` — playable generator v2; `feat(p07-g04): generate playable club worlds`.
- `P07-G05` — web career creation/guards; `feat(p07-g05): start standalone careers safely`.

**Mandatory order:** P07-G05 → native migration bridge → P07-G06 → P07-G07 → Phase 8.
Do not implement Continue before moving the existing G05 application to Rust/SQLite.

#### Native migration bridge — separate prerequisite stage

Authority: `plans/native-migration.md`; executable files: `plans/native-migration/guide1.md` … `guide9.md`. This stage ports the existing application only; it does not add clock progression or later gameplay.

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

**Bridge exit gate:** intended workflows run through Rust/SQLite in a packaged Tauri app; imported/browser snapshots, valid deterministic native careers, native reopen/backup, command guards and direct-call tests pass. Exact compatibility with previous TypeScript logic is not required (DEC-003). Record bridge SHAs/checks in its own plan. Only then resume Phase 7.

#### Resume Phase 7 after NM-G09

- `P07-G06` — Rust Continue/command-center progression to kickoff. Commit: `feat(p07-g06): advance native careers deterministically`.
- `P07-G07` — Native foundation/clock certification. Commit: `test(p07-g07): verify native standalone foundations`.

**Phase exit:** a native career reaches kickoff exactly once; no match engine yet. Generate Phase 8 plans only after the resumed foundation passes.

### PHASE 8 — Fixtures and instant match simulation

**Outcome:** Play all 34 matchdays, review both teams' performances and league tables, and reach a final-season review without rollover.

- `P08-G01` — Rust fixture/result/appearance contracts and SQLite migrations.
- `P08-G02` — Four double round-robin calendars and deterministic standings.
- `P08-G03` — Shared role strength, AI legal selection and automatic substitution policy.
- `P08-G04` — Pure instant match engine, coherent timeline/xG/ratings and availability effects.
- `P08-G05` — Atomic round simulation, reports, tables and squad performance adapters.
- `P08-G06` — Full-round/full-season Rust/SQLite integration tests and native matchday journey.

Future phase plans must assign one imperative commit subject per guide before execution.

### PHASE 9 — Autonomous market and club/player negotiation

**Outcome:** Windows produce affordable AI bids and AI-to-AI moves; player decisions and board rules govern completed transfers.

- `P09-G01` — Negotiation/offer snapshots, deadlines, reservations and migrations.
- `P09-G02` — AI squad needs, bounded market ticks and valuation formulas.
- `P09-G03` — Selling-club fee and player wage/role/term agreement.
- `P09-G04` — Atomic settlement for both clubs with contracts, finance and selection cleanup.
- `P09-G05` — Incoming inbox, deadline progression and actionable compulsory sales.
- `P09-G06` — Budget conservation, reservation release, duplicate/stale response and deadlock tests.

### PHASE 10 — Player lifecycle and sustainable seasons

**Outcome:** Complete settlement and start a second season without duplicate awards, depleted world squads or expired ownership.

- `P10-G01` — Objectives, award tables, settlement/development receipts and contracts.
- `P10-G02` — Bounded midseason/annual growth, decline and value recalculation.
- `P10-G03` — Renewal, expiry, retirement and academy replenishment for all clubs.
- `P10-G04` — Atomic season settlement, next-season allocation/prizes/carryover and fixtures.
- `P10-G05` — Review/preview/confirm UI, objective outcomes and development history.
- `P10-G06` — Multi-season deterministic, financial-boundary and roster-sustainability tests.

### PHASE 11 — Scouting, comparisons and Moneyball insights

Former unimplemented Phase 8, adjusted to simulation history. Rust computes authoritative analytics/query projections; React retains charts and interaction.

- `P11-G01` — Transparent archetype scores and missing-data confidence.
- `P11-G02` — Radar comparisons and scouting reports.
- `P11-G03` — Age/minutes matrix and development history.
- `P11-G04` — Wage structure and transfer-decision visuals.
- `P11-G05` — Grounded insight feed with source links.
- `P11-G06` — Analytics integrity, accessibility and scalable search tests.

### PHASE 12 — Dataset import and portable campaign backup

Former unimplemented Phase 9, expanded for playable-world validation and deterministic restore. Basic snapshot migration/backup already exists from the native bridge; this phase adds remapping, later-entity coverage and dataset import.

- `P12-G01` — Extend native-bridge versioned export to every later simulation store.
- `P12-G02` — Safe restore/remapping, preserving seeds and future outcomes.
- `P12-G03` — Rust background CSV/JSON parsing, native file selection, limits and malformed-input handling.
- `P12-G04` — Field mapping, units and explicit simulation-profile completion preview.
- `P12-G05` — Atomic/staged imported-career creation and readiness validation.
- `P12-G06` — Cross-version/legacy round trips, deterministic continuation and 25k-row fixtures.

### PHASE 13 — Desktop accessibility, performance and release

Replaces the planned PWA delivery milestone. No service worker/installability work is required for the desktop game.

- `P13-G01` — Production installers, stable app identity, icons and platform prerequisites.
- `P13-G02` — Native save/backup/recovery, migration failure handling and disk/permission UX.
- `P13-G03` — Keyboard, contrast, responsive window layouts and reduced motion.
- `P13-G04` — Profile native generation, IPC, 3k/25k operations, rounds, seasons and multi-seed balance.
- `P13-G05` — Desktop gameplay help, architecture, privacy, signing/update and distribution docs.
- `P13-G06` — Native CI, signed update compatibility where used, installer/upgrade/restore and release certification.

Updater artifacts require signing if updater delivery is enabled. Gameplay remains offline; update checks may be optional. OS signing/notarization and supported-platform claims are tested/documented per target.

**Release:** provide a working desktop demo/download; a playable PWA and WASM port are deferred. Do not claim native, import or gameplay checks passed before implementation.

---

## 10. STANDARD FORMAT FOR EVERY `phase<number>.md`

A phase planner must generate a self-contained file with **all** of these sections in order:

```md
# Phase N — <Name>

## 1. Parent plan contract

- Reference `MASTER_PLAN.md` version and relevant sections; identify completed historical guides separately.
- Identify the roadmap entries `P0N-G01` ... `P0N-Gxx` exactly.

## 2. Phase objective and user-visible outcome

- Explicit working product behavior at phase end.

## 3. Prerequisites

- Which earlier phases/interfaces/tests must already exist.
- Required source files and existing models to inspect.

## 4. In scope / out of scope

- Precise boundaries and deferred features.

## 5. Architecture impact

- Data contracts, repositories, commands, UI and migrations touched.
- Decisions or risks requiring documentation.

## 6. Work breakdown and dependency graph

- Ordered guides; for each: name, goal, expected file changes,
  tests, commit subject, blockers/dependencies.

## 7. Acceptance criteria

- Numbered, observable and testable user behaviors.

## 8. Verification

- Exact native/frontend commands and appropriate desktop/browser flows; failure cases.

## 9. Risks, mitigations, rollback

- What could corrupt data, weaken rules, or cause regressions.

## 10. Exit criteria and handoff

- Required evidence, documentation, and assumptions for next phase.
```

**Phase-generation prompt** (use with the master file in context):

> Read `MASTER_PLAN.md` completely. Generate `plans/phaseN.md` for Phase N only. Preserve the phase roadmap guide IDs and all higher-level architecture/invariants. Expand every guide into commit-sized work with dependencies, files to inspect/touch, testing, acceptance evidence, and one commit subject. Do not implement code yet. Do not introduce future-phase features. If any instruction is ambiguous, document the smallest compatible assumption.

---

## 11. STANDARD FORMAT FOR EVERY `guide<number>.md` (ONE COMMIT)

A guide should be executable by a fresh AI agent that has the repository and master/phase docs, with no reliance on chat memory. It must include:

```md
# PNN-GMM — <Specific deliverable>

## 1. Context and authority

- Master plan version; parent phase; predecessor guide; commit ID.

## 2. Goal and user-observable result

- One narrowly scoped outcome.

## 3. Preconditions

- Branch/working tree assumptions, dependencies, commands to inspect.

## 4. Files to inspect

- Concrete existing paths/interfaces. Never assume an uncreated file exists.

## 5. Files to create/modify

- Estimated paths; precise public APIs/contracts affected.

## 6. Implementation steps

1. Small ordered coding steps.
2. Explicit types, function signatures, data operations and UI behavior.
3. Error/empty/loading paths and important edge cases.

## 7. Tests to add/change

- Named unit/integration/e2e tests and fixtures; negative cases.

## 8. Verification commands

- Exact local scripts available at that phase; expected results.

## 9. Manual acceptance check

- Reproducible click/keyboard steps and expected state.

## 10. Definition of done

- Checklist of code, tests, docs, types, clean diff and no scope creep.

## 11. Commit instructions

- Stage only related files.
- Suggested message: `<type>(pNN-gMM): <imperative summary>`.
- Do not commit on failing checks.

## 12. Handoff

- New APIs, changed constraints, known limitations, next guide needs.
```

**Guide-generation prompt** (use with the master + phase file in context):

> Read `MASTER_PLAN.md` and `plans/phaseN.md`. Generate `plans/phaseN/guideM.md` for commit `PNN-GMM`. Do not write code. Make this one atomic, independently testable change with exact relevant paths, contracts, error cases, tests, verification commands, acceptance steps, and proposed Git commit message. Respect all earlier guide dependencies. Avoid vague instructions such as “add dashboard” without concrete behavior. Do not invent APIs that have not been created; identify prerequisites instead.

### Guide execution protocol

1. Inspect the working tree and existing files/tests. Preserve unrelated user changes and untracked plans; stage only the active guide's files.
2. Confirm predecessor guide's commit exists and tests pass.
3. Implement only the active guide.
4. Add tests for changed behavior and run targeted checks.
5. Run required full checks (`lint`, `typecheck`, `test`, `build`; relevant E2E suites).
6. Inspect `git diff`, ensure no credentials, binaries, datasets, unrelated files, or generated artifacts.
7. Commit with prescribed message; record commit SHA and evidence in the phase progress log or commit body.
8. Continue only after a successful commit.

### Commit discipline examples

**Good:** “Add pure budget calculator and 8 unit tests” → one reviewable commit.  
**Bad:** “Implement finance, scouting and full import UI” → hard to verify/revert.  
**Bad:** “Fix a red test by weakening the rule” → violates the master contract.  
**Good:** If a guide grows too large, split into `P05-G02a` / `P05-G02b` **in the phase plan first**, or renumber the subsequent guides consistently. Do not hide large work in one commit.

---

## 12. TEST STRATEGY AND RELEASE GATES

### 12.1 Mandatory coverage

- Rust core: policy/money/rounding, eligibility/selection, pure dates, deterministic seeded randomness, generators and all future match/market/development formulas. DEC-003 requires native correctness, not previous-logic parity.
- SQLite integration: actual schema upgrades, constraints, scoped references, rollback, revisions, logical retries, deletion scope and consistent backup/reopen.
- Migration: actual browser v1/v2 snapshot fixtures, all 23 source stores, null/optional preservation, no regeneration, import collision/retry/fault behavior.
- Contract/UI: generated DTO freshness, Rust runtime rejection, native adapter errors, mocked GameClient rendering and accessible workflows.
- Native E2E: packaged application creation/import → reopen → selection/board/legacy writes → Continue → close/relaunch; later phases add match/transfer/season/restore journeys.
- Existing browser Vitest/Playwright suites remain compatibility evidence during the port. Mocked invoke or browser-only tests do not certify SQLite/native behavior.

### 12.2 Explicit invariants

1. 70% of EUR10m completed sales yields EUR7m authorized capacity.
2. Age 27 violates enabled age 26; free exemption follows the preset.
3. EUR46k/week violates an enabled EUR45k Key cap; unknown is not zero.
4. Concurrent/stale operations cannot spend the same funds or run an event twice.
5. Ownership, contracts, money, receipt and audit commit together or not at all.
6. Imported nullable/optional values, historical IDs and modes survive storage migration.
7. Fixture/player performance is unique; history never doubles minutes.
8. Settlement/growth/academy/award periods apply once.
9. Failed import/restore leaves existing native and browser saves untouched.
10. All queries/commands validate campaign scope and gameplay mode in Rust.
11. JS/Rust generator v1/v2 and calendar/PRNG/fingerprints match committed vectors, including Unicode and floor/overflow boundaries.
12. Missing scouting data never becomes fabricated measurements.
13. 18-club leagues have 34 rounds/306 fixtures with one home/away meeting per pair.
14. A full-world round commits 36 results or none; retry cannot reroll.
15. Scores/events/appearances/availability reconcile.
16. Enumeration, UI timing, unrelated streams and transport IDs do not alter event outcomes.
17. AI offers remain affordable and compulsory sales are completable.
18. Awards are credited to the opening season once and excluded from closing carryover.
19. Future restore remapping preserves next-event outcomes; initial migration preserves IDs.
20. Challenge protections cannot be bypassed through native or legacy commands.
21. Multi-season squads remain viable across all clubs.
22. Desktop gameplay never writes IndexedDB or accepts arbitrary frontend SQL.
23. Migration preserves original gameplay revisions/receipts; separate transport receipts track import.
24. App update, DB schema and engine/rules version transitions are tested independently; old saves never silently regenerate.

### 12.3 Required checks

Before native workspace exists (NM-G01), use existing scripts and focused exporter/vector tests:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

NM-G02 introduces:

```bash
pnpm native:bindings:check
pnpm native:check
pnpm tauri build
```

NM-G09 introduces `pnpm test:desktop`. Keep Rust formatting/clippy/tests and generated-contract checks in CI. Native prerequisites and packaged-app/manual smoke are recorded honestly; a frontend build or mock cannot replace a failed native check.

For documentation-only changes, run formatting, link/guide/roadmap consistency and preservation checks. No native tests are claimed before native code exists.

### 12.4 Performance and balancing

Phase 13 records named hardware/browser-WebView/runtime and fixed seeds. Measure startup/reopen/import, generation, query/IPC volume, a 36-fixture round, 1,224-fixture season, long saves and 25k imports. Use progress and bounded background work; document actual improvements rather than assuming Rust is faster.

Report multi-seed scores/xG, injuries, transfers and annual growth against declared gameplay targets, not invented real-football facts.

### 12.5 Accessibility and privacy

Keyboard users can create/import/open a native save, select a team, resolve blockers, simulate, review reports and export/restore. Saves stay local; no telemetry, secrets or hosted player database. Native file capabilities, local logs and release test instrumentation are reviewed.

---

## 13. RISKS AND MITIGATIONS

| Risk                                               | Mitigation                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Browser saves are inaccessible from native WebView | Original-origin JSON export, explicit native import; preserve source             |
| Native worlds are invalid or nondeterministic       | Native legality/count/reproducibility tests; explicit generator/simulation versions |
| Rust i64 values lose precision through JS          | Safe-integer transport bounds and checked money arithmetic                       |
| React still mutates Dexie                          | GameClient conversion, no desktop fallback, dependency-boundary checks           |
| Core gets coupled to Tauri/SQL                     | Separate core/store/app crates and dependency tests                              |
| Import reruns history or changes revisions         | Row-preserving transaction and separate transport receipt                        |
| Live SQLite file copy is inconsistent              | Supported backup API, temp snapshot validation and reopen tests                  |
| UI freezes or transaction waits on heavy work      | CPU tasks outside DB worker/short transactions                                   |
| Legacy commands bypass Challenge or lose behavior  | Rust service port, direct-call guards and parity/native tests                    |
| App update breaks saves                            | Independent schema/engine/save versions, backup and actual upgrade tests         |
| Native migration becomes one unreviewable rewrite  | NM-G01–NM-G09 bridge commits; preserve old code as reference until cutover       |
| Game loop expands into live manager                | Instant results/auto-substitutions; live ticker deferred                         |
| World/finance/compulsory offers become unplayable  | Existing legality, budget, settlement and multi-season invariants                |

Rollback uses preserved browser/export files, consistent native backups and compatible forward fixes. Do not wipe sources, downgrade a migrated live DB or reset completed history.

---

## 14. SECURITY, LEGAL AND TRUST

- Local Rust computation and SQLite storage by default; no accounts or remote app-owned backend.
- Treat imports/backups/IPC requests as untrusted: bounded sizes, strings and row counts, schema/relationship checks, no HTML evaluation.
- Ship fictional identities, independently designed SVG crests and no commercial player databases or licensed photos.
- Personal imports remain local; no assertion that personal possession grants redistribution rights.
- Visible product statement: “Independent fictional football simulation; not affiliated with any football game, club or league.” Legacy saves may retain their historical companion label.
- Label simulated outcomes, generated profiles, estimates and imported facts distinctly.
- Bundle native UI assets locally; scope filesystem/IPC permissions and exclude debug automation from release. No exposed API keys, mandatory hosted LLM or telemetry.
- Backups can contain personal notes/imported data; provide sharing guidance without sending them anywhere automatically.

---

## 15. DEMO / PORTFOLIO ACCEPTANCE SCRIPT

At release a reviewer can:

1. Install/open the desktop demo, choose a club and start a seeded Challenge career.
2. Review board rules, finite funds, wage tiers and the game date.
3. See an unaffordable or age-ineligible proposed signing blocked with evidence.
4. Advance to a market decision; receive an affordable compulsory prestige bid with an actionable sale.
5. Accept it, see the completed move and 70% sale credit, then negotiate an eligible replacement with club/player agreement.
6. Register the squad and assign the new signing on the accessible SVG board.
7. Simulate a matchday; inspect score, xG, events, ratings, fitness and all league tables.
8. Reload; the same result exists once and time does not advance on its own.
9. Complete the season, review objectives/development, settle once and see next-season awards and capacity.
10. Export, restore as a separate campaign and verify the same future outcome from identical decisions.
11. Go offline and continue playing in the installed desktop application.
12. Import/open a preserved browser legacy campaign; its manual history and revisions remain intact and have not become a simulated table.

The portfolio story is a playable sporting-director loop whose board rules create meaningful recruitment decisions.

---

## 16. DEFINITION OF DONE FOR STANDALONE v1

- [ ] Historical Phases 1–6/P07-G01–G05 remain intact; native bridge NM-G01–NM-G09, resumed P07-G06/G07 and Phases 8–13 have completed guides and reviewable commits.
- [ ] Native career/demo initialize without login, dataset uploads or network APIs; Rust/SQLite are authoritative.
- [ ] Four leagues complete 34 rounds each with coherent fixtures, results and tables.
- [ ] Selection/roles, availability and automatic substitutions affect documented match inputs.
- [ ] AI transfers/negotiations obey funds, wages, ownership and board rules.
- [ ] Compulsory bids create decisions without impossible progression locks.
- [ ] Player development, expiry, academy and retirement support a second season and tested longer careers.
- [ ] Awards, carryover and opening budgets reconcile without duplicate reinvestment.
- [ ] Save migration, mode isolation, receipts, rollback and deterministic restore have tests.
- [ ] Moneyball, comparisons and insights trace to canonical labeled data.
- [ ] Dataset imports validate playable readiness and preserve unknown source fields.
- [ ] Browser-save migration, complete native JSON backup/restore and packaged offline gameplay work in production.
- [ ] Keyboard, responsive, contrast, errors and storage recovery meet release gates.
- [ ] Documentation distinguishes implemented checkpoints from the final product and records measured performance/balancing.
- [ ] Native build has no secrets, proprietary player data, debug automation or mandatory hosted services.

### Post-v1 candidates

Live fast-forwardable ticker and in-match changes; cups and promotion/relegation; deeper commercial finances; staff/morale systems; local narrative assistance; a shared Rust/WASM browser edition; consented lawful connectors; cloud sync only under a separate architecture decision.

---

## 17. PLANNING CHANGE CONTROL

Material changes require a master version update, a DECISIONS entry, affected pending guides, compatibility/migration tests and explicit implementation status. Preserve completed guide files and evidence.

- DEC-001: plan 1.0.0 → 2.0.0, companion → standalone sim.
- DEC-002: plan 2.0.0 → 3.0.0 at P07-G05, web/Dexie → native Tauri/Rust/SQLite before match-engine implementation.
- DEC-003: plan 3.0.0 → 3.0.1 during NM-G04; previous-logic compatibility is no longer required. Native correctness and determinism govern remaining work.
- Keep standalone game design and Phases 8–12 outcomes. Insert a separate migration bridge before pending Phase 7 G06/G07; update release Phase 13 and preserve completed work.
- The browser remains the migration/export source and optional test reference. Desktop is the primary game; a complete second web edition is deferred. Previous-logic parity is not required (DEC-003).

**Next execution:** `plans/native-migration/guide7.md` after this master, DEC-002/DEC-003 and the bridge plan. P07-G06 is blocked until NM-G09 passes; then implement Rust Continue and P07-G07 certification. Match simulation starts in Phase 8.

---

## 18. NON-NORMATIVE TECHNICAL REFERENCES

Primary documentation supports implementation; it does not override the product contracts.

- [Tauri Vite integration](https://v2.tauri.app/start/frontend/vite/) — retain the current frontend build.
- [Tauri commands](https://v2.tauri.app/develop/calling-rust/) — serde IPC and execution behavior.
- [Tauri channels](https://v2.tauri.app/develop/calling-frontend/#channels) — ordered progress transport.
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) — native platform toolchain.
- [Tauri capabilities](https://v2.tauri.app/security/capabilities/) — native command/plugin access.
- [Tauri desktop tests](https://v2.tauri.app/develop/tests/webdriver/) — packaged application automation.
- [Tauri updater](https://v2.tauri.app/plugin/updater/) — signed update artifacts.
- [rusqlite](https://github.com/rusqlite/rusqlite) — bundled SQLite and backup support.
- [ts-rs](https://github.com/Aleph-Alpha/ts-rs) — Rust-to-TypeScript DTO generation.
- [Dexie reference](https://dexie.org/docs/API-Reference) — frozen source IndexedDB and consistent migration exports.

**END OF MASTER IMPLEMENTATION PLAN**
