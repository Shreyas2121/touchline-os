# Touchline OS

Touchline OS is being developed as an offline **desktop Standalone Sporting Director Sim** using Tauri, React/Vite, a Rust backend and SQLite: build squads, negotiate transfers, follow board philosophies and simulate a fictional football world.

The web implementation is complete through **Phase 7 Guide 5**. The native application supports SQLite-backed reads, policy/finance previews, reviewed save migration, export/backup and guarded standalone career management through **NM-G09**. Create seeded Challenge/Sandbox careers, manage saves, and edit permitted tactics, registration, board and planning data. **Standalone simulation is the only supported gameplay mode** ([DEC-004](DECISIONS.md#dec-004--standalone-simulation-only-retire-manual-campaign-workflows)); manual campaign creation, demos and editing are retired in the UI and Rust command paths. The [native migration bridge](plans/archive/native-migration/native-migration.md) is complete and archived. Next is [P07-G06: Rust Continue](plans/phase7/guide6.md), advancing July 1 through the summer deadline to September 1 kickoff.

Native standalone careers start on July 1 with generated clubs and Challenge/Sandbox rules. Match simulation, negotiations and Continue remain unavailable until their assigned phases. See [MASTER_PLAN.md](MASTER_PLAN.md), [Phase 7](plans/phase7.md) and [DECISIONS.md](DECISIONS.md).

## Non-goals

- No live match ticker in the initial standalone release
- No accounts
- No hosted player database
- No companion/manual campaign mode or manual match, transfer, offer, contract or money recording

Independent football game project; not affiliated with any football game, team or league. Existing historical saves retain their recorded mode and history; they are not converted into simulated careers.

## Current web setup

The browser build remains the frozen original IndexedDB application and migration exporter, not a second supported playable product. Use the original browser address and profile to export an existing save. Desktop never falls back to that database.

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

On desktop, select **Import save**, choose an exported JSON file and review its mode, revision and table counts before confirming. Import preserves saved IDs and rows and leaves the browser source untouched. Reimporting identical bytes returns the recorded outcome; different content using an existing campaign ID is refused. Cancellation does nothing. **Export campaign** reads a consistent saved snapshot; choose a new filename to preserve prior exports. **Back up database** creates and reopens a SQLite online backup containing all native campaigns.

Reads include all ten workspace sections, historical save inspection, paged player search, saved tactics graphics and profiles. Queries return at most 50 primary rows per collection with the saved revision; complete financial and eligibility inputs stay in Rust. Editors load missing roster pages explicitly and fetch a selected player's saved planning records before editing. Board edits use the current constitution even when the history is paged.

Choose **Create career**, enter a seed/year and rules preset, preview the native clubs and confirm your club. Standalone careers begin on July 1. Challenge constitutions are locked; direct player, contract, money and managed-club changes remain forbidden. Sandbox board edits cannot issue a second opening allocation. Notes and shortlists never change player attributes or ownership.

Standalone campaign controls support rename, archive/restore and confirmed deletion, plus scoped standalone demo reset. Registration replaces the managed club's competition selection only after explicit confirmation, with native eligibility/policy validation. Each new management action commits one revision and audit. Logical retries return the saved result without another effect; stale or rejected actions write nothing.

Historical manual saves are labeled read-only and remain available for inspection, export/backup and explicitly confirmed deletion. They cannot be renamed, archived, reset, edited or converted into standalone careers. Old requests and matching receipts do not bypass retirement. Stored modes, IDs, rows, nulls and receipt/audit history remain unchanged on rejected writes. The frozen browser source retains its historical forms for migration/reference only.

## Toolchain

- Node.js 22 (see `.nvmrc`)
- pnpm 12.9.1 (`packageManager` in `package.json`)

## Local database

The browser source stores legacy and standalone campaigns in IndexedDB v2. Its Export for desktop action produces a complete campaign snapshot. The desktop application stores imported campaigns in Rust-owned SQLite schema 1 under the app-local `com.touchline.os` directory. Production uses `touchline.sqlite3`; development and test profiles have separate subdirectories. Filesystem access is scoped to Rust-owned app storage and native dialog selections; frontend commands accept no file paths or SQL.

The browser application retains its existing IndexedDB name, `touchline-os`, and original workflows for migration reference. Desktop screens use GameClient and typed native services. Unsupported workflows remain disabled, with no browser mutations as fallback. Import transport receipts remain separate from gameplay audits and never increment campaign revisions.

The playable demo uses `native-standalone-demo` and has a scoped confirmed reset. An existing `native-legacy-demo` is historical/read-only and cannot be recreated or reset. New worlds follow declared Rust generator rules; DEC-003 does not require old JavaScript algorithm compatibility. Existing saved content is imported directly without regeneration. Explicitly deleting a campaign removes its owned history; deleted saves have no fictitious persisted revision or audit.
