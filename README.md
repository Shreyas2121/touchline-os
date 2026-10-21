# Touchline OS

Touchline OS is being developed as an offline **desktop Standalone Sporting Director Sim** using Tauri, React/Vite, a Rust backend and SQLite: build squads, negotiate transfers, follow board philosophies and simulate a fictional football world.

The web implementation is complete through **Phase 7 Guide 5**. The native application supports SQLite-backed reads, policy/finance previews, reviewed save migration, export/backup and guarded career management through **NM-G07**. You can create seeded Challenge/Sandbox careers or legacy campaigns, manage saves, and edit supported squad, tactics, registration, board and planning data. Legacy contracts, finance, offers, deals and match recording remain NM-G08; Continue remains blocked until the [native migration bridge](plans/native-migration.md) passes NM-G09.

Existing web careers can start on July 1 with generated clubs and Challenge/Sandbox rules. Match simulation, negotiations and Continue remain unavailable. See [MASTER_PLAN.md](MASTER_PLAN.md), [Phase 7](plans/phase7.md) and [DEC-002](DECISIONS.md).

## Non-goals

- No live match ticker in the initial standalone release
- No accounts
- No hosted player database

Independent football game project; not affiliated with any football game, team or league. Imported legacy saves retain their existing mode and history.

## Current web setup

The browser build remains the original IndexedDB application and migration exporter. Use the original browser address and profile to export an existing save. Desktop never falls back to that database.

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
pnpm exec playwright install chromium
pnpm test:e2e
```

Install Chromium once per machine, before `pnpm test:e2e`.

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

Reads include all ten workspace sections, native club-choice guards, paged player search, saved tactics graphics and profiles. Queries return at most 50 primary rows per collection with the saved revision; complete financial and eligibility inputs stay in Rust. Editors load missing roster pages explicitly and fetch a selected player's saved planning records before editing. Board edits use the current constitution even when the history is paged.

Choose **Create career**, enter a seed/year and rules preset, preview the native clubs and confirm your club. Standalone careers begin on July 1. Legacy creation also supports custom club names, colors and settings, including a Custom preset with no initial allocation until you enable a funding rule. Challenge constitutions are locked; standalone player, contract, money and managed-club changes remain forbidden. Sandbox board edits cannot issue a second opening allocation. Notes and shortlists never change player attributes or ownership.

Campaign controls support rename, archive/restore and confirmed deletion. Only the selected native demo can be reset; earlier season history is preserved when a legacy campaign changes its managed club. Registration replaces the managed club's competition selection only after explicit confirmation, with native eligibility/policy validation. Each new management action commits one revision and audit. Logical retries return the saved result without another effect; stale or rejected actions write nothing.

## Toolchain

- Node.js 22 (see `.nvmrc`)
- pnpm 12.9.1 (`packageManager` in `package.json`)

## Local database

The browser source stores legacy and standalone campaigns in IndexedDB v2. Its Export for desktop action produces a complete campaign snapshot. The desktop application stores imported campaigns in Rust-owned SQLite schema 1 under the app-local `com.touchline.os` directory. Production uses `touchline.sqlite3`; development and test profiles have separate subdirectories. Filesystem access is scoped to Rust-owned app storage and native dialog selections; frontend commands accept no file paths or SQL.

The browser application retains its existing IndexedDB name, `touchline-os`, and original workflows for migration reference. Desktop screens use GameClient and typed native services. Unsupported workflows remain disabled, with no browser mutations as fallback. Import transport receipts remain separate from gameplay audits and never increment campaign revisions.

Legacy and standalone demos use distinct native identities, `native-legacy-demo` and `native-standalone-demo`; reset replaces only that demo with its default seeded world. New worlds follow the declared Rust generator rules; DEC-003 does not require old JavaScript algorithm compatibility. Existing saved content is imported directly without regeneration. Deleting a campaign intentionally removes its owned history; deleted saves have no fictitious persisted revision or audit.
