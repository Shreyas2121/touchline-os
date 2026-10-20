# TOUCHLINE OS — MASTER IMPLEMENTATION PLAN

> **Document type:** Authoritative product and engineering plan
> **Product:** Touchline OS (working name)
> **Product choice:** **Standalone Sporting Director Sim**
> **Target:** Local-first, offline-capable, installable web app (PWA)
> **Status:** Standalone pivot approved for planning; implementation remains at P07-G01
> **Plan version:** `2.0.0` (product release target remains v1)
> **Last revised:** 2026-10-20
> **Execution chain:** `MASTER_PLAN.md` → `plans/phase<number>.md` → `plans/phase<number>/guide<number>.md` → one reviewed Git commit per guide

## 0. HOW AN AI CODING AGENT MUST USE THIS FILE

This is the single source of truth for current scope, data semantics, invariants, execution order and definition of done. Plan version `2.0.0` replaces the companion product contract; it does not claim the simulator has been implemented.

### Document hierarchy and precedence

1. `MASTER_PLAN.md` — current product contract and architecture.
2. `plans/phase<number>.md` — active phase contract.
3. `plans/phase<number>/guide<number>.md` — executable, commit-sized instruction.
4. Source and tests — implement the contracts above.

Precedence: master → phase → guide → implementation. Amend the higher-level contract before implementing a conflicting requirement.

### Pivot checkpoint and historical documents

- Phases 1–6 and `P07-G01` were completed under plan `1.0.0`. Preserve their commits, implementation evidence and guide subjects. Their companion-only restrictions describe historical work; they do not prohibit the new standalone work.
- `P07-G01` is commit `b5332a73353d5fd83d1258776984d79c1ed586b6`; `e77d9a6` records its progress. Do not reset to Phase 6 or regenerate Phase 1.
- Resume at **`plans/phase7/guide2.md`**, after reviewing the amended Phase 7 plan and `DECISIONS.md`.
- Pending Phase 7 guides are replaced. Their originals and the previous Phase 7 plan are preserved under `plans/archive/companion-v1/` for reference only. Archived instructions are not executable.
- Former future Phases 8/9/10 become Phases 11/12/13. The roadmap below is authoritative; those future phase plans are not yet generated.
- Existing manual campaigns remain usable as `legacy` saves. New gameplay uses `standalone` saves. Maintaining legacy data is a compatibility obligation, not a second product roadmap.

### Rules for agents

- Read the master and active phase before executing a guide. Generate every pending guide in the active phase before starting implementation.
- Work one phase at a time, in order. Each guide is one logical, verifiable commit. Document a split before coding it.
- Keep domain logic pure TypeScript. Components do not write Dexie; commands perform validated transactional writes.
- Preserve installed packages and lockfile; do not add infrastructure or dependencies because a later phase mentions them.
- A planned deliverable is not a completed feature. Record actual commands and results, never invented tests, benchmarks, datasets or football facts.
- Preserve unrelated user changes. Do not stage later guides or untracked plans as part of an implementation guide.
- Never wipe user saves to avoid a migration. Preserve `schemaV1` and generator v1; version additions explicitly.
- Run the active guide's required checks and fix failures before committing.
- Routine unspecified details use the smallest compatible assumption, documented in the active phase.

### Required planning-file paths

```text
MASTER_PLAN.md
DECISIONS.md
plans/
  phase1.md ... phase13.md
  phase1/guide1.md ...
  phase7.md
  phase7/guide1.md        # completed historical guide, unchanged
  phase7/guide2.md ...    # current standalone execution
  archive/companion-v1/   # superseded reference only
```

Guide numbering restarts at 1 per phase. Use qualified IDs such as `P07-G02` and `P13-G01`. Future phase files are generated only when their phase is ready.

---

## 1. PRODUCT DEFINITION

### 1.1 One-line pitch

**Touchline OS is an offline-first standalone sporting director game: build a squad, negotiate transfers, satisfy board philosophies, simulate a fictional football world, and grow a club across seasons.**

### 1.2 Primary user and setting

- A player seeking short sessions of squad building, recruitment and financial decisions, with instant match results.
- A reviewer opening a fictional playable demo without accounts, uploads or external services.
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

- A visitor starts a playable fictional campaign with no authentication or upload.
- One complete season and the beginning of a second season can be played offline after installation.
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
- Backend servers, accounts, cloud saves, multiplayer, subscriptions or real-money mechanics.
- SQLite/WASM/OPFS, Tauri, Drizzle, paid model APIs, hosted LLMs or exposed secret keys.

The SVG board supplies tactical decisions to the match engine. A simulated result is an outcome in this game, never a claim about a real match.

---

## 2. FROZEN TECHNICAL DECISIONS

| Area                   | Decision                                                                                         | Rationale / constraint                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Application            | Vite + React + TypeScript (`strict` mode)                                                        | Fast local development, static deployment                           |
| Persistence            | **IndexedDB through Dexie**                                                                      | Simple browser-native data model; transactions and versioned schema |
| Database upgrade       | Explicit Dexie `version(...).stores(...)` migrations                                             | Never wipe user data during app updates                             |
| Validation             | Zod for imports, persistence boundaries, configuration                                           | Runtime checks outside TypeScript's compile-time safety             |
| Routing                | React Router                                                                                     | Explicit campaign-scoped URLs                                       |
| UI styling             | Tailwind CSS with design tokens/CSS variables                                                    | Dense, consistent dark interface                                    |
| Accessible components  | Radix primitives where needed                                                                    | Dialogs, menus, select, keyboard interaction                        |
| Icons/graphics         | Lucide icons; generated SVG crests and pitch                                                     | No licensed image assets required                                   |
| Data visuals           | Recharts                                                                                         | Age/minutes scatter, wage bars, comparison radar                    |
| Dense tables           | TanStack Table; add virtualization for big result sets                                           | Sorting/filtering with scalable rendering                           |
| Forms                  | React Hook Form + Zod resolver                                                                   | Accessible validation and error states                              |
| UI state               | Local React state; small Zustand stores only for ephemeral cross-screen UI                       | Persistent state lives in Dexie, not duplicate stores               |
| Background work        | Dedicated Web Worker for expensive simulation, import/normalization and analytics where measured | Avoid blocking primary interactions                                 |
| Offline install        | `vite-plugin-pwa` + precached app shell/assets                                                   | No runtime CDN dependency                                           |
| Unit/integration tests | Vitest + React Testing Library                                                                   | Rule, model, command and UI behavior                                |
| E2E tests              | Playwright                                                                                       | Real browser persistence, import/export, offline workflows          |
| Accessibility checks   | `axe-core` integration where practical                                                           | Catch regressions beyond manual keyboard testing                    |
| Formatting/quality     | ESLint + Prettier + TypeScript `tsc --noEmit`                                                    | Consistent agent commits                                            |
| Package manager        | `pnpm` with committed lockfile                                                                   | Reproducible dependency graph                                       |
| Deploy                 | Static HTTPS host (e.g. Cloudflare Pages or Vercel static output)                                | No app server; same bundle available for local dev                  |

**Do not swap IndexedDB for SQLite during v1.** Introduce `src/data/repositories/` and domain-facing repository interfaces so a later persistence migration is possible, but do not build multiple actual storage adapters now.

Retain the installed dependency graph and committed lockfile. Simulation is pure TypeScript and needs no new runtime dependency in Phase 7. Libraries listed here but not installed remain future-phase choices, not claims of completed implementation.

### 2.1 Browser and platform contract

- Primary targets: current stable desktop Chromium, Firefox, and Safari; best-effort modern tablet layouts.
- Development on `localhost`, production on HTTPS. Installability/offline behavior must be tested in a **production build**, not assumed from Vite dev mode.
- Browser persistence is not equivalent to cloud backup: storage pressure, privacy modes, clearing site data, and browser policy can remove local data. Expose backup controls prominently.
- Ask `navigator.storage.persist()` where supported, report actual grant status, and never claim that it guarantees data survival.
- Handle blocked IndexedDB, unavailable quota, corrupt imports, and storage write failures as recoverable user-visible states.
- Avoid mandatory service-worker cache of imported datasets or private saves. Store user data in IndexedDB only; precache application resources.

---

## 3. INFORMATION ARCHITECTURE AND UX

### 3.1 Global app structure

```text
Welcome / Demo Launcher
  ├─ Play Fictional Demo
  ├─ New Standalone Career (seed, club, Challenge / Sandbox)
  └─ Import Backup / Dataset (Phase 12)

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

Existing route slugs may remain for compatibility; the `/matches` route becomes Fixtures & Results for standalone saves and retains the legacy journal for old saves.

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
- Preserve clear loading, empty, error, first-run and unavailable-feature states. During staged implementation, label future features as unavailable rather than pretending they exist.

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
12. **Atomic progression:** results, appearances, availability, finances and the time pointer commit together for each bounded event.
13. **Compatibility:** schema migration preserves legacy saves and never silently promotes them to simulated careers.

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
- Future entities receive migrations in their owning phase; Phase 7 does not prebuild every later table.
- Large world snapshots/results belong in their own stores, not the bounded audit payload.

### 4.4 Repository/API and migration boundary

`src/domain/**` contains pure calculations and parsing. `src/data/commands/**` loads authoritative state, validates, checks policies and commits. Repositories enforce ownership and relationships; feature components orchestrate without importing Dexie or migrations.

Phase 7 adds `version(2)` after the frozen `version(1).stores(schemaV1)` declaration. Existing campaigns migrate to `mode: legacy` and `rulesMode: sandbox`; no simulation state or invented fixtures are attached to them. Missing mode in old command payloads defaults only to legacy, never standalone.

New standalone creation is a separate command with explicit complete inputs. Legacy match/deal/player-correction/finance commands reject standalone saves. Planned standalone negotiations are the only later path to executing transfers. Challenge constitution writes fail even when called directly.

### 4.5 Deterministic simulation protocol

- Derive separate random streams from root seed + simulation version + stable logical keys for fixture, market event or development period. Club/player enumeration and unrelated random draws cannot change a match.
- Seeds never depend on remappable campaign/entity IDs, audit time, animation speed or browser wall time. Persist logical keys and event seeds through export/restore.
- Compute outside a short write transaction, optionally in a Worker. The command rechecks revision, current date, prerequisites and receipt before applying the trusted result.
- A receipt key is campaign + event/fixture identity, not a newly generated request ID. Retrying the same logical operation returns or references the persisted outcome; it never draws again.
- A stale result returns conflict and applies nothing. Worker messages cannot write Dexie or bypass command validation.
- Saves pin their simulation and generator versions. Unsupported versions open with a clear compatibility state; do not silently rerun history with a new engine.

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

Retain the deterministic 4-league / 72-club / 3,000-player generator framework. Generator v1 stays reproducible for existing saves. Introduce playable generator v2 without changing historical outputs.

- Four independent leagues of 18 clubs; fictional players, names and crests.
- Preserve the total of 2,880 owned players and 120 free agents; improve squad composition, not the scale.
- Every club has at least two goalkeepers and positional coverage for a legal supported formation and bench.
- Generate ability distributions related to club prestige; potential is at least current role-weighted ability. Values and wages follow declared, versioned formulas using ability, age and potential, with bounded seeded variation.
- Six existing attributes remain. A separate declared goalkeeper rating in the simulation profile avoids treating outfield finishing as goalkeeper quality.
- Owned active players receive exactly one complete contract: wage, tier and expiry. Free agents have no active contract.
- Every club has a finite transfer balance and weekly wage ceiling; initial contracts fit that ceiling. The selected challenge has a feasible starting registration and XI.
- Standalone calendars start July 1 of an explicit year. Root seeds are user supplied or explicitly generated at the UI boundary and then persisted; audit time does not select world content.
- The playable demo has a separate campaign identity from the existing legacy demo. Reset acts on the selected demo only.
- World computation/validation precedes one atomic creation transaction. No partially initialized save is listed as playable.
- Featured gameplay history is produced by the engine or explicitly labeled scripted tutorial state; do not mix authored legacy scores into a competitive table.

### 6.2 Loader B — local CSV/JSON import (Phase 12)

The existing importer is planned, not implemented at the pivot checkpoint. Retain browser-only parsing, Worker use for large files, field mapping, sample preview, units, row limits, source labels, safe staging and receipts. No hosted proprietary player data or automatic licensing assertions.

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
- In Phase 7, Continue stops at the first league kickoff with `Match simulation arrives in Phase 8.` No fixtures or results exist yet.
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

### 7.8 Backup, import/export and settings (Phase 12)

Export a complete versioned JSON campaign with every legacy/simulation store, keys, versions, pending offers/reservations, fixtures, results, receipts and development/settlement history.

Restore validates envelope/versions, limits, relationships, campaign ownership and source labels before promoting a new campaign. Remap entity IDs but preserve simulation keys, root/event seeds and the same future outcomes. Failed restore must leave existing saves intact. No destructive overwrite or SQLite export.

Retain persistence/quota UX, backup reminders, privacy controls and no telemetry by default. Import/export is not available merely because the data model contains an ImportReceipt.

---

## 8. TECHNICAL ARCHITECTURE / REPOSITORY SHAPE

Retain existing folders and add shallow modules as needed:

```text
src/domain/
  models/ rules/ finance/ player/ matches/ seed/ validation/
  simulation/       # state, game calendar, deterministic streams
  fixtures/         # round-robin schedules, standings
  market/           # AI needs, valuations, negotiations
  seasons/          # settlement, development, academy
  analytics/ commands/
src/data/
  db.ts
  migrations/       # immutable v1 plus explicit v2 and later additions
  repositories/
  commands/         # the only gameplay write entry points
  transactions/
src/features/
  campaigns/ dashboard/ squad/ tactics/ transfers/ finance/
  registration/ matches/ seasons/ scouting/ import-export/ settings/
src/workers/
  simulation.worker.ts  # when profiling justifies off-thread execution
  import.worker.ts
plans/phase1.md ... phase13.md
README.md
ARCHITECTURE.md
DECISIONS.md
MASTER_PLAN.md
```

### Boundaries

- Domain: pure calculations and schemas; no React, Dexie, browser globals, ambient randomness or clocks.
- Data: scoped repositories, migrations and transactional commands; no UI.
- Features: orchestration/UI using domain, repositories and commands; no direct Dexie or duplicated policy math.
- Shared components: no business logic or persistence imports.
- Workers: typed serializable inputs/results; share the domain engine and never write authoritative game state.

### Persistence/write protocol

1. Validate request and campaign mode.
2. Load a consistent campaign-scoped snapshot/revision.
3. Evaluate prerequisites and compute the bounded event outside the write transaction.
4. Open one short transaction; recheck revision, date, policy, receipt and ownership.
5. Commit all effects, receipt and audit and increment revision once.
6. Return persisted state or an actionable failure. A failed event writes nothing.

For creation, validate the entire generated world before transactionally inserting a playable campaign. If production measurements require staged initialization, staging must remain unplayable and be recoverable; amend the guide before changing its atomic contract.

### Cross-cutting rules

- Disable duplicate submission, keep UI responsive and expose progress; do not hide saves behind long synchronous work.
- Use indexed reads and measured pagination/virtualization for large datasets.
- Keep audits concise; never duplicate a full world snapshot inside an audit payload.
- Bundle assets and fonts; no mandatory runtime CDN.
- No private save data in network logs, telemetry or remote services.
- Schema version, generator version, simulation version and backup format version are distinct and tested independently.

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

### PHASE 7 — Standalone simulation foundations (active)

**Outcome:** Legacy saves survive migration; a new complete seeded career initializes and advances to the first kickoff boundary. No match engine, transfer AI, growth or rollover is claimed yet.

- `P07-G01` — Completed historical manual journal. Commit: `feat(p07-g01): record played matches`. Preserve unchanged.
- `P07-G02` — Simulation contracts, mode defaults and additive Dexie v2 migration. Commit: `feat(p07-g02): introduce standalone save contracts`.
- `P07-G03` — Pure game calendar, named random streams and bounded time previews. Commit: `feat(p07-g03): define deterministic game time`.
- `P07-G04` — Playable generator v2 with legal squads, contracts, profile inputs and budgets. Commit: `feat(p07-g04): generate playable club worlds`.
- `P07-G05` — Atomic standalone career creation, new-game UI and legacy/Challenge write guards. Commit: `feat(p07-g05): start standalone careers safely`.
- `P07-G06` — Audited Continue command and command-center progression through preseason to kickoff. Commit: `feat(p07-g06): advance the standalone game clock`.
- `P07-G07` — Migration, initialization, mode-isolation and progression browser/integration evidence. Commit: `test(p07-g07): verify standalone foundations`.

**Exit:** Next execution is P07-G02; legacy demo and new playable demo are separate; generator v1 outputs unchanged; no unavailable future handler is bypassed.

### PHASE 8 — Fixtures and instant match simulation

**Outcome:** Play all 34 matchdays, review both teams' performances and league tables, and reach a final-season review without rollover.

- `P08-G01` — Fixture/result/appearance contracts and versioned persistence.
- `P08-G02` — Four double round-robin calendars and deterministic standings.
- `P08-G03` — Shared role strength, AI legal selection and automatic substitution policy.
- `P08-G04` — Pure instant match engine, coherent timeline/xG/ratings and availability effects.
- `P08-G05` — Atomic round simulation, reports, tables and squad performance adapters.
- `P08-G06` — Full-round/full-season deterministic integration tests and browser matchday journey.

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

Former unimplemented Phase 8, adjusted to simulation history.

- `P11-G01` — Transparent archetype scores and missing-data confidence.
- `P11-G02` — Radar comparisons and scouting reports.
- `P11-G03` — Age/minutes matrix and development history.
- `P11-G04` — Wage structure and transfer-decision visuals.
- `P11-G05` — Grounded insight feed with source links.
- `P11-G06` — Analytics integrity, accessibility and scalable search tests.

### PHASE 12 — Dataset import and portable campaign backup

Former unimplemented Phase 9, expanded for playable-world validation and deterministic restore.

- `P12-G01` — Complete versioned backup export, including all simulation stores.
- `P12-G02` — Safe restore/remapping, preserving seeds and future outcomes.
- `P12-G03` — Worker CSV/JSON parsing, limits and malformed-input handling.
- `P12-G04` — Field mapping, units and explicit simulation-profile completion preview.
- `P12-G05` — Atomic/staged imported-career creation and readiness validation.
- `P12-G06` — Cross-version/legacy round trips, deterministic continuation and 25k-row fixtures.

### PHASE 13 — PWA, accessibility, performance and release

Former unimplemented Phase 10 plus simulation profiling and balancing.

- `P13-G01` — Production PWA, precache and offline tests.
- `P13-G02` — Storage/quota/backup recovery UX.
- `P13-G03` — Keyboard, contrast, responsive and reduced-motion hardening.
- `P13-G04` — Profile 3k/25k operations, full-world rounds and long saves; document multi-seed balancing.
- `P13-G05` — Architecture, gameplay help, licensing, portfolio walkthrough and deployment docs.
- `P13-G06` — Full CI, production/offline restore journey and release checklist.

**Release:** Do not shorten the roadmap by claiming importer, PWA, analytics or game balancing already exist.

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

- Exact commands and manual browser flows; failure cases.

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

- Unit: money/rounding, rules, role strength, calendar boundaries, deterministic streams, fixture schedule, match events, availability, valuation, development and missing data.
- Integration: real v1→v2 migration, rollback, stale revision, logical-operation idempotency, mode guards, two-club settlement, season settlement and isolation.
- UI: next-action blockers, registration/selection, accessible reports, new-game settings, Challenge locks and legacy compatibility.
- E2E: create career → select XI → simulate → resolve AI bid → sign player → complete season → settle → export → restore → identical continuation.
- Fixtures: tiny deterministic worlds, strict-policy clubs, malformed/incomplete imports, actual v1 save rows, production 3k world and 25k import fixture.

### 12.2 Explicit invariants

1. A 70% sales rule on EUR10m completed sales authorizes EUR7m, not EUR10m.
2. Age 27 violates enabled default signing age 26; free exemption follows the actual preset.
3. EUR46k/week violates an enabled EUR45k Key cap; missing wage is never silently zero.
4. Concurrent deals cannot spend the same balance or reserved funds.
5. Failed transfers cannot leave ownership, contracts or either club's finance partially changed.
6. Legacy unknown values remain unknown; generated simulation replacements are separate and labeled.
7. A fixture/player has one performance row; repeated simulation cannot add minutes again.
8. Rollover, growth periods, academy intake and each award apply once.
9. Restore/import failures leave existing saves intact and preserve references.
10. Every query/write validates campaign ownership and mode.
11. Generator v1 remains byte-for-byte reproducible; v2 repeats for the same seed/version/logical keys.
12. Missing scouting axes never become invented measurements.
13. Each 18-club schedule has 34 rounds/306 fixtures, one game per club per round, one home and one away meeting per pair.
14. One full-world round produces 36 results or no results. Stale/retried rounds cannot reroll.
15. Score, goal events, appearances, minutes, bans and fitness effects reconcile.
16. Club iteration order, UI timing and unrelated random streams do not change fixture outcomes.
17. AI deals remain affordable, player ownership/contracts remain legal, and compulsory offers are completable.
18. Prize reinvestment is applied once to the opening season; carryover never includes the same award.
19. Restore ID remapping preserves the same next match/market/development outcomes.
20. Challenge guards cannot be bypassed through old manual commands or direct command calls.
21. Multi-season tests retain enough legal squads and goalkeepers across all clubs; retirement cannot silently hollow out the world.

### 12.3 Required commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Use available targeted Vitest/Playwright options for each guide, then the full checks required by its phase. CI covers lint, types, unit/integration and build; phase exit/release includes browser checks. Documentation-only amendments run formatting/link/contract consistency checks; do not claim that planned gameplay tests have run.

### 12.4 Performance and balancing

Phase 13 records named hardware/browser and reproducible seeds. Measure first initialization, a 36-fixture round, a 1,224-fixture season, long-history reads, 3k searches and 25k imports. Show progress, avoid sustained main-thread blocking and use a Worker when measurements justify it.

Across fixed multiple seeds, report score/xG distributions, home advantage, stronger/weaker squad trends, injury frequency, transfer affordability and annual player growth. Treat these as game-design targets, not verified real football facts. Set thresholds before tuning and do not fabricate universal latency guarantees.

### 12.5 Accessibility and privacy

Keyboard users can create/open a career, assign a legal team, resolve blockers, simulate, review reports and export. Essential information does not rely on hover or color. User data stays local unless explicitly exported; static deployment includes no secrets, proprietary databases or network-dependent assets.

---

## 13. RISKS AND MITIGATIONS

| Risk                                               | Mitigation                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Pivot destroys existing saves                      | Frozen v1 migration, legacy mode, separate playable demo and upgrade fixtures                 |
| Old manual commands bypass gameplay                | Command-level mode/Challenge guards and negative integration tests                            |
| Simulation rerolls on reload/restore               | Versioned logical keys, event seeds, immutable results and receipts                           |
| Full-world writes partially apply                  | Bounded transactions, revision checks and rollback fault tests                                |
| Mandatory transfer permanently blocks time         | Binding affordable offers, reserved funds, pre-agreed terms and one compulsory bid per player |
| Prize or growth is applied twice                   | Settlement/period identities, explicit earning/receiving seasons and retries                  |
| World becomes unplayable over years                | Legal generation, AI rotation/recruitment, retirement/intake and multi-season tests           |
| Match loop expands into a full live manager        | Instant results and auto-substitutions only; live ticker deferred                             |
| Imported identities look like complete player data | Readiness preview, separate generated profiles and source labels                              |
| Large rounds/imports freeze the browser            | Profile production workloads, typed Worker boundary and indexed reads                         |
| Browser eviction or broken update loses save       | Backup/restore, quota UX, explicit migration and production update testing                    |
| AI refers to hosted models                         | Document local deterministic algorithms; no external AI dependency                            |

Rollback preserves user data. Revert a bad implementation through a compatible forward fix; do not deploy old code that cannot parse a newer DB, delete a save, or reset published history to avoid an upgrade.

---

## 14. SECURITY, LEGAL AND TRUST

- Client-side storage/computation by default; no accounts or app-owned backend.
- Treat imports/backups/Worker messages as untrusted: bounded sizes, strings and row counts, schema/relationship checks, no HTML evaluation.
- Ship fictional identities, independently designed SVG crests and no commercial player databases or licensed photos.
- Personal imports remain local; no assertion that personal possession grants redistribution rights.
- Visible product statement: “Independent fictional football simulation; not affiliated with any football game, club or league.” Legacy saves may retain their historical companion label.
- Label simulated outcomes, generated profiles, estimates and imported facts distinctly.
- Service worker caches app assets, not imported private files. No exposed API keys, mandatory hosted LLM or telemetry.
- Backups can contain personal notes/imported data; provide sharing guidance without sending them anywhere automatically.

---

## 15. DEMO / PORTFOLIO ACCEPTANCE SCRIPT

At release a reviewer can:

1. Open Play Fictional Demo, choose a club and start a seeded Challenge career.
2. Review board rules, finite funds, wage tiers and the game date.
3. See an unaffordable or age-ineligible proposed signing blocked with evidence.
4. Advance to a market decision; receive an affordable compulsory prestige bid with an actionable sale.
5. Accept it, see the completed move and 70% sale credit, then negotiate an eligible replacement with club/player agreement.
6. Register the squad and assign the new signing on the accessible SVG board.
7. Simulate a matchday; inspect score, xG, events, ratings, fitness and all league tables.
8. Reload; the same result exists once and time does not advance on its own.
9. Complete the season, review objectives/development, settle once and see next-season awards and capacity.
10. Export, restore as a separate campaign and verify the same future outcome from identical decisions.
11. Go offline after app caching and continue playing.
12. Open a preserved legacy campaign; its manual history has not been converted into a simulated table.

The portfolio story is a playable sporting-director loop whose board rules create meaningful recruitment decisions.

---

## 16. DEFINITION OF DONE FOR STANDALONE v1

- [ ] Historical Phases 1–6/P07-G01 remain intact; current Phases 7–13 have completed guides and reviewable commits.
- [ ] New playable career and demo initialize without login, uploads or network APIs.
- [ ] Four leagues complete 34 rounds each with coherent fixtures, results and tables.
- [ ] Selection/roles, availability and automatic substitutions affect documented match inputs.
- [ ] AI transfers/negotiations obey funds, wages, ownership and board rules.
- [ ] Compulsory bids create decisions without impossible progression locks.
- [ ] Player development, expiry, academy and retirement support a second season and tested longer careers.
- [ ] Awards, carryover and opening budgets reconcile without duplicate reinvestment.
- [ ] Save migration, mode isolation, receipts, rollback and deterministic restore have tests.
- [ ] Moneyball, comparisons and insights trace to canonical labeled data.
- [ ] Dataset imports validate playable readiness and preserve unknown source fields.
- [ ] Complete JSON backup/restore and offline PWA work in production.
- [ ] Keyboard, responsive, contrast, errors and storage recovery meet release gates.
- [ ] Documentation distinguishes implemented checkpoints from the final product and records measured performance/balancing.
- [ ] Static build has no secrets, proprietary player data or mandatory hosted services.

### Post-v1 candidates

Live fast-forwardable ticker and in-match changes; cups and promotion/relegation; deeper commercial finances; staff/morale systems; local narrative assistance; native wrapper; consented lawful connectors; cloud sync only under a separate architecture decision.

---

## 17. PLANNING CHANGE CONTROL

This plan is versioned, not silently frozen around the previous product. A material change must:

1. Explain the motivation and affected outcome.
2. Amend this master and record the decision/version in `DECISIONS.md`.
3. Identify affected phases/guides, data migration and tests.
4. Replace only unimplemented guides; preserve completed commit history and evidence.
5. Preserve backward compatibility or define and test a formal migration.
6. Keep future scope separate from current implementation status.

**Pivot decision:** 2026-10-20, plan 1.0.0 → 2.0.0, companion → Standalone Sporting Director Sim. Defaults are instant results, lightweight availability and Board Challenge/Sandbox. See DEC-001.

**Instruction to future agents:** Start with `plans/phase7/guide2.md` after reading this file and the amended phase. Do not restart Phase 1, execute archived companion guides, or add the Phase 8 match engine during Phase 7.

---

## 18. NON-NORMATIVE TECHNICAL REFERENCES

The following sources explain browser and library constraints. They do not override this plan:

- [Dexie API reference](https://dexie.org/docs/API-Reference) — IndexedDB schema versions, indexes, and transactions.
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — why local storage is not equivalent to backups.
- [MDN origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) — optional future SQLite/OPFS exploration, **not a v1 dependency**.
- [Vite PWA plugin project](https://github.com/vite-pwa/vite-plugin-pwa) — precached static/offline shell support.

**END OF MASTER IMPLEMENTATION PLAN**
