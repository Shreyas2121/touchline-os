# NM-G01 — Browser migration export and golden fixtures

## 1. Context and authority

Master 3.0.0 → [native migration plan](../native-migration.md) → this guide.
Predecessor: Completed P07-G05 at df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3; preserve evidence commit 7b3c6a0.
Commit: `feat(nm-g01): capture browser saves and compatibility fixtures`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Create a complete readonly browser-save export and immutable compatibility fixtures before changing runtime/storage.

## 3. Preconditions

Read master, DEC-002 and bridge plan. Inspect git status; preserve completed P07-G01–G05 and unrelated work. Verify predecessor evidence before code. Introduce only dependencies assigned to this guide, with verified versions/lockfiles. Missing future feature is an unavailable state, never permission to fall back to Dexie.

## 4. Files to inspect

- src/data/db.ts and migrations/v1.ts/v2.ts (23 stores)
- src/domain/validation/schemas.ts and simulation/schemas.ts
- src/domain/seed/prng.ts, generate-world.ts, generate-playable-world.ts
- src/domain/simulation/random.ts, calendar.ts, career.ts
- src/app/pages/WelcomePage.tsx, campaign/settings utilities and existing fixtures

Paths under new native directories exist only after their introducing guide; do not assume future files are already implemented.

## 5. Files to create/modify

- src/domain/migration/snapshot.ts — envelope/limits/relationship validation
- src/data/exports/export-campaign.ts — consistent readonly capture
- Browser Export for Desktop action and local JSON download
- compatibility/manifest.json and synthetic snapshot/vector JSON fixtures
- scripts/capture-compatibility.mjs or equivalent explicit fixture-capture script
- src/test/migration-export.test.ts and browser export coverage

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Define formatVersion 1 with indexeddb/sqlite origin discriminators and source-specific schema versions; exporter initially emits indexeddb. Require explicit arrays for all 23 stores and exactly one campaign. Declare size/row/string/numeric limits and test boundaries.
2. Capture all campaign-owned rows and revision in one readonly Dexie transaction. Include only campaign-scoped import receipts; do not append export audits, increment revision or update source data.
3. Validate/serialize after the captured snapshot is available; do not await external work inside the IndexedDB transaction. Preserve null/absent values, IDs, money, keys, fingerprints and audits.
4. Add an accessible local Export for Desktop download action with progress/errors. It must run at the original browser origin; display the origin and explain empty-source/missing-campaign states.
5. Commit synthetic legacy v1, legacy v2 and standalone v2 snapshots. V1 normalization only supplies missing legacy/sandbox metadata and empty simulation arrays; current exported schema reflects actual opened DB version.
6. Capture existing JS hash/PRNG/stream/fingerprint/date/money/policy and generator v1/v2/prepared-career output for ASCII, non-ASCII and astral Unicode seeds. Use full expected data or a documented canonical digest comparison recipe.
7. Keep fixtures immutable and independent of later Rust output. Record capture inputs, current checkpoint SHA, normalization and exact byte/text expectations. Do not capture personal saves or rebalance.

## 7. Tests to add/change

- Consistent export during competing writes yields one coherent revision; no cross-campaign rows.
- Original source data/revision/audit counts unchanged; cancellation/error does not mutate.
- All 23 arrays, supported versions, null/optional and existing receipt fingerprint strings preserved.
- Malformed/unsafe-number/inconsistent-reference fixtures rejected with actionable reasons.
- Committed compatibility vectors reproduce from current TS without Rust or ambient clock/randomness.

Prefer compatibility/integration properties over tests that mirror implementation. Keep golden data independent of the Rust port.

## 8. Verification commands

Run focused new tests first, then:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

No Rust/native command exists yet; do not claim native verification.
Run relevant browser compatibility/E2E when its flows are touched; NM-G09 records the complete cutover evidence.

## 9. Manual acceptance check

1. Open the original-origin web build, export one legacy and one standalone campaign, inspect envelope/counts, reload and confirm unchanged source.
2. Verify the downloaded file is local and a failed export leaves all source records intact.

## 10. Definition of done

- [ ] The narrow outcome is implemented and verified.
- [ ] Source/browser data and completed guide history are preserved.
- [ ] Required parity, negative and rollback checks pass.
- [ ] No new gameplay or false native/release claim is introduced.
- [ ] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
feat(nm-g01): capture browser saves and compatibility fixtures
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

NM-G02 can define Rust DTOs from the fixed envelope/models. SQLite import is not implemented yet. No Tauri install or Continue in this guide.
