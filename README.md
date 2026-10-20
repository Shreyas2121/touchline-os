# Touchline OS

Touchline OS is being developed as an offline-first **Standalone Sporting Director Sim**: build squads, negotiate transfers, follow board philosophies and simulate a fictional football world.

The current code is complete through **Phase 7 Guide 5**. A new standalone career starts on 1 July with a generated club world, one chosen club, and either Challenge or Sandbox board rules. Challenge rules stay locked. Legacy companion campaigns can still record manual matches, offers, and ledger entries. Match simulation, transfer negotiation, and Continue are not implemented yet. See [MASTER_PLAN.md](MASTER_PLAN.md), [Phase 7](plans/phase7.md) and [the pivot decision](DECISIONS.md). The next implementation guide is [P07-G06](plans/phase7/guide6.md).

## Non-goals

- No live match ticker in the initial standalone release
- No accounts
- No hosted player database

Independent football game project; not affiliated with any football game, team or league. Existing legacy screens still use the companion framing until their implementation guides update them.

## Setup

Install dependencies:

```bash
pnpm install
```

Start the dev server:

```bash
pnpm dev
```

## Checks

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

The following describes the currently implemented legacy companion workflows. The standalone systems in the plans remain pending.

Campaigns are stored in an IndexedDB database named touchline-os on this device. Creating a campaign, opening the fictional demo, renaming, archiving, deleting, correcting a player, saving a development note, saving a tactics lineup, saving a constitution, posting an opening allocation, posting prize income, reversing a ledger entry, saving a shortlist, recording a completed transfer, recording an offer, accepting an offer, rejecting an offer, saving a contract, saving a registration, and recording a match write to touchline-os. Scouting, seasons, import, and backup remain previews.

The fictional demo asks for a club once, and reset replaces only that demo.
