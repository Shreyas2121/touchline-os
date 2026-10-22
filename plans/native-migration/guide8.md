# NM-G08 — Retire manual campaign workflows

## 1. Context and authority

Master 3.0.2 / DEC-004 → [native migration plan](../native-migration.md) → this guide. DEC-004 replaces this guide's unimplemented manual match/finance/market port. Standalone simulation is the only supported gameplay mode. DEC-003 still removes previous-logic parity requirements.

Predecessor: NM-G07 `56933186b29fd1511f94b243252fc0e3f70789ed`; verify it is an ancestor and read the bridge evidence.
Commit: `refactor(nm-g08): retire manual campaign workflows`.

P07-G06 remains blocked until NM-G09 passes. Do not add Continue, simulated matches, negotiations or lifecycle behavior here.

## 2. Goal and user-observable result

The native app offers standalone Challenge/Sandbox careers and a standalone demo. It no longer offers manual campaign creation, manual demos, direct player corrections, club switching or manual journal/money/deal/contract recording. Historical manual saves remain preserved and clearly read-only, with inspection, export/backup and explicit deletion available.

## 3. Preconditions

Read master, DEC-002/003/004 and the bridge. Inspect git status, verify predecessor evidence and preserve completed guide files, source browser data and unrelated work. The canceled NM-G08 command port must not be resumed. No new dependency or schema migration is expected; justify one only if evidence requires it.

## 4. Files to inspect

- Native creation/management forms, workspace routes and capability copy.
- game-app creation/management services; game-core guards and command DTOs.
- Store transactional revision/receipt checks and existing import/export/backup behavior.
- Generated GameClient bindings and direct native command registration.
- Existing tests for manual creation/editing, standalone guards and source preservation.

## 5. Files to create/modify

- Native UI creation/demo choices and historical-save read-only state.
- Rust creation/management guards and obsolete manual-only API variants as appropriate.
- Generated DTOs/GameClient calls when their contract changes.
- Rust/UI retirement and unchanged-history tests, README and bridge evidence.

Do not delete historical enum values, row shapes, saved rows, fixtures, source files or stored receipts merely because their gameplay is retired. No automatic conversion of a manual save into a standalone career.

## 6. Implementation steps

1. Remove manual campaign/demo/custom-club setup choices from native creation. Retain seeded standalone Challenge/Sandbox creation, explicit club choice and the standalone demo with scoped reset/retry behavior.
2. Remove direct player add/update, managed-club switching and manual gameplay entry points from native screens. Do not replace them with a Sandbox cheat path. Allowed standalone notes, shortlist, tactics, registration and board edits remain.
3. Reject retired creation kinds, manual-demo reset and manual gameplay actions in Rust, including direct invokes and stale clients. A matching old receipt must not bypass retirement. Do not weaken the fixed-club, Challenge or no-second-allocation guards.
4. Make historical manual campaigns read-only in native gameplay routes and direct mutation services. Allow inspection, consistent export/backup and explicitly confirmed deletion; reject rename/archive/reset and all gameplay changes. Preserve their current revision, audit and rows on every refused write.
5. Keep existing supported snapshot import/export and schema preservation. Label historical mode accurately; do not regenerate missing players, invent simulation state or enable Continue on these saves. No new manual-specific screens or workflows are required.
6. Remove obsolete availability tests alongside the retired behavior; replace them with meaningful direct-call refusal, historical preservation and standalone regression checks. Keep historical fixture files and completed evidence unchanged. The frozen browser source/exporter is not a second supported playable product and need not be rewritten.
7. Refresh native status/help copy and API documentation to describe actual supported scope. Unimplemented simulation features remain unavailable in their assigned phases.

## 7. Tests to add/change

- Only standalone careers/demo are offered and accepted; direct manual creation/reset and old retry paths cannot bypass retirement.
- A historical imported/manual save is inspectable and exportable, but all gameplay/lifecycle writes except explicit deletion refuse without side effects.
- Standalone fixed-seed creation/retry, Challenge lock, Sandbox allocation limit, planning, tactics, registration and scoped demo reset still work.
- Snapshot round-trip/backup retains historical fields and receipts; another campaign and the browser source remain unchanged.
- No new match, offer, transfer, contract, ledger or clock effects appear.

## 8. Verification commands

Run focused tests first, then:

```bash
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

Run relevant browser E2E when shared entry/export flows change. Real Rust/SQLite/native checks cannot be replaced with mocked invoke tests. Record actual checks, including any removed obsolete test expectations.

## 9. Manual acceptance check

1. Create standalone Challenge and Sandbox careers; use permitted planning/tactics/registration/board controls and verify Challenge refusal and no duplicate allocation.
2. Inspect/export a synthetic historical manual save, attempt direct retired commands and verify unchanged rows/revision. No manual creation/demo/edit forms are offered.
3. Close/relaunch; verify standalone and historical data persist. Reset only the standalone demo and verify isolation.

## 10. Definition of done

- [x] Native product surface is standalone-only and direct Rust calls enforce it.
- [x] Existing stored history, source data and completed evidence are preserved.
- [x] Standalone regressions, retirement refusals and required checks pass.
- [x] No Continue, later-phase simulation or false release claim is introduced.
- [x] Actual evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only this retirement implementation, its tests/docs and bridge progress. Do not port the canceled manual workflows or rewrite completed history.

```text
refactor(nm-g08): retire manual campaign workflows
```

Do not commit failing required checks. Record the actual SHA; the bridge gate remains pending until NM-G09.

## 12. Handoff

NM-G09 certifies the standalone native foundation and data preservation. A working manual-mode journey is not a prerequisite. P07-G06 still follows the passed bridge gate.
