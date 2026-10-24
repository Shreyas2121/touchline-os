# P10-G02 — Plan bounded player development

## 1. Context and authority

- Master 3.0.4 §§4.6, 6.3, and 12.2 invariant 8; parent [Phase 10](../phase10.md) §5.3.
- Predecessor: `feat(p10-g01): add lifecycle storage contracts`. The pure functions do not require the new tables to be queried.
- Commit: `feat(p10-g02): plan bounded player development`.

This guide computes growth, decline, and value. It does not write SQLite, change the clock, or create a player.

## 2. Goal and user-observable result

No screen changes. A fixed player, minute total, and development plan produce the same before-and-after attributes on every call. Two checkpoints together stay within four growth points. A goalkeeper and an outfielder do not decline on the same attribute order.

## 3. Preconditions

G01 may be committed or not. This guide only needs the existing attribute, ability, and value functions. Do not add a migration, a command, or a UI control. Do not bump `DEVELOPMENT_ENGINE_VERSION` beyond the `"1"` constant this guide declares.

## 4. Files to inspect

- `src-tauri/crates/game-core/src/ability.rs` — `role_ability` and `goalkeeper_rating`.
- `src-tauri/crates/game-core/src/generation.rs` — `market_value_cents`.
- `src-tauri/crates/game-core/src/generation_settings.rs` — attribute order and age bounds.
- `src-tauri/crates/game-core/src/rows.rs` — `PlayerAttributes`, `DevelopmentPlanRow`, `PlayerLife`.
- `src-tauri/crates/game-core/src/lib.rs` — module exports.
- Phase 10 §5.3 — the arithmetic this guide pins.

## 5. Files to create/modify

- Create `src-tauri/crates/game-core/src/lifecycle.rs` and export it from `lib.rs`.
- Add unit tests in `src-tauri/crates/game-core/tests/lifecycle.rs`.

Public pure API, with no SQLite types:

```rust
pub const DEVELOPMENT_ENGINE_VERSION: &str = "1";

pub struct DevelopmentInput {
    pub age: Option<i64>,
    pub potential: Option<i64>,
    pub attributes: PlayerAttributes,
    pub position_group: PositionGroup,
    pub target_role: Option<String>,
    pub minutes: i64,
    pub already_applied: i64,
    pub period: DevelopmentPeriod, // Midseason | SeasonEnd
    pub status: PlayerLife,
}

pub struct DevelopmentChange {
    pub before: PlayerAttributes,
    pub after: PlayerAttributes,
    pub before_value_cents: i64,
    pub after_value_cents: i64,
    pub points: i64,
    pub goalkeeping: Option<i64>,
}

pub fn plan_development(input: &DevelopmentInput) -> CoreResult<Option<DevelopmentChange>>;
```

`None` means the player is unchanged. `Some` means at least one attribute or the value changed. The function does not mutate the input.

## 6. Implementation steps

1. Parse `target_role` as Phase 10 §5.1.5. Use that group's weights. On an empty or unknown role, use `position_group`. Ignore plan notes; they are not an input.
2. Return `Ok(None)` for a retired player, a missing age, a missing potential, a missing attribute, an unknown position group, negative minutes, or `already_applied` outside 0–4.
3. Compute `annual` with the integer formula in §5.3. Midseason's point budget is `annual / 2`. Season end's point budget is `min(annual / 2, 4 - already_applied)`.
4. Apply growth points in the weight order from §5.3. Stop a point that would pass potential or 100.
5. When the season-end growth budget is 0 and age is at least 33, apply the position-aware decline table instead. The attribute floor is 1. Midseason never declines.
6. Recompute value with `market_value_cents`. For a goalkeeper, recompute `goalkeeping`. If value computation fails, return the error rather than a partial change.
7. Return `Ok(None)` when the attributes and the value are both unchanged. Otherwise return the before and after pair and the signed points actually applied.
8. Do not read appearances, write a snapshot, or consult the clock. Callers pass minutes and `already_applied`.

## 7. Tests to add/change

- `split_budget_never_adds_four_twice`: a 21-year-old with headroom 4 and 1530 minutes gets 2 points at midseason. Season end with `already_applied` 2 gets at most 2 more. The sum is at most 4.
- `missed_midseason_pays_only_the_end_half`: the same player with `already_applied` 0 at season end receives `annual / 2`, not `annual`.
- `zero_minutes_do_not_grow`: participation 0 returns `None` for an under-28 player.
- `decline_follows_position_weights`: age 37 at season end, identical attributes, goalkeeper versus forward, decline on different first attributes and by the §5.3 amounts. No attribute falls below 1.
- `value_uses_the_generator_formula`: the returned cents equal `market_value_cents` of the new ability. Potential is unchanged.
- `notes_are_not_an_input`: two calls that differ only by a role string the parser rejects are equal to a call with no role.
- `retired_and_incomplete_players_are_omitted`.

Names may match the module style. The behaviors above are the requirement.

## 8. Verification commands

```bash
pnpm native:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm native:check` includes rustfmt, Clippy `-D warnings`, and the workspace tests. Bindings and `pnpm tauri build` are not required when no DTO or command changes. No desktop session is required.

## 9. Acceptance coverage

| Item | Evidence |
| --- | --- |
| 3 — Stable split budget | `split_budget_never_adds_four_twice` and `missed_midseason_pays_only_the_end_half`. |
| 4 — Position-aware decline and value | Decline and value tests. Match rows are not loaded. |
| 1, 2, 5–11 | Not this guide. |

## 10. Definition of done

- [ ] `plan_development` is pure and covered by the cases above.
- [ ] The engine version constant is `"1"`.
- [ ] No migration, IPC, clock, or UI file changes.
- [ ] No snapshot row is inserted.

## 11. Commit instructions

```text
feat(p10-g02): plan bounded player development
```

Stage `lifecycle.rs`, its tests, `lib.rs`, and the Phase 10 progress row. Do not stage unrelated dirty files.

## 12. Handoff

G03 reads post-growth attributes from this function's output. It does not reimplement the point order. G04 is the first guide that stores `already_applied` from a snapshot.
