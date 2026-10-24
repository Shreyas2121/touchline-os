# P10-G01 — Add lifecycle storage contracts

## 1. Context and authority

- Master 3.0.4 / DEC-003 / DEC-005 / DEC-006 §§4.3, 4.5, 4.6, and 8; parent [Phase 10](../phase10.md) §§5.1.2, 5.2, and 5.6.
- Predecessor: P09-G06 `test(p09-g06): verify transfer budgets and deadlines` at `6611732fd234655395b874e05238ef70a6151c9c`.
- Commit: `feat(p10-g01): add lifecycle storage contracts`.

This guide adds empty storage for objectives, settlements, and development snapshots, plus nullable ledger award columns. It does not grow a player, settle a season, or change the review sentence.

## 2. Goal and user-observable result

Existing standalone saves still open. New and upgraded databases have the three lifecycle tables with no rows. Importing a source schema 4 snapshot still succeeds and does not invent objectives or growth. Exporting writes source schema 5. Command Center still says `Season rollover arrives in Phase 10.` Sim Matchday and Run Market are unchanged.

## 3. Preconditions

Confirm the predecessor commit is an ancestor. Preserve `src-tauri/migrations/0002_standalone.sql`, `0003_matchday.sql`, and `0004_market.sql` byte-for-byte. Preserve completed Phase 9 guides and recorded evidence. No new crate dependency. Do not start G02 behavior in this commit.

## 4. Files to inspect

- `src-tauri/migrations/0004_market.sql` — the audit-table rebuild and `PRAGMA user_version = 4`.
- `src-tauri/migrations/0002_standalone.sql` — `ledgerEntries` and `auditEvents` column lists.
- `src-tauri/crates/game-store/src/lib.rs` — `SCHEMA_VERSION`, `migrate`, `check_database`.
- `src-tauri/crates/game-store/src/mapping.rs` — `TABLES` and the collection comment.
- `src-tauri/crates/game-store/src/snapshots.rs` and `mutations.rs`.
- `src-tauri/crates/game-core/src/rows.rs` — `LedgerEntryRow`, `SnapshotTables`, `OutcomeRef`.
- `src-tauri/crates/game-core/src/enums.rs` — `AuditAction`, `PlayerLife`.
- `src-tauri/crates/game-core/src/validate.rs` — source schema 2 through 4, and the ledger checks.
- `src-tauri/crates/game-core/src/career.rs` — export `source_schema_version` 4.
- `src-tauri/crates/game-store/tests/persistence.rs` — schema upgrade and refusal.
- `src/platform/generated/SnapshotTables.ts` — generated; rebuild it, do not hand-edit.

## 5. Files to create/modify

- Create `src-tauri/migrations/0005_lifecycle.sql`.
- Extend core rows, enums, validation, and the career export version.
- Extend store mapping, migration, snapshot read/write, and persistence tests.
- Rebuild generated bindings.
- Update the Phase 10 progress row for this guide only after the commit exists.

Public row types, serialized camelCase with `deny_unknown_fields`:

```rust
struct BoardObjectiveRow {
    id, campaign_id, season_id, club_id,
    kind, // league_title | top_half | avoid_last
    target_position, reward_cents,
    outcome, // pending | met | missed
    engine_version, // "1"
}

struct SeasonSettlementRow {
    id, campaign_id, season_id, next_season_id,
    engine_version, settled_on,
    managed_position, prize_cents, objective_bonus_cents,
    carryover_cents, allocation_cents,
    table_json,
}

struct DevelopmentSnapshotRow {
    id, campaign_id, season_id, player_id,
    period, // midseason | season_end
    before_pace, before_finishing, before_passing, before_dribbling, before_defending, before_physical,
    after_pace, after_finishing, after_passing, after_dribbling, after_defending, after_physical,
    before_value_cents, after_value_cents,
    before_status, after_status, // active | retired
    points, // -3 through 4
    engine_version,
}
```

`LedgerEntryRow` gains optional `earning_season_id`, `settlement_id`, and `award_kind`. `SnapshotTables` gains the three collections, with `#[serde(default)]`. New ledger fields also default. `OutcomeRef` gains `settlement`, `objective`, and `development`. `AuditAction` gains `development.apply` and `season.settle`.

## 6. Implementation steps

1. Add `0005_lifecycle.sql`. It runs only after schema 4 objects exist. Insert `(5, '0005_lifecycle')` and set `PRAGMA user_version = 5`.
2. Create the three tables from Phase 10 §5.6. Foreign keys point at the campaign and at `(campaignId, id)` of season, club, player, and next season, using the same deferred style as `0004`. Index `(campaignId)` on each new table.
3. Enforce one objective kind per season, one settlement per closing season, and one snapshot per player per period.
4. `ALTER TABLE ledgerEntries` adds the three nullable columns. Do not rebuild `ledgerEntries` and do not change its kind check.
5. Rebuild `auditEvents` inside the migration transaction. Copy every existing row. Add the two actions from §5.6. Keep every other column and index.
6. Teach `migrate` to apply `0002`, then `0003`, then `0004`, then `0005` for an empty version 0 file; apply `0004` then `0005` for version 3; apply only `0005` for version 4; accept version 5; and return `UnsupportedSchema` for every other version without writing.
7. `check_database` requires user version 5 and all four migration names. Column checks include the new tables and the new ledger columns.
8. Map columns explicitly. Table JSON is text. Attribute and point columns are integers. Life status uses the existing `active | retired` strings.
9. Validate reward, prize, bonus, carryover, and allocation as nonnegative cents. Attributes are 0–100. Points are -3 through 4. Engine version is `"1"`. `award_kind` is null or one of `league_prize`, `league_title`, `top_half`, `avoid_last`. A `prize_income` row that sets any new field must set all three. Any other ledger kind must leave all three null. Table JSON, when present on a row written by a later guide, is not invented here; an empty settlement is enough for this guide's round trip. If a test writes table JSON, it is a JSON array of at most 72 objects with the keys in §5.6 and nothing else.
10. Accept snapshot source schema 2, 3, 4, and 5. Schema 2, 3, and 4 payloads omit the new collections. New career validation and export write source schema 5 with empty arrays. Do not generate objective, settlement, or snapshot rows.
11. Limits: objectives 256, settlements 64, snapshots 16,000. Keep the player, ledger, fixture, 32 MiB, and 32-reference limits.
12. Rebuild bindings. Leave `preview_time`, Sim Matchday, Run Market, and the review sentence unchanged.

## 7. Tests to add/change

- A temporary schema 4 database opens as user version 5, gains empty lifecycle tables, keeps its negotiation and match rows, and keeps its campaign rows.
- A temporary schema 3 database opens as user version 5 by applying `0004` and then `0005`, with an empty `negotiations` table and empty lifecycle tables.
- A schema 1 file and a user version other than 0, 3, 4, or 5 are refused, and the file bytes stay the same.
- Store round-trip of one `pending` objective, one settlement, one `midseason` snapshot, and one `prize_income` row whose award columns reload. A second objective of the same kind and season fails. A second snapshot for the same player and period fails.
- Points `5` fail validation. Engine version `"2"` fails. A `player_sale` row with `awardKind` set fails. A `prize_income` row with only `earningSeasonId` set fails.
- A source schema 4 snapshot imports with zero objectives, settlements, and snapshots. Export then reimport keeps source schema 5 and the explicit rows.
- Existing review copy is still `Season rollover arrives in Phase 10.` Existing market and matchday tests still pass.

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

Run the new store tests before the full set. Unit and integration tests plus these checks are sufficient (DEC-005). No desktop session is required.

## 9. Acceptance coverage

| Item | Evidence |
| --- | --- |
| 1 — Schema upgrade and refusal | Schema 4 and schema 3 upgrades, plus the unchanged schema 1 file. |
| 2 — Snapshot import and export | Schema 4 import stays empty; schema 5 reimport keeps the inserted rows. |
| 3–11 | Not this guide. Review copy and match rows stay as Phase 9 left them. |

## 10. Definition of done

- [ ] `0005_lifecycle.sql` is the only new migration, and `0002`–`0004` are byte-for-byte unchanged.
- [ ] User version 5 opens, and versions other than 0, 3, 4, and 5 do not write.
- [ ] Source schemas 2–4 still import. Export writes source schema 5.
- [ ] Generated bindings match the new rows.
- [ ] Review, market, and matchday behavior are unchanged.
- [ ] The Phase 10 progress log records this commit after it exists.

## 11. Commit instructions

```text
feat(p10-g01): add lifecycle storage contracts
```

Stage the migration, core and store mappings, generated bindings, persistence tests, and the Phase 10 progress row. Do not stage unrelated dirty files.

## 12. Handoff

G02 can import the new row types. It must not insert them. G04 is the first guide allowed to write a snapshot or a settlement. The review sentence remains until G05.
