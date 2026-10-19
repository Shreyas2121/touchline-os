# TOUCHLINE OS — MASTER IMPLEMENTATION PLAN

> **Document type:** Final, authoritative product and engineering plan  
> **Product:** Touchline OS (working name)  
> **Product choice:** **Option B — Companion Sporting Director OS**  
> **Target:** Local-first, offline-capable, installable web app (PWA)  
> **Status:** Implementation baseline / source of truth  
> **Plan version:** `1.0.0`  
> **Last defined:** 2026-10-19  
> **Execution chain:** `MASTER_PLAN.md` → `phase<number>.md` → `guide<number>.md` → one reviewed Git commit per guide

---

## 0. HOW AN AI CODING AGENT MUST USE THIS FILE

This document is the **single source of truth** for product scope, technical decisions, data semantics, invariants, milestone order, and definition of done. It is **not** a brainstorming document. An implementation agent must not quietly replace decisions with easier or more fashionable alternatives.

### Document hierarchy and precedence

1. `MASTER_PLAN.md` — product contract, architecture, canonical terminology, phase sequence, non-negotiable constraints.
2. `plans/phase<number>.md` — detailed execution plan for exactly one phase, derived from this master plan.
3. `plans/phase<number>/guide<number>.md` — executable, commit-sized implementation instruction, derived from its parent phase.
4. Source code and tests — must implement the contracts above. Existing code is not permission to redefine product behavior.

Precedence on conflict: **master → phase → guide → implementation**. If a proposed change breaks a higher-level contract, stop that particular change, describe the conflict, and explicitly amend the higher-level plan before implementation. Do not silently diverge.

### Rules for agents

- Read the master plan before generating any phase or guide. Read the active phase before executing a guide.
- Work **one phase at a time**, in numeric order. Do not implement features from a future phase unless needed as a narrow, documented foundation.
- Generate **all of a phase's guides before implementing the phase**. Each guide must have an independently verifiable outcome and a proposed commit message.
- Complete guides in order; **one guide = one logical commit**. A guide may touch multiple files but must not conceal unrelated work.
- Do not commit if mandatory checks or acceptance tests fail. Fix within the same guide before committing.
- Prefer pure TypeScript domain functions; keep React components free of business-rule logic and database writes.
- Never invent external data, validated football facts, licensing permissions, browser capabilities, benchmark results, or completed tests.
- Use package versions verified as stable when Phase 1 begins; commit the lockfile. Do not perform surprise major dependency upgrades in later phases.
- Each phase ends with a working app, passing checks, updated documentation, and a clear handoff to the next phase.
- When requirements are underspecified, choose the smallest implementation consistent with this plan, record the assumption in the active phase, and preserve backward compatibility.

### Required planning-file paths

```text
MASTER_PLAN.md
plans/
  phase1.md
  phase1/
    guide1.md
    guide2.md
    ...
  phase2.md
  phase2/
    guide1.md
    guide2.md
    ...
  ...
  phase10.md
  phase10/
    guide1.md
    ...
```

`guide<number>.md` numbering **restarts at 1 for each phase**. Commit identifier is globally unambiguous by combining both numbers: `P01-G01`, `P05-G03`, etc. Never use an unqualified `guide3.md` without its phase directory.

---

## 1. PRODUCT DEFINITION

### 1.1 One-line pitch

**Touchline OS is an offline-first sporting-director workspace for players managing a football career in another game: track a club, enforce self-imposed rules, plan squads and transfers, analyze finances, and document each season — without simulating matches.**

### 1.2 Primary user and setting

- A football career-mode player on console or PC, using Touchline OS in another browser window, laptop, or tablet.
- A portfolio reviewer who opens the public demo URL, selects a **fictional pre-seeded club**, and immediately explores believable workflows without an account or external dataset.
- A tinkerer who imports an appropriately licensed or personally held CSV/JSON dataset on their own device to replace or augment fictional data.

### 1.3 Core loop (this is the product)

1. **Create/open a campaign** and choose the managed club.
2. **Review the club**: budget, wage structure, roster health, rule violations, deadlines, unresolved tasks.
3. **Plan**: starting XI, bench, roles, youth pathways, shortlist, target comparisons, contracts and transfer scenarios.
4. **Validate**: preview a transfer, contract, registration, or season action against the club's constitution before making it real.
5. **Record actions actually taken in the external game**: bids, transfers, contract changes, fixtures/results, player appearances, prizes and notes.
6. **Reconcile**: ledger, squad, reports, warnings, season summary; consciously advance to the next season.
7. Repeat. **Touchline OS never claims to have executed anything in the external game.**

### 1.4 Success criteria

- A first-time visitor can open an interactive fictional demo without authentication or uploads.
- The product provides value **without** AI, internet connectivity after installation, or third-party APIs.
- A user can manage at least one complete manual season, including planning, transactions, match entries, rule checks, and rollover.
- A hard rule cannot be bypassed through the app's normal write commands; previews and commits use the same policy engine.
- The app never loses a confirmed operation halfway through a multi-record local write.
- A saved campaign survives reload, can be exported, and can be restored on a different browser/device.
- Portfolio demo visibly communicates unique rule-engine behavior rather than merely looking like a database dashboard.

### 1.5 Non-goals for v1 (do not add them)

- Standalone match simulation, animated match engine, goal probabilities, real-time xG worm, tactical player movement during live games, or artificial fixture generation posing as results.
- Scraping EA/FC, Football Manager, PES/eFootball, league websites, or other games; reading console saves directly; automatic two-way integration with games.
- Backend server, accounts, cloud saves, multiplayer, chat, subscriptions, real-money budgets, or app-hosted proprietary player databases.
- Native desktop packaging/Tauri, SQLite/WASM/OPFS, Drizzle ORM, unbounded plugin architecture.
- AI-generated factual scouting claims, external hosted LLM calls, embeddings, paid model APIs, or browser-exposed secret API keys.
- Replication of a specific real-world league's official registration or financial regulations unless exact rules are explicitly configured and documented.

**Scope guard:** A 2D **tactics planning board** is in scope. A 2D **match visualizer** is not.

---

## 2. FROZEN TECHNICAL DECISIONS

| Area | Decision | Rationale / constraint |
| --- | --- | --- |
| Application | Vite + React + TypeScript (`strict` mode) | Fast local development, static deployment |
| Persistence | **IndexedDB through Dexie** | Simple browser-native data model; transactions and versioned schema |
| Database upgrade | Explicit Dexie `version(...).stores(...)` migrations | Never wipe user data during app updates |
| Validation | Zod for imports, persistence boundaries, configuration | Runtime checks outside TypeScript's compile-time safety |
| Routing | React Router | Explicit campaign-scoped URLs |
| UI styling | Tailwind CSS with design tokens/CSS variables | Dense, consistent dark interface |
| Accessible components | Radix primitives where needed | Dialogs, menus, select, keyboard interaction |
| Icons/graphics | Lucide icons; generated SVG crests and pitch | No licensed image assets required |
| Data visuals | Recharts | Age/minutes scatter, wage bars, comparison radar |
| Dense tables | TanStack Table; add virtualization for big result sets | Sorting/filtering with scalable rendering |
| Forms | React Hook Form + Zod resolver | Accessible validation and error states |
| UI state | Local React state; small Zustand stores only for ephemeral cross-screen UI | Persistent state lives in Dexie, not duplicate stores |
| Background work | Dedicated Web Worker for large import/normalization and large analytics where needed | Avoid blocking primary interactions |
| Offline install | `vite-plugin-pwa` + precached app shell/assets | No runtime CDN dependency |
| Unit/integration tests | Vitest + React Testing Library | Rule, model, command and UI behavior |
| E2E tests | Playwright | Real browser persistence, import/export, offline workflows |
| Accessibility checks | `axe-core` integration where practical | Catch regressions beyond manual keyboard testing |
| Formatting/quality | ESLint + Prettier + TypeScript `tsc --noEmit` | Consistent agent commits |
| Package manager | `pnpm` with committed lockfile | Reproducible dependency graph |
| Deploy | Static HTTPS host (e.g. Cloudflare Pages or Vercel static output) | No app server; same bundle available for local dev |

**Do not swap IndexedDB for SQLite during v1.** Introduce `src/data/repositories/` and domain-facing repository interfaces so a later persistence migration is possible, but do not build multiple actual storage adapters now.

Use one confirmed stable version of each dependency at implementation time, pin it, and avoid hardcoding speculative future package versions in this plan.

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
  ├─ Try Fictional Demo (select club)
  ├─ Create New Campaign
  └─ Import Backup / Import Dataset

Campaign Workspace
  ├─ Command Center       — summary, violations, activity, next actions
  ├─ Squad                — player table, details, contracts, development
  ├─ Tactics              — 2D formation board, assignments, bench
  ├─ Transfers            — shortlist, offers, scenario preview, completed deals
  ├─ Finance              — ledger, transfer funds, wage structure
  ├─ Registration         — eligibility, quota checker, matchday selection
  ├─ Scouting             — archetypes, comparisons, confidence notes
  ├─ Match Journal        — manual match records and appearances
  ├─ Seasons              — timeline, season review, rollover
  └─ Constitution         — enabled rules, thresholds, audit trail

Global Utilities
  ├─ Campaign Switcher
  ├─ Search / Command Palette
  ├─ Backup / Restore
  ├─ Settings / Accessibility
  └─ Help / Data Provenance
```

### 3.2 Visual system: Bloomberg terminal × tactical canvas

- Default theme: dark graphite surfaces, fine separators, restrained amber/teal indicators, red only for serious blockers, small crisp typography, generous numeric alignment.
- Main screen: 240–280 px collapsible navigation rail; 12-column content grid; KPI ribbon; dense interactive tables; right-side context drawer where useful.
- Numbers and budgets use tabular numerals. Use explicit units: `€`, `€/week`, `€m`, `%`, minutes, years. Never rely on color alone to signal status.
- Distinguish **Blocked / Warning / Informational / Passed** using text and icons, not only red/amber/green.
- Give the tactical pitch a strong visual identity: SVG field lines, numbered discs/shirt silhouettes, position/role labels, controlled drag/click interactions. No animation that suggests simulated real matches.
- Generate fictional club crests from seeded SVG geometry (shield/stripe/chevron/monogram) and palette. Do not ship real club crests, licensed player images, scraped photos, or trademarked game branding.
- Responsive priority: excellent desktop and landscape tablet; mobile can use a condensed read/entry layout instead of fitting the entire desktop terminal.
- Keyboard navigation, visible focus indicators, accessible table names, dialogs, form labels, touch targets, reduced-motion support, and legible contrast are acceptance requirements.

### 3.3 App behavior

- Campaign-aware URL pattern: `/app/:campaignId/<section>`; route guards for missing or invalid campaigns.
- Persistent search/filter state only when beneficial; transient modal/toggle state should not accidentally leak between campaigns.
- A **quick action** button on each main screen, e.g. “Record transfer,” “Add match,” “Check registration,” with clear success/failure feedback.
- Destructive actions require explicit confirmation and explain whether reversible. On rule rejection, show the exact rule, evidence and user-correctable next step.
- Loading, empty, error, success, first-run and no-data states are designed states, not afterthoughts.

---

## 4. DOMAIN MODEL AND INVARIANTS

### 4.1 Domain rules shared by all features

1. **Campaign isolation:** Every campaign-owned record has `campaignId`; queries and writes are scoped to it. No cross-save leakage.
2. **Stable identity:** Every entity has an internal stable ID independent of names/jersey numbers/import row numbers. Imported external identifiers are optional provenance metadata.
3. **Currency:** v1 campaign currency is **EUR only**; all money is integer **cents** (`MoneyCents`), not float euros. User input/output converts at boundaries.
4. **Dates:** Stored date-only values use `YYYY-MM-DD`. Store event times as ISO UTC timestamps. Never infer a game's current season from the user's real-world clock.
5. **Age:** Use a known DOB where present. Otherwise keep reported age + reference season/date and label later calculations as estimated. **Never synthesize a DOB and display it as fact.**
6. **Unknown ≠ zero:** Missing wage, fee, market value, nationality, registration status, minutes, ability, or budget remains nullable/unknown with visible provenance; do not quietly substitute zero.
7. **Authority:** Only completed, explicitly user-confirmed commands change roster, finance, appearances, or season state. Drafts/previews do not.
8. **Auditability:** Persist a meaningful event for each committed business action. Financial adjustments use compensating entries, not deletion of posted historical entries.
9. **Determinism:** Seed generation, derived analytics and policy evaluation accept explicit inputs; no network or implicit `Date.now()` / `Math.random()` in pure business logic.
10. **No fictional fact laundering:** Generated/demo/imported/user-entered/estimated values carry source classification. Reports never present estimates as directly observed facts.

### 4.2 Required data entities

The following are **domain-level contracts**, not a literal ready-to-run Dexie index declaration. In Phase 2, formalize Zod schemas, TypeScript types, repository methods and IndexedDB indexes. Additional internal fields (`revision`, timestamps, indices) are allowed without changing semantics.

| Entity | Essential fields | Notes |
| --- | --- | --- |
| `Campaign` | `id`, `name`, `kind` (`fictional`/`imported`), `seed?`, `managedClubId`, `activeSeasonId`, `currency='EUR'`, `createdAt`, `updatedAt`, `revision` | One managed club per campaign in v1; many separate campaigns allowed |
| `Season` | `id`, `campaignId`, `label`, `ordinal`, `status` (`active`/`closed`), `startDate?`, `endDate?`, `openedAt`, `closedAt?` | Exactly one active season per campaign |
| `League` | `id`, `campaignId`, `name`, `countryCode?`, `tier?` | Fictional league names by default |
| `Club` | `id`, `campaignId`, `leagueId?`, `name`, `shortName`, `colors`, `prestige` (0–100), `academyTier` (1–5), `scoutingRegion?` | `prestige` is a **fictional gameplay setting**, not a claim about real clubs |
| `Player` | `id`, `campaignId`, `clubId?`, `name`, `positionGroup`, `positions[]`, `nationalityCode?`, `birthDate?`, `reportedAge?`, `ageReferenceSeasonOrdinal?`, `marketValueCents?`, `attributes?`, `potential?`, `source`, `externalSourceId?`, `isNewgen` | Ratings 0–100 when available; all imported fields optional except meaningful identity |
| `Contract` | `id`, `campaignId`, `playerId`, `clubId`, `weeklyWageCents?`, `squadTier?`, `startsOn?`, `expiresOn?`, `status` | One active contract per club/player pairing |
| `Constitution` | `id`, `campaignId`, `version`, `rules[]`, `updatedAt` | Versioned snapshot of toggles/parameters; changes audited |
| `LedgerEntry` | `id`, `campaignId`, `seasonId`, `clubId`, `kind`, `amountCents`, `effectiveOn`, `sourceActionId`, `reversesEntryId?`, `note?` | Posted amounts nonnegative; credit/debit dictated by typed `kind` |
| `Transfer` | `id`, `campaignId`, `seasonId`, `playerId`, `fromClubId?`, `toClubId?`, `feeCents`, `kind` (`sale`/`purchase`/`free`), `effectiveOn`, `sourceActionId` | Completed moves only; draft proposals stored separately |
| `Offer` | `id`, `campaignId`, `seasonId`, `playerId`, `bidderClubId`, `feeCents`, `status`, `receivedOn`, `resolvedOn?` | Enables “must accept prestige bid” rule |
| `Lineup` | `id`, `campaignId`, `seasonId`, `name`, `formation`, `starters[]`, `benchPlayerIds[]`, `updatedAt` | Slot assignments store stable player IDs and roles, not only coordinates |
| `Registration` | `id`, `campaignId`, `seasonId`, `playerId`, `competitionKey`, `status`, `homegrownClub?`, `homegrownNation?`, `ageExempt?`, `provenance` | `unknown` allowed and shown explicitly |
| `MatchRecord` | `id`, `campaignId`, `seasonId`, `date`, `opponent`, `homeAway`, `goalsFor`, `goalsAgainst`, `competition?`, `notes?`, `xgFor?`, `xgAgainst?` | Entered game result, never automatically simulated |
| `Appearance` | `id`, `campaignId`, `seasonId`, `matchId`, `playerId`, `minutes`, `started?`, `goals?`, `assists?`, `rating?` | Unique per (`matchId`, `playerId`); can be omitted if unknown |
| `ShortlistItem` | `id`, `campaignId`, `playerId`, `priority`, `status`, `notes?`, `addedAt` | Avoid duplicate player entries |
| `ScoutingReport` | `id`, `campaignId`, `playerId`, `seasonId`, `archetype`, `observations`, `confidence`, `source`, `createdAt` | Scores are derived heuristics or user-authored; labeled accordingly |
| `DevelopmentPlan` | `id`, `campaignId`, `playerId`, `seasonId`, `targetRole?`, `notes`, `status` | Companion notes only; does not progress game attributes |
| `AuditEvent` | `id`, `campaignId`, `seasonId?`, `actionId`, `actionType`, `createdAt`, `summary`, `payload` | Append-only history of confirmed domain commands and rule changes |
| `ImportReceipt` | `id`, `campaignId?`, `sourceName`, `sourceType`, `importedAt`, `rowCounts`, `mappingVersion`, `warnings`, `provenance` | Dataset audit, no external upload |

Store app-wide preferences separately, including theme, reduced motion, and onboarding completion. Do **not** copy all 25k imported players into every view's React state.

### 4.3 Normalization contracts

- Supported position groups: `GK`, `DEF`, `MID`, `FWD`; finer supported positions: `GK`, `CB`, `LB`, `RB`, `LWB`, `RWB`, `CDM`, `CM`, `CAM`, `LM`, `RM`, `LW`, `RW`, `ST`, `CF`. Unknown/foreign codes remain mapped to `UNKNOWN` until user mapping is resolved.
- Attribute scale: integers 0–100 for **known** attributes. Do not pretend source ratings with incompatible scales are comparable without an explicit transform shown in import mapping.
- Names, clubs and competitions are plain text, escaped in UI; do not render imported HTML.
- Custom registration presets describe the user's challenge rules, **not certified real competition rules**.
- Use stable indexes for `campaignId`, `(campaignId, clubId)`, `(campaignId, seasonId)`, player identity, relevant status/filter combinations; review indexes against real queries.

### 4.4 Repository/API boundary

Organize read/write paths as:

```text
UI component → feature hook / query → repository read
UI intent → application command → current snapshot + pure policy preflight
         → Dexie transaction → records + ledger + audit → UI refresh
```

UI must **not** call `db.table.put()` to execute a transfer, renew a contract, or advance a season. Expose typed command functions, for example:

```ts
previewTransfer(command: TransferCommand, snapshot: ClubSnapshot): RuleReport
commitTransfer(command: TransferCommand): Promise<CommandResult>
previewContract(command: ContractCommand, snapshot: ClubSnapshot): RuleReport
commitContract(command: ContractCommand): Promise<CommandResult>
previewRegistration(command: RegistrationCommand, snapshot: ClubSnapshot): RuleReport
commitRegistration(command: RegistrationCommand): Promise<CommandResult>
recordMatch(command: RecordMatchCommand): Promise<CommandResult>
advanceSeason(command: AdvanceSeasonCommand): Promise<CommandResult>
```

Commands load **fresh** relevant data, re-run checks at commit time, and persist affected records **atomically** in a short Dexie transaction. Do not leave external awaited work (file I/O, network, prompt, timer) inside a live IndexedDB transaction. Use campaign `revision`/optimistic conflict checks to reject stale multi-tab edits instead of silently overwriting them.

---

## 5. CLUB CONSTITUTION — RULE ENGINE (PRIMARY DIFFERENTIATOR)

### 5.1 Design principle

A versioned, explainable, deterministic **policy engine** decides whether a proposed user action is permitted. It must be independently testable without React, browser storage, or date/time globals.

```ts
type Severity = 'BLOCK' | 'WARN' | 'INFO';
type RuleVerdict = {
  ruleId: string;
  severity: Severity;
  code: string;                 // stable machine-readable reason
  message: string;              // human-readable reason
  evidence: Record<string, unknown>;
  remedy?: string;
};
type RuleReport = {
  allowed: boolean;              // false if any BLOCK verdict
  verdicts: RuleVerdict[];
  snapshotRevision: number;
};
```

Functions follow `evaluateAction(action, snapshot, constitution, effectiveDate): RuleReport`. Given the same inputs, outputs must be identical. Every committed command uses this exact engine rather than a separately implemented UI validation approximation.

### 5.2 Enabled v1 rules and exact semantics

| Rule ID | Configuration | Trigger | Enforcement |
| --- | --- | --- | --- |
| `SELL_TO_BUY` | `salesReinvestmentPct` default 70; `prizeReinvestmentPct` default 100; `initialAllocationCents` explicit; `carryoverPct` default 0 | Paid incoming transfer | BLOCK if fee exceeds unspent authorized transfer capacity |
| `MAX_SIGNING_AGE` | `maxAge` default 26; `freeTransfersExempt=true` | Signing a player | BLOCK if known age exceeds max and deal is not eligible for exemption; missing age BLOCK when enabled |
| `WAGE_TIER_CAP` | Default weekly caps: Key €45,000; Rotation €20,000; Youth €5,000 | Signing/contract renewal or tier edit | BLOCK if known proposed wage exceeds configured cap; unknown wage BLOCK when enabled |
| `PRESTIGE_BID_SALE` | `requiredFeeMultiple` default 1.5; `requireHigherPrestige=true` | Rejecting qualifying offer; season rollover with unresolved qualifying offer | BLOCK rejection/rollover until qualifying offer accepted or rule disabled through audited constitution update; unknown valuation/prestige = WARN and manual review |
| `REGISTRATION_QUOTA` | User-configurable roster limit, minimum homegrown count, age exemptions, competition key | Commit matchday registration / confirm selection | BLOCK definitive quota violations and unresolved required eligibility data |

**Rules are opt-in at campaign creation** through presets (e.g. Balanced / Strict Moneyball / Custom) and can be configured. The UI displays every active policy and a plain-language explanation. Changing a rule is a deliberate, audited campaign decision; no stealth switch-off in a transfer modal.

### 5.3 Financial semantics (must be stable across all screens)

For managed club `C`, season `S`, transfer capacity in integer cents is:

```text
authorizedCapacity = initialAllocation
                   + floor(completedPlayerSales * salesReinvestmentPct / 100)
                   + floor(recordedPrizeIncome * prizeReinvestmentPct / 100)
                   + approvedCarryover

remainingTransferCapacity = authorizedCapacity - completedIncomingTransferFees
```

- All quantities are **season scoped**, except `approvedCarryover` which is set during explicit rollover according to the previous season's **nonnegative remaining capacity** and `carryoverPct`.
- `initialAllocation` and actual income are separate sources. Never apply the sales percentage to a club's raw bank balance.
- **Only completed sales and recorded prizes** affect credits. Speculative bids, projected sales, and planned deals do not.
- If sales are entered retroactively, ledger is recomputed by effective season, and any resulting inconsistency is flagged; never silently rewrite completed transfers.
- `feeCents=0` free signings incur no transfer fee but still satisfy wage/age/registration constraints. Do not conflate free transfer with zero wages.
- Wage **commitment** is calculated from active contracts, e.g. `sum(weeklyWageCents)`; it is **not** automatically subtracted from transfer capacity. Explicit wage caps are separate policy checks.
- A manual financial correction uses a specific adjusted/reversal ledger entry, includes note and linked audit action, and is visible in history.
- Negative source amounts are not accepted. Reversal direction is encoded in entry kind and `reversesEntryId`.

### 5.4 Preview versus commit

A user can draft an outgoing sale or incoming signing and receive:

- **Before / after** transfer capacity and weekly wage commitment.
- Each applicable rule verdict with exact thresholds and affected player data.
- An explicit “Preview only — no changes recorded” state.
- A disabled confirmation button for blockers. Warnings may be acknowledged and committed if there are no blockers.

**Race protection:** A preview is not permission forever. Re-read current data and re-evaluate on commit; a stale view or another tab cannot spend the same budget twice.

### 5.5 Quotas and incomplete data

- When a hard-check rule requires a missing field (e.g. age, weekly wage, homegrown eligibility), show an `INSUFFICIENT_DATA` blocker and a way to supply it. Unknown is not an automatic fail **until** that field is required by an enabled rule/action.
- Homegrown definitions vary by competition. v1 uses **configurable challenge presets**, not asserted legal/league-specific calculations. User-supplied eligibility flags are authoritative for the companion; provenance is visible.
- Validate registration under one selected competition preset at a time. Only registered players assigned to valid required slots may be confirmed.

---

## 6. DUAL DATA PIPELINE

### 6.1 Loader A — reproducible fictional demo (required for public deployment)

Seed a fully fictional ecosystem without externally supplied files:

- **4 fictional leagues × 18 clubs = 72 clubs**, approximately **3,000 players** distributed unevenly but plausibly across clubs and free agents.
- Generation based on a **versioned fixed-seed PRNG**; same seed + generator version yields the same names, ratings, clubs and budgets.
- Position-aware attribute ranges, realistic age distributions, academy tier, modest finance/prestige tiers, randomized but coherent wages and values.
- Fictional countries/regions may use real-world country codes for nationality metadata; **all club/team names, crests, and player identities must be invented**. Avoid direct copies of recognizable squad rosters or unique combinations.
- Include a polished **featured demo campaign** with example finances, offers, transfer targets, two or three manually authored sample match records, incomplete-registration warning, and a vivid but explainable rule-engine scenario.
- Seed data in bounded batches, surface progress/errors, and write **idempotently**. Reloading the demo must never duplicate initial records.
- Distinguish **factory demo reset** (destructive confirmed action) from opening a persistent demo save.
- Store `generatorVersion`, seed and source provenance in campaign metadata.

**Do not claim the fabricated player ratings represent any licensed real dataset.**

### 6.2 Loader B — user-controlled CSV/JSON real-data import

Import runs **in the browser only**. No bundled or uploaded copyrighted real-world player datasets.

Minimum ingest capabilities:

1. Choose/drag a `.csv` or `.json` file, with clear accepted shape and file-size guidance.
2. Parse in a Worker for significant files; fail gracefully on unsupported format or malformed encoding.
3. Detect header candidates; provide a field-mapping UI with a sample preview.
4. Validate **required identity columns** (`playerName`; club mapping optional) and optional columns (club, league, age/DOB, positions, nationality, potential, wage, value, contract, attributes).
5. Show units and allow explicit wage/value transformation (e.g. source `€k/week`, `€`, or null). Never guess unsupported currency or convert FX silently.
6. Normalize to canonical types; report missing fields, collisions, invalid rows, duplicates, unknown clubs/positions, and mapping decisions.
7. Preview row counts and warnings **before** committing; offer skip-invalid or abort modes.
8. Create a **new imported campaign** or import a player pool into a chosen campaign via an explicit safe workflow. No silent replacement of an existing roster.
9. Commit valid staged records transactionally or in a recoverable staging/promote process; failure cannot leave a half-imported playable campaign.
10. Persist an `ImportReceipt` and source labels. Let users edit missing wages, club assignments and eligibility afterward.

**Reality check:** Kaggle files do not share a uniform schema or guaranteed license; not every dataset includes club budgets, accurate wages, homegrown data, or 18,000+ rows. Support field mapping and unknowns rather than promising fixed coverage/import time. Do not host copyrighted imports or assert that personal imports are automatically redistributable.

Target **up to 25,000 players** as a tested scale goal. Measure parse, load and query time on named reference hardware in Phase 10. Do not promise universal 2-second import or sub-3ms queries.

### 6.3 Loader C — youth academy/newgens

- Newgen generation is **optional and opt-in** when completing season rollover.
- Defaults: **enabled** on fictional campaigns; **disabled** on imported real-world companion campaigns, because the external game remains the source of truth.
- U19 prospects use academy tier, scouting region, current season and seeded PRNG to produce consistent players and declared fictional provenance.
- Do not auto-insert generated players as if they appeared in the console game's academy. Present them as **planning candidates** unless the user explicitly adds/records them as part of their companion roster.
- Generate at most the configured small batch per academy per season; protect from duplicate reruns with season/newgen generation receipts.
- Aging should update derived age/reference season without falsifying historical records; keep historical appearances and contract audit intact.

---

## 7. FEATURE CONTRACTS

### 7.1 Campaigns and command center

- Campaign create/open/switch/rename/archive/delete, with safe confirmation and scoped queries.
- Fictional demo picker; first-run walkthrough; empty state for a new/imported club.
- Summary cards: remaining transfer capacity, weekly wages, squad count/age, registration status, active bids, expiring contracts, upcoming self-assigned tasks.
- Chronological recent activity from audit events; **not** fabricated news.

### 7.2 Squad and contracts

- Filterable/sortable searchable player table with name, position, age (exact/estimated), wages, value, tier, contract end, minutes, provenance.
- Player detail drawer with history, contracts, notes, compare/shortlist actions, manual metadata correction.
- Weekly wage pyramid by squad tier, clear tier-cap lines and warning/block states.
- Propose and commit salary/tier/expiration changes via policy checks. Prevent duplicate active contracts.
- Player development notes are manual, with no claims of autonomous progression in the external game.

### 7.3 Tactical planner (static planning, not simulator)

- SVG pitch: preset formations (`4-3-3`, `4-2-3-1`, `4-4-2`, `3-5-2`), player assignments, role tags, starter/bench zones.
- Pointer, touch and **keyboard-accessible** methods to assign/swap a player; guard duplicate selections and invalid empty slots.
- Persist multiple lineups per season (e.g. “League XI”, “Cup Rotation”), validate players belong to the current roster.
- Show squad-fit/coverage indicators only from known ratings and position mappings. No pretense of predicting match outcomes.

### 7.4 Transfer desk and offer ledger

- Search player pool, filter and shortlist, manual notes; separate **proposal**, **offer**, and **completed transfer** states.
- Proposed incoming/outgoing deal calculates effect on budget/roster/wages, evaluates rules, then records completed external-game action.
- User records bid from another club, accepts/rejects it, with prestige-rule behavior and audit trail.
- No automatic auctions, transfer market simulation, or moving players just because a rule says they should sell.

### 7.5 Registration and selection

- Competition-scoped registration presets; manual eligibility fields with provenance.
- Validation over selected roster: limits, homegrown count, exempt youth, unknown required fields, duplicates.
- Matchday confirmation respects hard quota rules. Do not claim to certify real football regulations.

### 7.6 Match journal and season hub

- Manually enter opponent/date/home-away/result/competition, optional xG and notes, optional per-player minutes/goals/assists.
- Aggregate recorded appearances into minutes and season summaries; incomplete logs clearly labeled as incomplete.
- Edit a logged game through an audited correction flow or replace prior appearance rows in an atomic revision; no double counting.
- Season dashboard: played matches, W/D/L, goals, appearances, transfers, wage change, policy incidents, notes.
- Explicit **Review → Preview rollover → Confirm rollover**. Block when constitution demands unresolved qualifying offers or unresolved required state. Close old season and open new one atomically.
- No random simulated results. No automatic reading of another game's save file.

### 7.7 Moneyball analytics and scouting

- Squad age vs. recorded minutes scatter (peak-age window **configurable**, visual heuristic only).
- Wage pyramid by `squadTier` and spending concentration.
- Radar chart for 6 normalized selected attributes; show **Missing data** instead of invented values.
- Player comparison cards and transparent weighted archetype scores (e.g. Ball-Playing Defender / Box-to-Box Midfielder). Expose weights/formula; show confidence based on known-field coverage.
- “Insight feed”: deterministic **rules-based text** from actual ledger, age, wages, minutes, offers and user notes. Cite the underlying source record in-app.
- Label this feature “Insights” or “Scouting Signals”, **not AI predictions**. An optional local-model narrative adapter may be researched after v1 but must never be required for core product.

### 7.8 Backup, import/export, settings

- One-click **export of a complete campaign** to documented `.json` file, including version, campaign ID, generator metadata, entities, ledger, events and provenance. Include all user-created data.
- On import: validate envelope schema, versions, record relationships, row counts, file size, duplicate IDs, integrity, and **show summary before restore**.
- Restore as a **new campaign with remapped IDs** by default; destructive overwrite is out of scope for v1. Never corrupt existing campaigns when restore fails.
- Include upgrade path for older supported export versions and clear rejection for newer unsupported versions. Tests use actual v1 fixture files.
- Provide persistent storage status, disk usage estimate, manual backup reminder, privacy explanation, no telemetry by default.
- `.sqlite` exports are **out of scope** because v1 uses IndexedDB; JSON is the required interchange format.

---

## 8. TECHNICAL ARCHITECTURE / REPOSITORY SHAPE

Suggested structure (adjust shallow folder names only, preserve boundaries):

```text
src/
  app/
    App.tsx
    router.tsx
    providers/
    layout/
  components/
    ui/
    charts/
    graphics/
  features/
    campaigns/
    dashboard/
    squad/
    tactics/
    transfers/
    finance/
    registration/
    matches/
    seasons/
    scouting/
    import-export/
    settings/
  domain/
    models/
    rules/
    finance/
    player/
    seasons/
    seed/
    analytics/
    commands/
    validation/
  data/
    db.ts
    migrations/
    repositories/
    transactions/
  workers/
    import.worker.ts
  styles/
    tokens.css
  test/
    fixtures/
    helpers/
public/
  icons/
plans/
  phase1.md ... phase10.md
  phase1/guide1.md ...
README.md
ARCHITECTURE.md
DECISIONS.md
MASTER_PLAN.md
```

### Boundaries that may not be violated

- **Domain:** pure types, computations, rules, parsing normalization. No React imports, Dexie imports or browser globals.
- **Data:** Dexie schema and migrations; repository operations; transactional commits. No direct JSX/UI.
- **Features:** orchestration, hooks and UI. Calls domain APIs/repositories; no duplicated business rule math.
- **Worker:** parse heavy files/normalize records; communicate with explicit serializable typed messages; do not become another source of business truth.
- **Shared UI:** generic and reusable, but avoid premature component framework or dozens of abstractions.

### Persistence/write protocol

1. Validate command shape with Zod.
2. Read relevant campaign-scoped records and revision.
3. Calculate a pure domain preview.
4. If permitted and confirmed, open a short transaction over every affected store, re-check revision and all critical invariants, write records + related ledger/audit, increment revision.
5. On successful transaction, show the persisted result; on failure, show actionable error and do not claim success.
6. Never reuse ID collisions or edit another campaign through a stale route.

### Cross-cutting quality rules

- Every significant user action has loading/error/success UX; disable duplicate submission while committing.
- Money math stays in cents until formatting; never compare formatted currency strings.
- Use type-safe imports, schema parsing at trust boundaries, and explicit unknown states.
- Lists at 25k scale must use IndexedDB filtering/indexes, pagination/virtualization where appropriate; avoid synchronous full-data sorts every render.
- No private personal data in analytics, console logs, error reports, or remote services by default.
- Avoid runtime third-party CDN fonts/assets; bundle or use system fonts so offline UI truly works.
- Test dark theme, keyboard flows, import failures, storage failures, and demo reset behavior.

---

## 9. PHASE EXECUTION ROADMAP

**There are exactly 10 implementation phases.** Each row below is a contract for a future `plans/phase<number>.md`. The guide breakdown beneath each phase is the **minimum commit map**. The phase writer may split a guide if it is not safely commit-sized, but must not combine independent guides or change their order/dependencies without documenting why.

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

### PHASE 7 — Match journal, seasons and optional newgens

**Outcome:** The companion can follow an entire manually played career season.

- `P07-G01` — Match form/journal, optional xG, result and appearance validation. Commit: `feat(p07-g01): record played matches`.
- `P07-G02` — Appearance totals, player minutes and season record aggregation. Commit: `feat(p07-g02): derive season performance from logs`.
- `P07-G03` — Audited match corrections, season review and timeline. Commit: `feat(p07-g03): review and correct season history`.
- `P07-G04` — Pure preview and atomic season rollover, carryover budget and pending-offer checks. Commit: `feat(p07-g04): advance campaign seasons explicitly`.
- `P07-G05` — Seeded youth generation with opt-in, import-save safeguards, idempotency and source labeling. Commit: `feat(p07-g05): support optional academy newgens`.
- `P07-G06` — E2E campaign-through-season test, age/reference progression and financial boundary checks. Commit: `test(p07-g06): secure season lifecycle`.

**Exit:** Users can record games, see accurate minutes, close a season once, open the next, and choose whether to generate fictional prospects.

### PHASE 8 — Scouting, comparisons and Moneyball insights

**Outcome:** High-value decision dashboards backed by actual saved data.

- `P08-G01` — Attribute normalization, archetype score formulas, missing-data confidence and tests. Commit: `feat(p08-g01): calculate transparent scouting signals`.
- `P08-G02` — Player radar comparisons and scouting reports with evidence. Commit: `feat(p08-g02): compare transfer targets`.
- `P08-G03` — Age/minutes matrix with selectable age windows and selectable datasets. Commit: `feat(p08-g03): visualize squad lifecycle`.
- `P08-G04` — Wage-tier distribution and transfer-decision visuals integrated with ledger. Commit: `feat(p08-g04): surface financial structure insights`.
- `P08-G05` — Deterministic insight feed, actionable flags and source-record links. Commit: `feat(p08-g05): generate grounded club insights`.
- `P08-G06` — Scalable search/filter tests and chart empty/missing data/a11y validations. Commit: `test(p08-g06): validate analytic integrity`.

**Exit:** Every statistic and insight traces to actual save records or clearly labeled seeded data; incomplete imports do not create fake metrics.

### PHASE 9 — CSV/JSON dataset import and campaign backup

**Outcome:** Practical long-term usability and file portability.

- `P09-G01` — Define complete versioned JSON backup envelope and export command. Commit: `feat(p09-g01): export portable campaign backups`.
- `P09-G02` — Implement validated new-campaign backup restore, remap IDs, transactional promotion and fixtures. Commit: `feat(p09-g02): restore backups safely`.
- `P09-G03` — Web Worker CSV/JSON parse with limits, warnings and malicious input handling. Commit: `feat(p09-g03): parse external datasets locally`.
- `P09-G04` — Visual field mapping, unit conversion, normalization and dedupe preview. Commit: `feat(p09-g04): map imported player records`.
- `P09-G05` — Atomic staged import to new campaign, import receipts, partial-record UX. Commit: `feat(p09-g05): commit user datasets safely`.
- `P09-G06` — Import/export round-trip, malformed data, cross-version fixtures, 25k-row baseline tests. Commit: `test(p09-g06): verify data interchange integrity`.

**Exit:** Export/import round-trip preserves every required entity and its relationships; failed imports leave existing campaigns intact.

### PHASE 10 — Offline PWA, accessibility, performance, portfolio release

**Outcome:** Ship-quality public static demo and release proof.

- `P10-G01` — Production service worker/manifest/icons, precache policy and offline install tests. Commit: `feat(p10-g01): deliver offline installable PWA`.
- `P10-G02` — Storage persistence/quota UX, backup reminders, import/error recovery. Commit: `feat(p10-g02): harden local data safety`.
- `P10-G03` — Keyboard/a11y/contrast/responsive hardening and reduced-motion checks. Commit: `fix(p10-g03): polish accessibility and responsiveness`.
- `P10-G04` — Profile 3k and 25k record operations; optimize indexed queries, lists and Worker boundaries with measured evidence. Commit: `perf(p10-g04): tune measured large-save workflows`.
- `P10-G05` — Documentation, demo walkthrough, screenshots, licensing/privacy statements, deployment setup, backup help. Commit: `docs(p10-g05): prepare portfolio release materials`.
- `P10-G06` — Full CI, production preview smoke, offline E2E, restore disaster test, release checklist and tagged v1 candidate. Commit: `test(p10-g06): certify v1 release candidate`.

**Exit:** Deployed demo works on HTTPS, core screens remain functional offline after initial load, accessibility baseline and full release checklist pass.

---

## 10. STANDARD FORMAT FOR EVERY `phase<number>.md`

A phase planner must generate a self-contained file with **all** of these sections in order:

```md
# Phase N — <Name>

## 1. Parent plan contract
- Reference `MASTER_PLAN.md` version and relevant sections.
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

1. Verify clean working tree and inspect existing files/tests.
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

### 12.1 Mandatory automated coverage

- **Unit:** pure formula/rounding, financial ledger, rule evaluation, age handling, seeded determinism, archetype missing-data logic, registration constraints.
- **Data integration:** Dexie schema, migrations, transaction rollback, stale revision, command idempotency where required, campaign isolation, season rollover, edit corrections.
- **UI/component:** validation messages, blockers disable commit, keyboard lineup assignment, route/empty states, row virtualization behavior.
- **E2E journeys:** onboarding → demo → lineup → sale → authorized purchase → journal → rollover → export → restore; failure modes on blocked actions and bad imports.
- **Fixtures:** deterministic tiny campaigns, strict-policy club, incomplete real-data import, 3k seed, synthetic 25k import for performance.

### 12.2 Explicit invariants to prove

1. A 70% sales rule with €10,000,000 of completed sales authorizes **€7,000,000** of additional capacity (before other allocations/spending); not €10m.
2. A paid transfer for a known 27-year-old violates default age 26 when enabled; a true free transfer may be exempt if configured.
3. A €46,000/week Key contract violates €45,000/week cap when enabled.
4. Two concurrent/stale proposed transfers cannot both spend the same remaining capacity.
5. Failed transactions do not move the player without ledger/audit, or write ledger without player movement.
6. Unknown player wage never silently counts as €0 when a wage-cap rule needs it.
7. A duplicate match/player appearance does not double-count minutes.
8. Season rollover cannot run twice; carryover is based on eligible unspent capacity once.
9. Import failures do not mutate an existing save; restore preserves referential integrity.
10. Every entity query/write uses correct `campaignId`; IDs from another save are rejected.
11. Deterministic generator emits identical output for the same seed + version.
12. Empty scouting attributes produce no fabricated 6-axis radar values or false percentile rankings.

### 12.3 Required commands (create scripts in Phase 1)

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

CI runs lint, typecheck, unit/integration tests and build on every PR; E2E smoke may run on PR and full E2E before phase exit/release. Each guide's commands reflect the scripts actually available at that moment.

### 12.4 Performance / UX budgets (targets, not guarantees)

Use named test hardware/browser, reproducible sample fixture and measured report in Phase 10. Initial budgets to **test and adjust based on evidence**:

- First demo open after assets cached: interactive without prolonged blank screen; show progress during one-time seed.
- 3k-player filters/search: smooth input response and no long main-thread tasks from full-array recompute.
- 25k-player import: progress indicator, cancel path, no persistent partial campaign, no frozen interaction for extended parsing periods.
- Tactical drag/assignment: clear feedback; no unexpected layout shifts.
- Typical dashboard interactions should feel responsive even with an imported save.

Avoid declaring fictional universal “3ms” database operations or “2 seconds” imports as promises; profile actual devices.

### 12.5 Accessibility and privacy release bar

- Keyboard-only user can create/open a save, navigate the app, assign a lineup, review rule blockers, enter a match, and export backup.
- No critical information relies solely on a color/hover effect or unreadable chart.
- User-generated/imported data stays in the browser unless the user explicitly downloads a backup or voluntarily uses the browser's own sharing actions.
- Static deployment contains **no secrets**, third-party player datasets, copyrighted photos, or network-dependent fonts.

---

## 13. RISKS / EXPLICIT MITIGATIONS

| Risk | Mitigation |
| --- | --- |
| Browser evicts local save | Clear first-run explanation, request persistence, backup affordance, export/restore, quota errors |
| Agent overbuilds a football manager game | Enforce Option B non-goals and explicit manual event record contract |
| Datasets omit or mislabel fields | Mapping preview, nullability, provenance, hard rules require known values |
| Imported data licensing | No hosted real squads, clear user responsibility/permission guidance, fictional public demo |
| Financial arithmetic drift | Integer cents, single tested calculation module, append-only ledger, atomic operations |
| Hard rule bypass in another UI path | Central commands + commit-time pure policy evaluation, negative integration tests |
| Multiple browser tabs write simultaneously | Revisions/optimistic checks, transaction boundaries, stale-state feedback |
| Season advances accidentally or twice | Multi-step confirmation, season status/ordinal checks, unique idempotency receipt |
| Import/restore damages current campaign | Staging, schema/relationship validation, import as new save, rollback cleanup |
| PWA hides old app code / schema mismatch | Test production updates and Dexie migrations; app update prompts with backup reminder |
| Dashboards imply unavailable stats | Provenance and missing-data states; only compute from available inputs |
| AI scope explosion | Ship deterministic grounded insights; optional local LLM only after stable v1 |
| Big saves freeze UI | Indexed queries, virtualization, workers, fixture-driven profiling |

---

## 14. SECURITY, LEGAL AND TRUST PRINCIPLES

- App performs client-side computations and storage by default; it has no user accounts and no app-owned backend.
- Treat every import and backup as untrusted: file-size guard, JSON shape validation, row-count bounds, string-length limits, no HTML evaluation, defensive parse/error handling.
- Prevent CSV formula injection if a future CSV **export** feature is added; v1 exports JSON only.
- Service worker never caches remote personal player datasets or third-party private content automatically.
- No exposed LLM/API secrets. If future integrations require remote credentials, design a separate consented architecture; do not insert keys in client bundles.
- Generated crests/shirts are independently designed SVGs. Real-world logos, badges, photos, and commercial database assets are not distributed.
- Include visible “Unofficial fan-made companion; not affiliated with any football game, team or league” disclaimer and content licensing notes.
- Exported backups can contain user-entered data; warn before sharing publicly. No analytics collection without explicit future opt-in.

---

## 15. DEMO / PORTFOLIO ACCEPTANCE SCRIPT

A reviewer should be able to perform this exact short journey in the fictional demo:

1. Open the URL; select **Try Demo**; view an invented club with a coherent squad and financial story.
2. Open **Constitution**; see active 70% sell-to-buy, age 26, wage-tier rules, with understandable descriptions.
3. Open **Transfers**; preview a purchase that is **BLOCKED** due to insufficient authorized capacity. See the specific number and remedy.
4. Record a completed player sale. Observe a new audit event, roster update, and increased authorized transfer capacity by **70% of that sale**.
5. Re-preview an eligible purchase; commit it if valid. Observe new player, ledger entry, reduced capacity, no double charge on reload.
6. Open **Tactics**; place the player in a saved XI with SVG pitch and keyboard/touch alternatives.
7. Open **Finance**; view wage-tier pyramid and ledger. Open **Squad**; inspect age/minutes information without manufactured match data.
8. Record a manually played match and player minutes; see the journal and analytics update.
9. Export JSON; restore it as a separate campaign; verify independent records remain intact.
10. Reload or go offline after initial load; open saved campaign and use core features.

**The portfolio story is the policy-checked managerial workflow**, not a pretend live match engine.

---

## 16. DEFINITION OF DONE FOR VERSION 1

A release is acceptable only when **all** statements below are true:

- [ ] Phases 1–10 have approved phase plans, completed guides and reviewable commits.
- [ ] Every guide's required test/verification evidence exists; full CI and release E2E pass.
- [ ] Public fictional demo starts without login, uploads, licensing-dependent assets or network data APIs.
- [ ] Campaign, squad, tactics, transfer, finance, registration, journal, season, scouting and settings screens are functional.
- [ ] Club constitution rules are enforced at commit time, with consistent previews, explanatory verdicts and audit trail.
- [ ] Save isolation, money precision, atomic writes, season rollover, and incomplete data are covered by tests.
- [ ] Fictional seed is deterministic/idempotent and real-data import has a safe mapping/preview flow.
- [ ] User can export a campaign backup and restore it as a separate playable campaign.
- [ ] Installable PWA works offline after asset caching; storage limitations are documented and backup controls visible.
- [ ] Keyboard navigation, mobile/tablet fallback, contrast and error/empty/loading states meet the accessibility baseline.
- [ ] README explains user workflows and non-goals; ARCHITECTURE/DECISIONS document implementation boundaries.
- [ ] Production build contains no proprietary real player databases, licensed crests, secrets or mandatory hosted AI service.
- [ ] Actual performance results for both normal fictional and 25k-player test fixtures are recorded without exaggerated guarantees.

### Post-v1 extension candidates — deliberately **not** included in phase plans

- Local on-device LLM-powered writing assistance grounded on saved records, opt-in with resource/privacy controls.
- Additional simulated or manually calibrated financial rule presets by competition (clearly labeled).
- Tauri desktop wrapper; optional SQLite import/export and carefully managed migration.
- More elaborate academy planner, player development histories, season report print/PDF.
- Read-only external dataset connectors **only** with lawful API access and explicit user consent.
- Cloud sync and accounts **only if** product strategy later changes; this would be a separate architecture revision.

---

## 17. PLANNING CHANGE CONTROL

Treat this v1 plan as frozen once phase generation starts. Minor clarifications may be added without expanding scope. Any material change must:

1. Describe the motivation and affected user outcome.
2. Update the corresponding master contract and version; record the change in `DECISIONS.md`.
3. Identify affected phases/guides and tests.
4. Regenerate only **unimplemented** affected guides or add explicit migration/follow-up commits; do not rewrite history.
5. Preserve export/DB backward compatibility or document/test a formal migration.

**Instruction to future agents:** Begin with `plans/phase1.md` from this exact specification. Do not start feature coding based solely on a visual mockup, do not add a match simulator, and do not move forward on failing tests.

---

## 18. NON-NORMATIVE TECHNICAL REFERENCES

The following sources explain browser and library constraints. They do not override this plan:

- [Dexie API reference](https://dexie.org/docs/API-Reference) — IndexedDB schema versions, indexes, and transactions.
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — why local storage is not equivalent to backups.
- [MDN origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) — optional future SQLite/OPFS exploration, **not a v1 dependency**.
- [Vite PWA plugin project](https://github.com/vite-pwa/vite-plugin-pwa) — precached static/offline shell support.

**END OF MASTER IMPLEMENTATION PLAN**
