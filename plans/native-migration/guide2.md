# NM-G02 — Tauri workspace, DTOs and GameClient

## 1. Context and authority

Master 3.0.0 → [native migration plan](../native-migration.md) → this guide.
Predecessor: NM-G01; locate its subject in the bridge progress log and verify its commit is an ancestor.
Commit: `feat(nm-g02): establish the native application boundary`.

Phase 7 G06 is blocked until the full bridge passes. This guide ports existing capability; it does not implement Continue.

## 2. Goal and user-observable result

Establish the Tauri/Rust workspace, generated wire types and a typed UI application boundary without claiming storage migration is complete.

## 3. Preconditions

Read master, DEC-002 and bridge plan. Inspect git status; preserve completed P07-G01–G05 and unrelated work. Verify predecessor evidence before code. Introduce only dependencies assigned to this guide, with verified versions/lockfiles. Missing future feature is an unavailable state, never permission to fall back to Dexie.

## 4. Files to inspect

- NM-G01 envelope/manifest/vectors
- package.json, vite.config.ts, existing app bootstrap and DatabaseProvider
- Current repository/query/command call sites across features
- Official Tauri prerequisites/Vite/command docs and ts-rs APIs at implementation time

Paths under new native directories exist only after their introducing guide; do not assume future files are already implemented.

## 5. Files to create/modify

- src-tauri/Cargo.toml/Cargo.lock/rust-toolchain.toml and Tauri configuration/capabilities
- src-tauri/src/lib.rs/main.rs — thin shell/commands
- src-tauri/crates/game-core, game-store and game-app minimal compiling crates
- serde models and bounded wire DTOs matching existing snapshots
- src/platform/game-client.ts, native-client.ts, browser-client.ts, generated/
- scripts/native-check.mjs, native-bindings.mjs and new package scripts

Preserve existing schema/identity/version/nullable contracts. No real user save is a test fixture.

## 6. Implementation steps

1. Check Rust/MSVC/SDK/WebView2 prerequisites; record missing requirements honestly. Verify/pin compatible Tauri/serde/serde_json/ts-rs versions and the Rust toolchain; preserve unrelated frontend versions.
2. Create dependency direction: desktop → app → core/store; store may use core models. No Tauri/SQL/filesystem in core. Store is a compiling placeholder until NM-G03.
3. Define the current models and envelope DTOs with runtime field/enum/size/numeric validation. Preserve nullable versus optional attributes; generated TS must represent them correctly. Checked i64 money remains a JS-safe number on the wire, with explicit ts-rs mapping if required.
4. Define a GameClient inventory covering current reads/previews/writes, source migration and later clock methods. Tauri Result errors map to stable structured UI errors; do not expose raw SQL, arbitrary row writes or paths.
5. Generate TypeScript from Rust models and add a check that compares temporary output without rewriting tracked bindings. Type generation does not replace Rust validation.
6. Add isolated app-local dev/test paths and stable app identity. Native bootstrap/health can report storage/features unavailable until later guides; never fall back to IndexedDB.
7. Keep the original-origin browser exporter accessible via an explicit frozen browser build/entry. Preserve current browser tests; native mode displays a truthful bootstrap state.
8. Introduce pnpm tauri dev/build, native:check, native:bindings and native:bindings:check. Native checks run locked rustfmt/clippy/workspace tests; scripts handle build prerequisites explicitly.

## 7. Tests to add/change

- Rust DTO accepts committed valid fixtures and rejects invalid enums, unsafe money, malformed IDs and unsupported versions.
- Generated TS binding freshness and structured native-client error mapping.
- Workspace dependency direction; core has no platform/store dependency.
- Native shell opens existing frontend assets; unavailable storage cannot select Dexie.
- Browser exporter/oracle tests remain usable.

Prefer compatibility/integration properties over tests that mirror implementation. Keep golden data independent of the Rust port.

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

1. Run the native shell and verify bootstrap/health and unavailable storage states.
2. Open the original browser exporter separately and confirm source saves remain accessible.

## 10. Definition of done

- [ ] The narrow outcome is implemented and verified.
- [ ] Source/browser data and completed guide history are preserved.
- [ ] Required parity, negative and rollback checks pass.
- [ ] No new gameplay or false native/release claim is introduced.
- [ ] Evidence and limitations are recorded in bridge §10.

## 11. Commit instructions

Stage only related implementation/tests/docs and the bridge progress row. Do not stage later guide work or rewrite completed history.

```text
feat(nm-g02): establish the native application boundary
```

Do not commit failing required checks. Record actual SHA and commands/results; bridge gate remains pending until NM-G09.

## 12. Handoff

NM-G03 adds actual SQLite behind the store boundary. This shell is not a completed migration or native game.
