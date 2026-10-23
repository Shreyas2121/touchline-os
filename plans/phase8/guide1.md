# P08-G01 — Add matchday storage contracts

## 1. Context and authority

- Master 3.0.4 / DEC-003 / DEC-005 / DEC-006 §§4.3, 4.5, 4.6, and 8; parent [Phase 8](../phase8.md) §§5.1–5.3.
- Predecessor: P07-G07 `test(p07-g07): verify native standalone foundations` at `364f4d333629efc4f24cd3a5c6b7359c06a0ff95`.
- Commit: `feat(p08-g01): add matchday storage contracts`.

This guide adds empty storage for fixtures, matches, and appearances. It does not generate a calendar, simulate a match, or change the kickoff stop.

## 2. Goal and user-observable result

Existing standalone saves still open. New and upgraded databases have match tables with no rows. Importing a source schema 2 snapshot still succeeds and does not invent fixtures. Exporting writes source schema 3. The Command Center still says `Match simulation arrives in Phase 8.`

## 3. Preconditions

Confirm the predecessor commit is an ancestor. Preserve `src-tauri/migrations/0002_standalone.sql` byte-for-byte. Preserve completed Phase 7 guides and recorded evidence. No new crate dependency. Do not start G02 behavior in this commit.

## 4. Files to inspect

- `src-tauri/migrations/0002_standalone.sql` — ID checks, STRICT tables, `schemaMigrations`, `PRAGMA user_version = 2`.
- `src-tauri/crates/game-store/src/lib.rs` — `SCHEMA_VERSION`, `migrate`, `check_database`.
- `src-tauri/crates/game-store/src/mapping.rs` — `TABLES` and the 21-collection comment.
- `src-tauri/crates/game-store/src/snapshots.rs` and `mutations.rs`.
- `src-tauri/crates/game-core/src/rows.rs` — `SnapshotTables`, `OutcomeRef`, `AuditAction` usage through `enums.rs`.
- `src-tauri/crates/game-core/src/validate.rs` — source schema 2 only, and collection length limits.
- `src-tauri/crates/game-core/src/career.rs` — export `source_schema_version` 2.
- `src-tauri/crates/game-store/tests/persistence.rs` — unsupported schema 1 and user-version checks.
- `src/platform/generated/SnapshotTables.ts` — generated; rebuild it, do not hand-edit.

## 5. Files to create/modify

- Create `src-tauri/migrations/0003_matchday.sql`.
- Extend core rows, enums, validation, and the career export version.
- Extend store mapping, migration, snapshot read/write, and persistence tests.
- Rebuild generated bindings.
- Update the Phase 8 progress row for this guide only after the commit exists.

Public row types, serialized camelCase with `deny_unknown_fields`:

```rust
struct FixtureRow {
    id, campaign_id, season_id, league_id, round, match_date,
    home_club_id, away_club_id, fixture_key, status, // scheduled | played
}
struct SimulatedMatchRow {
    id, campaign_id, fixture_id, home_goals, away_goals,
    home_xg_milli, away_xg_milli, timeline, input_snapshot,
    event_seed, engine_version,
}
struct SimulatedAppearanceRow {
    id, campaign_id, fixture_id, player_id, club_id, started,
    minutes, goals, assists, rating, yellow_cards, red_cards,
}
```

`SnapshotTables` gains `fixtures`, `simulated_matches`, and `simulated_appearances`, each `#[serde(default)]`. `OutcomeRef` gains `fixture` and `match`. `AuditAction` gains `simulation.matchday`.

## 6. Implementation steps

1. Add `0003_matchday.sql`. It runs only after schema 2 objects exist. Insert `(3, '0003_matchday')` and set `PRAGMA user_version = 3`.
2. Create the three tables from Phase 8 §5.3. Foreign keys point at the campaign and at `(campaignId, id)` of season, league, club, fixture, and player, using the same deferred style as `0002`. Index `(campaignId)` and `(campaignId, seasonId, round)`.
3. Rebuild `auditEvents` inside the migration transaction: create the replacement with the existing action list plus `simulation.matchday`, copy every row, drop the old table, and rename. Keep every other column and index.
4. Teach `migrate` to apply `0002` then `0003` for an empty version 0 file, apply only `0003` for version 2, accept version 3, and return `UnsupportedSchema` for every other version without writing.
5. `check_database` requires user version 3 and both migration names. Column checks include the new tables.
6. Map the new columns explicitly. Timeline and input snapshot are JSON text. Booleans use the existing integer 0/1 convention.
7. Validate rounds 1–34, goals 0–15, xG milli-units 0–20,000, minutes 0–90, rating 0–100, yellow cards 0–2, red cards 0–1, dates, engine version `"1"`, and unique fixture/player pairs. Reject unknown status values.
8. Accept snapshot source schema 2 and 3. Schema 2 payloads omit the new arrays. New career validation and export write source schema 3 with empty arrays. Do not generate fixture rows.
9. Raise snapshot length limits to 2,048 fixtures, 2,048 matches, and 80,000 appearances. Keep the 32 MiB byte ceiling.
10. Rebuild bindings. Leave `preview_time`, the kickoff message, and Continue behavior unchanged.

## 7. Tests to add/change

- A temporary schema 2 database opens as user version 3, gains empty match tables, and keeps its campaign rows.
- A schema 1 file and a user version other than 0, 2, or 3 are refused, and the file bytes stay the same.
- Store round-trip of one scheduled fixture, one match, and both clubs' appearances.
- Duplicate `(fixture, player)` and a second match for one fixture fail.
- A source schema 2 snapshot imports with zero match rows. Export then reimport keeps source schema 3 and those explicit rows.
- An unknown engine version, a goal of 16, and xG above 20,000 fail validation.
- Existing kickoff progression tests still stop with `Match simulation arrives in Phase 8.`

## 8. Verification commands

```bash
pnpm native:bindings:check
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

Focused persistence and snapshot tests come first. Unit and integration tests plus these checks are sufficient (DEC-005).

## 9. Acceptance coverage

Cover Phase 8 acceptance items 1 and 2: the schema 2 upgrade, the untouched unsupported file, and schema 2 import without invented fixtures. No desktop session is required.

## 10. Definition of done

- [ ] `0002_standalone.sql` is unchanged.
- [ ] Schema 3 opens, upgrades, and rejects unsupported files without writing them.
- [ ] Source schema 2 imports and schema 3 exports round-trip.
- [ ] Kickoff still refuses match simulation.
- [ ] No schedule, engine, selection, or matchday command is included.
- [ ] Generated bindings match the Rust DTOs.

## 11. Commit instructions

```text
feat(p08-g01): add matchday storage contracts
```

Stage the migration, core/store contract changes, generated bindings, tests, and the Phase 8 progress row. Do not stage unrelated dirty files.

## 12. Handoff

G02 can add pure calendar functions without writing these tables. The kickoff stop remains until G05. New commands must use `simulation.matchday`, not `simulation.advance`.
