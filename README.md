# Touchline OS

Touchline OS is an offline-first sporting-director workspace for players managing a football career in another game: track a club, enforce self-imposed rules, plan squads and transfers, analyze finances, and document each season — without simulating matches.

## Non-goals

- No match simulation
- No accounts
- No hosted player database

Unofficial fan-made companion; not affiliated with any football game, team or league.

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

Campaigns are stored in an IndexedDB database named touchline-os on this device. Creating a campaign, opening the fictional demo, renaming, archiving, deleting, correcting a player, saving a development note, saving a tactics lineup, saving a constitution, posting an opening allocation, posting prize income, reversing a ledger entry, and saving a shortlist write to touchline-os. Registration, scouting, matches, seasons, import, and backup remain previews.

The fictional demo asks for a club once, and reset replaces only that demo.
