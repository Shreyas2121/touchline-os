# Architecture and product decisions

## DEC-001 — Pivot to Standalone Sporting Director Sim

- **Date:** 2026-10-20
- **Status:** Accepted for planning by the user's documentation-update request; implementation pending
- **Plan change:** `MASTER_PLAN.md` 1.0.0 → 2.0.0; product release target remains v1
- **Checkpoint:** Phases 1–6 complete; P07-G01 complete at `b5332a73353d5fd83d1258776984d79c1ed586b6`, followed by progress commit `e77d9a6`

### Motivation and outcome

The user wants a playable local sporting-director game rather than a workspace requiring a career played in an external game. Preserve the implemented stack, saves, policy engine, finance, squad/tactics UI and transactional commands while adding deterministic autonomous gameplay.

### Planning defaults

Use instant results with reports and automatic substitutions; lightweight fitness/sharpness, 7–28 game-day injuries and one-match straight-red league bans; Board Challenge presets with command-enforced locked rules and audited editable Sandbox. These are defaults adopted from the preceding review, not claims that the user separately selected each option. Changes before implementation require updating the master and affected pending guides.

Keep four independent 18-club leagues and 3,000 players. Defer live match ticker, cups, promotion/relegation, staff, morale, dismissal, detailed commercial accounting and hosted services.

### Technical and data decisions

1. Keep Vite/React/TypeScript/Dexie, pure domain functions and command-level transactions.
2. Preserve completed phases/guides. Resume at the replacement P07-G02; no Phase 1 regeneration.
3. Existing campaigns migrate to legacy/sandbox. Dataset kind and gameplay mode are separate fields. No implicit conversion or invented match history.
4. Preserve schemaV1 and generator v1. Add Dexie v2 plus playable generator v2 and separate standalone demo identity.
5. Initialize contracts, legal squad coverage, finite budgets and simulation profiles for the entire world.
6. Use explicit in-game dates and versioned event streams/keys independent of audit time and remappable entity IDs.
7. Keep canonical simulated fixtures/results/both-team appearances separate from legacy manual logs. Results are immutable and operations have idempotency receipts.
8. Make AI bids binding/affordable before a mandatory-sale rule can lock progression; reserve funds and pre-agree player terms.
9. Settle prizes/objective bonuses as awards earned in the closing season but credited once in the opening season, excluding them from closing carryover.
10. Challenge guards apply at every command path. Legacy manual money, deal, player and match writes reject standalone careers.

### Roadmap and document impact

| Phase | Revised scope                                                                      |
| ----- | ---------------------------------------------------------------------------------- |
| 7     | Migration/contracts, clock, playable generation, new career, preseason progression |
| 8     | Fixtures, instant engine, availability, reports and league tables                  |
| 9     | AI market, negotiations and both-club settlement                                   |
| 10    | Development, expiry, retirement, academy, objectives and season settlement         |
| 11    | Moneyball/scouting, formerly future Phase 8                                        |
| 12    | Import/backup/restore, formerly future Phase 9                                     |
| 13    | PWA/accessibility/performance/balancing/release, formerly future Phase 10          |

Amend MASTER_PLAN and phase7; replace only pending guides 2–6 and add guide7. Preserve Guide 1 byte-for-byte and its progress evidence. Archive the superseded phase7 plan/guides because several were untracked. Phase1–6 docs remain historical; future phase8–13 plans are generated when active.

Update README to distinguish the new product target from the currently implemented companion checkpoint. No gameplay code, schema migration or package upgrade is part of this documentation change.

### Verification and compatibility obligations

Future implementation must test actual v1 upgrades, atomic creation/rollback, complete legal worlds, mode/Challenge guards, seed/ID-remap stability, deadline consumption, retries and stale-tab conflicts. Later phases prove full-world simulation, coherent match records, budget conservation, actionable compulsory sales, exact award accounting, sustainable multi-season squads and deterministic restore.

This planning amendment makes no new runtime verification claim. The prior review's existing baseline was 42 passing test files / 503 tests; all new standalone deliverables remain pending.
