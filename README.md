# Touchline OS

Touchline OS is being developed as an offline **desktop Standalone Sporting Director Sim** using Tauri, React/Vite, a Rust backend and SQLite: build squads, negotiate transfers, follow board philosophies and simulate a fictional football world.

The web implementation is complete through **Phase 7 Guide 5**. The native application supports SQLite-backed reads, policy/finance previews, reviewed save migration, export/backup, guarded standalone career management, and deterministic Continue through **P07-G07a**. Create seeded Challenge/Sandbox careers, manage saves, and edit permitted tactics, registration, board and planning data. **Standalone simulation is the only supported gameplay mode** ([DEC-004](DECISIONS.md#dec-004--standalone-simulation-only-retire-manual-campaign-workflows)); manual campaign creation, demos and editing are retired in the UI and Rust command paths. The [native migration bridge](plans/archive/native-migration/native-migration.md) is complete and archived. Next is [P07-G07](plans/phase7/guide7.md), certifying the standalone foundation before Phase 8.

Native standalone careers start on July 1 with generated clubs and Challenge/Sandbox rules. Continue on the Command Center advances that date to the August 31 summer deadline and then to September 1 kickoff. Each new boundary is saved once; repeating it does not move time again. At kickoff the career stops with `Match simulation arrives in Phase 8.` Negotiations remain unavailable. Loading, relaunching, or waiting on the clock never advances the career. See [MASTER_PLAN.md](MASTER_PLAN.md), [Phase 7](plans/phase7.md) and [DECISIONS.md](DECISIONS.md).

P07-G07 integration coverage is implemented: 64 Rust tests, 699 frontend tests and the Windows release builds pass. Certification remains pending because Windows Application Control blocks the pinned Clippy executable (OS error 4551), including the outside-sandbox retry. See [verification evidence](plans/phase7.md#p07-g07-verification-evidence). After the native check passes, the next task is Phase 8 planning for fixtures and instant match simulation.

## Non-goals

- No live match ticker in the initial standalone release
- No accounts
- No hosted player database
- No companion/manual campaign mode or manual match, transfer, offer, contract or money recording

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

`native:check` runs Rust formatting, locked Clippy and native workspace tests. Frontend tests do not substitute for Rust/SQLite verification. `tauri build` produces MSI and NSIS installers on Windows; signing and final release certification remain later work.

On desktop, select **Import save**, choose an exported JSON file and review its supported standalone format, revision and table counts before confirming. Supported standalone snapshots preserve saved IDs, rows, clock and receipts. Only SQLite-origin standalone snapshots using source schema 2 are accepted. Unsupported modes/formats refuse without conversion. Reimporting identical bytes returns the recorded outcome; different content using an existing campaign ID is refused. Cancellation does nothing. **Export campaign** reads a consistent saved snapshot; choose a new filename to preserve prior exports. **Back up database** creates and reopens a SQLite online backup containing all native campaigns.

Standalone reads include all ten workspace sections, paged player search, saved tactics graphics and profiles. Queries return at most 50 primary rows per collection with the saved revision; complete financial and eligibility inputs stay in Rust. Editors load missing roster pages explicitly and fetch a selected player's saved planning records before editing. Board edits use the current constitution even when the history is paged.

Choose **Create career**, enter a seed/year and rules preset, preview the native clubs and confirm your club. Standalone careers begin on July 1. On the Command Center, **Continue** asks Rust for the next foundation event and sends that saved date, cursor, revision and boundary. It advances July 1 to the summer deadline, then to league kickoff, and then stops until Phase 8. A repeated request returns the saved result and the current revision. A stale save asks you to reload. Challenge constitutions are locked; direct player, contract, money and managed-club changes remain forbidden. Sandbox board edits cannot issue a second opening allocation. Notes and shortlists never change player attributes or ownership. Continue does not change players, contracts, registration or money.

Standalone campaign controls support rename, archive/restore and confirmed deletion, plus scoped standalone demo reset. Registration replaces the managed club's competition selection only after explicit confirmation, with native eligibility/policy validation. Each new management action commits one revision and audit. Logical retries return the saved result without another effect; stale or rejected actions write nothing.

The native model has one campaign mode, one generator and one demo. There are no manual creation/edit commands, old-save readers, read-only historical workspaces or compatibility operation APIs. Challenge/Sandbox remain rule choices.

## Toolchain

- Node.js 22 (see `.nvmrc`)
- pnpm 12.9.1 (`packageManager` in `package.json`)

## Local database

The desktop application stores standalone campaigns in Rust-owned SQLite schema 2 under the app-local `com.touchline.os` directory. Production uses `touchline.sqlite3`; development and test profiles have separate subdirectories. Filesystem access is scoped to Rust-owned app storage and native dialog selections; frontend commands accept no file paths or SQL.

Schema 1 and browser snapshots are unsupported. Opening an earlier database returns an unsupported-schema error without changing the file; it is not migrated, reset or deleted. Fresh databases use schema 2 with 21 standalone collections, excluding manual match journals and appearances. Desktop screens use GameClient and typed native services. Unsupported workflows remain disabled, with no browser mutations as fallback. Import transport receipts remain separate from gameplay audits and never increment campaign revisions.

The playable demo uses `native-standalone-demo` and has a scoped confirmed reset. New worlds follow declared Rust generator rules; DEC-003 does not require old JavaScript algorithm compatibility. Supported standalone snapshots are imported directly without regeneration; old/manual compatibility is out of scope. Explicitly deleting a campaign removes its owned history; deleted saves have no fictitious persisted revision or audit.
