# P09-G01 — Add negotiation storage contracts

## 1. Context and authority

- Master 3.0.4 / DEC-003 / DEC-005 / DEC-006 §§4.3, 4.5, 4.6, and 8; parent [Phase 9](../phase9.md) §§5.1.2 and 5.3.
- Predecessor: P08-G06 `test(p08-g06): verify a full simulated season` at `e673d15ffc486d51790c1beaa26de3dec8d745c7`.
- Commit: `feat(p09-g01): add negotiation storage contracts`.

This guide adds empty storage for negotiations and the offer snapshot columns. It does not choose a bid, settle a transfer, or change the July 1 continue target.

## 2. Goal and user-observable result

Existing standalone saves still open. New and upgraded databases have a negotiation table with no rows. Importing a source schema 3 snapshot still succeeds and does not invent bids. Exporting writes source schema 4. Command Center still advances July 1 to August 31, and Sim Matchday is unchanged.

## 3. Preconditions

Confirm the predecessor commit is an ancestor. Preserve `src-tauri/migrations/0002_standalone.sql` and `src-tauri/migrations/0003_matchday.sql` byte-for-byte. Preserve completed Phase 8 guides and recorded evidence. No new crate dependency. Do not start G02 behavior in this commit.

## 4. Files to inspect

- `src-tauri/migrations/0003_matchday.sql` — the audit-table rebuild and `PRAGMA user_version = 3`.
- `src-tauri/crates/game-store/src/lib.rs` — `SCHEMA_VERSION`, `migrate`, `check_database`.
- `src-tauri/crates/game-store/src/mapping.rs` — `TABLES` and the collection comment.
- `src-tauri/crates/game-store/src/snapshots.rs` and `mutations.rs`.
- `src-tauri/crates/game-core/src/rows.rs` — `OfferRow`, `SnapshotTables`, `OutcomeRef`.
- `src-tauri/crates/game-core/src/enums.rs` — `OfferStatus`, `AuditAction`.
- `src-tauri/crates/game-core/src/validate.rs` — source schema 2 and 3, and the offer checks.
- `src-tauri/crates/game-core/src/career.rs` — export `source_schema_version` 3.
- `src-tauri/crates/game-store/tests/persistence.rs` — schema upgrade and refusal.
- `src/platform/generated/SnapshotTables.ts` — generated; rebuild it, do not hand-edit.

## 5. Files to create/modify

- Create `src-tauri/migrations/0004_market.sql`.
- Extend core rows, enums, validation, and the career export version.
- Extend store mapping, migration, snapshot read/write, and persistence tests.
- Rebuild generated bindings.
- Update the Phase 9 progress row for this guide only after the commit exists.

Public row types, serialized camelCase with `deny_unknown_fields`:

```rust
struct NegotiationRow {
    id, campaign_id, season_id, player_id, buyer_club_id,
    seller_club_id, // nullable
    status, // proposed | countered | agreed | settled | rejected | expired | withdrawn | superseded
    fee_cents, reserved_cents, wage_cents, reserved_wage_cents,
    squad_tier, // key | rotation | youth
    expires_on, counter_count, opened_on, deadline_on, resolved_on, // resolved nullable
    engine_version, event_seed, qualification, // qualification is JSON text
}
```

`OfferRow` gains optional `negotiation_id`, `seller_club_id`, `deadline_on`, `origin`, `market_value_cents`, `bidder_prestige`, `seller_prestige`, `constitution_version`, and `compulsory`. `SnapshotTables` gains `negotiations`, with `#[serde(default)]`. New offer fields also default. `OutcomeRef` gains `negotiation`, `offer`, and `transfer`. `OfferStatus` gains `expired`, `withdrawn`, and `superseded`. `AuditAction` gains `market.tick`, `market.close`, `transfer.propose`, `transfer.settle`, and `offer.respond`.

## 6. Implementation steps

1. Add `0004_market.sql`. It runs only after schema 3 objects exist. Insert `(4, '0004_market')` and set `PRAGMA user_version = 4`.
2. Create `negotiations` from Phase 9 §5.3. Foreign keys point at the campaign and at `(campaignId, id)` of season, player, buyer club, and nullable seller club, using the same deferred style as `0003`. Index `(campaignId)`, `(campaignId, playerId)`, and `(campaignId, buyerClubId)`.
3. Enforce one open buy per player and buyer with a unique index on `(campaignId, buyerClubId, playerId)` for statuses `proposed`, `countered`, and `agreed`.
4. Rebuild `offers` inside the migration transaction. Copy every existing row. New columns are null except `compulsory`, which is 0. Extend the status check. Keep every copied value.
5. Rebuild `auditEvents` the same way, adding the five actions from §5.3. Keep every other column and index.
6. Teach `migrate` to apply `0002`, then `0003`, then `0004` for an empty version 0 file; apply only `0004` for version 3; accept version 4; and return `UnsupportedSchema` for every other version without writing.
7. `check_database` requires user version 4 and all three migration names. Column checks include `negotiations` and the new offer columns.
8. Map columns explicitly. Qualification is JSON text. Booleans and `compulsory` use the existing integer 0/1 convention.
9. Validate fee, reserved fee, wage, and reserved wage as nonnegative cents; counter count 0–2; dates; engine version `"1"`; status; and tier. Open statuses require a null `resolved_on`. Terminal statuses require `resolved_on`. `reserved_cents` is 0 unless status is `proposed`, `countered`, or `agreed`. Qualification, when present, is the object in §5.3 and nothing else.
10. Accept snapshot source schema 2, 3, and 4. Schema 2 and 3 payloads omit `negotiations`. New career validation and export write source schema 4 with an empty array. Do not generate negotiation or offer rows.
11. Keep the offer limit at 8,000 and add a 4,000 negotiation limit. Keep the 32 MiB byte ceiling and the 32-reference receipt limit.
12. Rebuild bindings. Leave `preview_time`, Sim Matchday, and Continue behavior unchanged.

## 7. Tests to add/change

- A temporary schema 3 database opens as user version 4, gains an empty `negotiations` table, keeps its match rows, and keeps its campaign rows.
- A schema 1 file and a user version other than 0, 3, or 4 are refused, and the file bytes stay the same.
- Store round-trip of one `agreed` negotiation and one offer whose snapshot and `compulsory` flag reload.
- A second open negotiation for the same buyer and player fails. A `settled` row may share that pair.
- `reserved_cents` above zero on a `rejected` row fails validation. Counter count 3 fails. Engine version `"2"` fails.
- A source schema 3 snapshot imports with zero negotiations. Export then reimport keeps source schema 4 and the explicit rows.
- Existing July 1 progression still targets August 31. Existing matchday tests still pass.

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

Cover Phase 9 acceptance items 1 and 2: the schema 3 upgrade, the untouched unsupported file, and schema 3 import without invented bids. No desktop session is required.

## 10. Definition of done

- [ ] `0002_standalone.sql` and `0003_matchday.sql` are unchanged.
- [ ] Schema 4 opens, upgrades, and rejects unsupported files without writing them.
- [ ] Source schema 3 imports and schema 4 exports round-trip.
- [ ] July 1 still continues to August 31, and Sim Matchday is unchanged.
- [ ] No valuation, agreement, settlement, or market command is included.
- [ ] Generated bindings match the Rust DTOs.

## 11. Commit instructions

```text
feat(p09-g01): add negotiation storage contracts
```

Stage the migration, core/store contract changes, generated bindings, tests, and the Phase 9 progress row. Do not stage unrelated dirty files.

## 12. Handoff

G02 can add pure bid planning without writing `negotiations`. The July 1 jump remains until G05. New commands must use the new audit actions, not `simulation.advance`. Legacy offers with a null negotiation id stay inert: they are not compulsory and G04 must not accept them.
