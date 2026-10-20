# Touchline OS

Touchline OS is being developed as an offline **desktop Standalone Sporting Director Sim** using Tauri, React/Vite, a Rust backend and SQLite: build squads, negotiate transfers, follow board philosophies and simulate a fictional football world.

The current implementation is complete through **Phase 7 Guide 5 on the web/Dexie stack**. Native migration is planned, not implemented. First complete the [native migration bridge](plans/native-migration.md), starting with [NM-G01](plans/native-migration/guide1.md). Only after its NM-G09 cutover gate passes should Phase 7 Guide 6 implement Rust Continue; Guide 7 then verifies the foundation.

Existing web careers can start on July 1 with generated clubs and Challenge/Sandbox rules. Match simulation, negotiations and Continue remain unavailable. See [MASTER_PLAN.md](MASTER_PLAN.md), [Phase 7](plans/phase7.md) and [DEC-002](DECISIONS.md).

## Non-goals

- No live match ticker in the initial standalone release
- No accounts
- No hosted player database

Independent football game project; not affiliated with any football game, team or league. Existing legacy screens still use the companion framing until their implementation guides update them.

## Current web setup

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

## Toolchain

- Node.js 22 (see `.nvmrc`)
- pnpm 12.9.1 (`packageManager` in `package.json`)

## Local database

The current implementation stores legacy and standalone campaigns in IndexedDB v2. The migration bridge will export complete snapshots and import them into Rust-owned SQLite while preserving the original browser data. The exporter, native tooling and SQLite are pending; the current build still uses the commands above.

Campaigns are stored in an IndexedDB database named touchline-os on this device. Creating a campaign, opening the fictional demo, renaming, archiving, deleting, correcting a player, saving a development note, saving a tactics lineup, saving a constitution, posting an opening allocation, posting prize income, reversing a ledger entry, saving a shortlist, recording a completed transfer, recording an offer, accepting an offer, rejecting an offer, saving a contract, saving a registration, and recording a match write to touchline-os. Scouting, seasons, import, and backup remain previews.

Legacy and standalone demos have distinct identities; reset targets only the selected demo. Native build/check scripts will be introduced during NM-G02; real desktop verification is separate from the current frontend checks.
