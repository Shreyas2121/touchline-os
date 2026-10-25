# Touchline OS

Touchline OS is being developed as an offline **desktop Standalone Sporting Director Sim** using Tauri, React/Vite, a Rust backend and SQLite: build squads, negotiate transfers, follow board philosophies and simulate a fictional football world.

The web implementation is complete through **Phase 7 Guide 5**. The native application supports SQLite-backed reads, policy/finance previews, reviewed save migration, export/backup, guarded standalone career management, deterministic Continue through preseason, persisted league matchdays, and confirmed season rollover. Create seeded Challenge/Sandbox careers, manage saves, and edit permitted tactics, registration, board and planning data. **Standalone simulation is the only supported gameplay mode** ([DEC-004](DECISIONS.md#dec-004--standalone-simulation-only-retire-manual-campaign-workflows)); manual campaign creation, demos and editing are retired in the UI and Rust command paths. The [native migration bridge](plans/archive/native-migration/native-migration.md) is complete and archived. [Phase 8](plans/phase8.md) certifies the full league season; [Phase 9](plans/phase9.md) implements the transfer market; [Phase 10](plans/phase10.md) implements development, awards, roster renewal, academy intake, and the next calendar.

Native standalone careers start on July 1 with generated clubs and Challenge/Sandbox rules. **Run Market** stores that date's bids, then **Continue** moves through the summer window dates to the August 31 deadline and on to September 1 kickoff. The Transfers inbox uses Accept, Reject, Withdraw, and Settle. A qualifying bid stays open until Accept, and blocks a window close or season rollover. Each boundary is saved once; repeating it does not move time again. At kickoff, **Sim Matchday** previews the next opponent and asks for confirmation. It saves all 36 results and the first 1,224-fixture calendar atomically. Round 17 holds its date for **Apply Development**: review the changed ratings, then confirm before playing round 18. January match dates run the market first. **Close Window** ends the winter window before the next match. A lineup blocker names Tactics or Registration. After round 34, **Review Season** opens objective outcomes, awards, carryover, allocation, and roster changes. Confirm **Start Next Season** to settle once and reach the next July 1 with **Run Market** due. Loading, relaunching, or waiting never advances the career. See [MASTER_PLAN.md](MASTER_PLAN.md), [Phase 10](plans/phase10.md) and [DECISIONS.md](DECISIONS.md).

Fixtures & Results reads persisted scores, milli-unit xG, events, appearances and four league standings. The fixed-seed certification plays 34 rounds, applies halfway development, reopens, settles once, and replays without another prize or intake. It reconciles new-season awards and cash, preserves historical matches, and exports/reimports the rolled career within 32 MiB. Every club's contracted core and wage budget are checked after settlement and across two further pure roster-planning years; those years do not generate stored matches. The certification uses a new career's emergency selection; registered saved-lineup and blocker tests remain in the suite. Commands, export size, and runtimes are recorded in the [Phase 10 progress log](plans/phase10.md#progress-log); earlier evidence remains in the [Phase 8 log](plans/phase8.md#progress-log).

## Non-goals

- No live match ticker in the initial standalone release
- No accounts
- No hosted player database
- No companion/manual campaign mode or manual match, transfer, offer, contract or money recording
- Scouting charts and insight text remain Phase 11 work; remapped restore and dataset import remain Phase 12 work.

Independent football game project; not affiliated with any football game, team or league. The product contract is standalone-only ([DEC-006](DECISIONS.md#dec-006--standalone-is-the-only-campaign-model-remove-old-save-compatibility)). Old/manual save compatibility is not required.

## Frontend development

The normal frontend entry loads only the native application. Historical browser modules remain reference source and unit-test inputs; they are not a playable product, desktop fallback or save migration path. Use `pnpm tauri dev` for the game. `pnpm dev` serves the frontend, whose native operations require Tauri.

Install dependencies:

```bash
pnpm install
```

Start the dev server:

```bash
pnpm dev
```

## Current checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Unit and integration tests satisfy testing gates ([DEC-005](DECISIONS.md#dec-005--unit-and-integration-tests-satisfy-verification-gates)). Existing browser E2E tests are optional; desktop automation, manual testing and user sign-off are not required. Formatting, lint, type, binding and build checks remain required.

## Desktop setup and checks

With the pinned Rust toolchain, MSVC/Windows SDK and WebView2 installed:

```bash
pnpm tauri dev
pnpm native:bindings:check
pnpm native:check
pnpm tauri build
```

`native:check` runs Rust formatting, locked Clippy and native workspace tests, excluding the two opt-in season certifications. Frontend tests do not substitute for Rust/SQLite verification. `tauri build` produces MSI and NSIS installers on Windows; signing and final release certification remain later work.

Use the checks appropriate to the change:

| Change                                                                                                                                                | Native verification                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Pure development or roster planning                                                                                                                   | Focused tests, then `cargo test -p game-core --locked` from `src-tauri`; `pnpm native:check` before committing |
| Frontend, copy, documentation, or isolated planning changes                                                                                           | Routine checks; no season replay required                                                                      |
| Match engine/selection, calendar/progression, market/transfer rules, shared ability/generation rules, SQLite writes/schema, or snapshot/export/import | `pnpm native:check` and `pnpm native:test:season`                                                              |
| Full certification or release gate                                                                                                                    | `pnpm native:check:full` (routine checks plus season certifications)                                           |

`pnpm native:test:season` runs the complete 34-round SQLite/export/reimport test and the winter-market certification sequentially in **release mode**, with progress visible. Test assertions remain enabled. It does not run the separate save-file benchmark. The first optimized build costs extra compilation; subsequent runs reuse Cargo's release cache. Both tests are marked ignored in ordinary `cargo test` runs, with the command to run them in their ignore reasons. CI selects the optimized certification when a PR or push changes the relevant Rust rules, app services, persistence, schema, certification tests or runner configuration; manual CI runs always include it. When extending certification into a new module, include that module in the CI scope filter.

For just the full-season test, from `src-tauri`:

```bash
cargo test -p game-app --test full_season --release --locked -- --ignored --nocapture
```

The test creates a real career, plays all 1,224 matches through public commands, applies development, reopens after development and review, then settles and replays. It reconciles every appearance and standing, opening-season prizes and cash, carryover from the closing ledger, and allocation without another cash credit. It reopens and reimports the rolled save and checks the contracted floor across two further pure aged years. Separate SQLite service tests overlap confirmations from two workers and verify rollback and campaign isolation. Checkpoint reads use validated domain tables; the actual desktop export is measured and reimported. No production validation, database durability, fixture count, or assertion is disabled.

Historical season-read measurements improved from 148.54s to 119.09s (about 20%, excluding compilation); see the [verification record](docs/verification/native-season.md) for that scope and evidence. Current lifecycle certification includes extra settlement and roster checks; its measurements are in the Phase 10 progress log.

On desktop, select **Import save**, choose an exported JSON file and review its supported standalone format, revision and table counts before confirming. Supported standalone snapshots preserve saved IDs, rows, clock and receipts. SQLite-origin standalone snapshots using source schemas 2–5 are accepted; exports use schema 5. Older snapshots default to empty lifecycle collections. Import does not generate fixtures or growth. Unsupported modes/formats refuse without conversion. Reimporting identical bytes returns the recorded outcome; different content using an existing campaign ID is refused. Cancellation does nothing. **Export campaign** writes a consistent saved snapshot as compact UTF-8 JSON within the same 32 MiB ceiling used by import; choose a new filename to preserve prior exports. **Back up database** creates and reopens a SQLite online backup containing all native campaigns.

Standalone reads include all ten workspace sections, paged player search, saved tactics graphics and profiles. General screen queries return at most 50 primary rows per collection with the saved revision; Fixtures & Results uses a separate round read with all 36 fixtures and four 18-club tables; complete financial and eligibility inputs stay in Rust. Editors load missing roster pages explicitly and fetch a selected player's saved planning records before editing. Board edits use the current constitution even when the history is paged.

Choose **Create career**, enter a seed/year and rules preset, preview the native clubs and confirm your club. Standalone careers begin on July 1. On the Command Center, **Run Market** calculates the open window date and **Continue** asks Rust for the next foundation event, sending that saved date, cursor, revision and boundary. Continue advances a consumed summer tick to the next window date and August 31 to league kickoff. **Close Window** records the winter close without moving the date. Transfers reads the saved inbox. **Sim Matchday** handles league rounds; confirmation saves a deterministic result once, advances the date, and refreshes native reads. Squad minutes, goals and assists show Unknown before the calendar is saved and zero for players without appearances afterward. A repeated request returns the saved result and the current revision. A stale save asks you to reload. Challenge constitutions are locked; direct player, contract, money and managed-club changes remain forbidden. Sandbox board edits cannot issue a second opening allocation. Notes and shortlists never change player attributes or ownership. Continue does not change players, contracts, registration or money.

Standalone campaign controls support rename, archive/restore and confirmed deletion, plus scoped standalone demo reset. Registration replaces the managed club's competition selection only after explicit confirmation, with native eligibility/policy validation. Each new management action commits one revision and audit. Logical retries return the saved result without another effect; stale or rejected actions write nothing.

The native model has one campaign mode, one generator and one demo. There are no manual creation/edit commands, old-save readers, read-only historical workspaces or compatibility operation APIs. Challenge/Sandbox remain rule choices.

## Toolchain

- Node.js 22 (see `.nvmrc`)
- pnpm 12.9.1 (`packageManager` in `package.json`)

## Local database

The desktop application stores standalone campaigns in Rust-owned SQLite schema 5 under the app-local `com.touchline.os` directory. Production uses `touchline.sqlite3`; development and test profiles have separate subdirectories. Filesystem access is scoped to Rust-owned app storage and native dialog selections; frontend commands accept no file paths or SQL.

Schema 1 and browser snapshots are unsupported. Opening a schema 1 database returns an unsupported-schema error without changing the file. Supported schema 2–4 databases upgrade to schema 5, preserving saved rows and starting with empty lifecycle collections. Fresh databases use schema 5 with objectives, settlements, development snapshots, and award metadata. Desktop screens use GameClient and typed native services. Unsupported workflows remain disabled, with no browser mutations as fallback. Import transport receipts remain separate from gameplay audits and never increment campaign revisions.

**Apply Development** and **Start Next Season** persist one bounded lifecycle action, receipt, and audit. Prizes and met objective rewards belong to the opening season; board allocation and approved carryover add transfer capacity without another cash credit. Qualifying offers must be accepted first. Successful settlement expires other open reservations, updates squads, and creates 1,224 scheduled fixtures without copying results or lineups. Player profiles list stored development ratings and values. Planning notes do not apply growth by themselves.

The playable demo uses `native-standalone-demo` and has a scoped confirmed reset. New worlds follow declared Rust generator rules; DEC-003 does not require old JavaScript algorithm compatibility. Supported standalone snapshots are imported directly without regeneration; old/manual compatibility is out of scope. Explicitly deleting a campaign removes its owned history; deleted saves have no fictitious persisted revision or audit.
