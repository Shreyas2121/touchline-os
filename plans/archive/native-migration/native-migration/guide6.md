# NM-G06 — Native read API, save migration UI and loaders

## 1. Context and authority

Master 3.0.1 / DEC-003 → [native migration plan](../native-migration.md) → this guide. Previous-logic parity is not required; native correctness and imported-data preservation remain required.
Predecessor: NM-G05; locate its subject in the bridge progress log and verify its commit is an ancestor.
Commit: `feat(nm-g06): read campaigns through native services`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Make existing screens read authoritative Rust/SQLite data and expose native save migration/export/backup through scoped dialogs.

## 3. Preconditions

Read master, DEC-002 and bridge plan. Inspect git status; preserve completed P07-G01–G05 and unrelated work. Verify predecessor evidence before code. Introduce only dependencies assigned to this guide, with verified versions/lockfiles. Missing future feature is an unavailable state, never permission to fall back to Dexie.

## 4. Files to inspect

- Current feature reads and src/app/providers/database.tsx
- NM-G02 GameClient/DTO contract and NM-G03 import/export/backup
- NM-G04 policies/calendar and NM-G05 generation/preparation
- Current app routes, loading/error states, fixture render helpers and migration exporter

Paths under new native directories exist only after their introducing guide; do not assume future files are already implemented.

## 5. Files to create/modify

- game-app campaign/screen queries and authoritative preview services
- Thin src-tauri query/migration/export/backup commands and scoped dialogs
- GameClient native adapter/provider and read-model hooks/loaders
- Feature call sites moved away from concrete Dexie interfaces
- Native import/export/backup UI plus UI/API integration tests

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Implement bounded per-screen projections and paged player queries with snapshot revision. Financial/rule/eligibility previews use Rust core; avoid chatty per-player IPC and full-world responses on every render.
2. Expose native file-selection import/export/backup via scoped adapters; cancellation does nothing. Validate in Rust even after frontend preview.
3. Wire GameClient into existing React UI and route guards; remove direct repository/command dependencies from desktop feature entry points. Browser-client wraps existing code only for frozen export/compatibility.
4. Declare supported capabilities. Native writes not yet ported are disabled/unavailable with clear copy; never call browser mutations as fallback.
5. Preserve names/colors/SVG/tables/forms and error semantics. UI-only formatting stays TS; no new authoritative money/policy/clock math.
6. Show migration summary/counts/modes before import; preserve IDs and explain different-content collision refusal. Source browser data is untouched.
7. Refresh query state from persisted snapshots after successful import. Keep import receipts separate from gameplay audit/revision.
8. Update README to the actual native read/import milestone, not a finished game.

## 7. Tests to add/change

- Native queries scoped/paged with correct revision/provenance and no cross-save data.
- Rust preview outputs match expected core policy/finance data.
- Dialog cancel/error/import collision/duplicate-file and source-preservation behavior.
- UI uses GameClient and shows unavailable native writes without Dexie fallback.
- Native export/backup round-trip and screen reload; browser exporter/tests preserved.

Prefer native correctness/integration properties over tests that mirror implementation. Keep historical golden data unchanged and independent of native business logic.

## 8. Verification commands

Run focused new tests first, then:

```bash
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

The native scripts are introduced by NM-G02. Missing prerequisites or failed native checks must be resolved; a frontend/mock pass is not a substitute.
Run relevant browser compatibility/E2E when its flows are touched; NM-G09 records the complete cutover evidence.

## 9. Manual acceptance check

1. Import synthetic legacy and standalone files into native app, inspect every screen and reopen.
2. Cancel dialogs and try a collision; verify no partial changes. Confirm writes are truthfully unavailable pending next guides.

## 10. Definition of done

- [x] The narrow outcome is implemented and verified.
- [x] Source/browser data and completed guide history are preserved.
- [x] Required native correctness, negative and rollback checks pass under DEC-003.
- [x] No new gameplay or false native/release claim is introduced.
- [x] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
feat(nm-g06): read campaigns through native services
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

NM-G07 restores native management mutations. A readable/importable app is not the passed cutover gate.
