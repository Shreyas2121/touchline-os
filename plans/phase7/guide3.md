# P07-G03 — Define deterministic game time

## 1. Context and authority

- Master: `MASTER_PLAN.md` 2.0.0 §§4.5, 6.1 and 7.1.
- Parent: `plans/phase7.md` §5.3.
- Predecessor: `guide2.md`; locate its commit with `git log --grep="feat(p07-g02): introduce standalone save contracts" -1 --format=%H` and verify ancestry.
- Commit: `feat(p07-g03): define deterministic game time`.

## 2. Goal and user-observable result

Pure previews consistently identify the next supported preseason event and its seed. Nothing advances or writes yet. Calendar dates and future outcomes cannot depend on the real clock or remapped save IDs.

## 3. Preconditions

G02 contracts/migration are complete. Inspect any existing calendar helpers before adding new ones. Do not mutate DB schema, install packages, write a new career or implement a match/market/lifecycle handler.

## 4. Files to inspect

- Phase §5.3 and the simulation schemas from G02.
- `src/domain/models/dates.ts` — validation, leap years, estimated age.
- `src/domain/seed/prng.ts` — stable hash and mulberry32.
- `src/domain/validation/limits.ts` — supported year/date bounds.
- `src/test/dates.test.ts` and `generate-world.test.ts`.

## 5. Files to create/modify

| Path                                   | Change                                                 |
| -------------------------------------- | ------------------------------------------------------ |
| `src/domain/simulation/calendar.ts`    | Season dates, window intervals, next boundary, preview |
| `src/domain/simulation/random.ts`      | Stable named stream keys and seed derivation           |
| `src/domain/models/dates.ts`           | Small reusable pure date arithmetic if needed          |
| `src/test/simulation-calendar.test.ts` | Boundary and leap-year cases                           |
| `src/test/simulation-random.test.ts`   | Reproducibility and ID independence                    |

Expose the APIs listed in phase §5.3. Every result uses validated DateOnly values. Include source/target boundary keys in the clock preview so G06 can fingerprint a request without the UI choosing an arbitrary date.

## 6. Implementation steps

1. Add validated pure date arithmetic without ambient Date/clock calls. Reuse existing parsers rather than copying date validation.
2. Define season July 1 Y → June 30 Y+1. Validate the chosen year against both dates' supported range.
3. Define calendar windows July 1–August 31 and January 1–31 inclusive. Also expose logical window readiness from state/cursor, so a consumed August 31 deadline is not still actionable as an open window.
4. Implement nextFoundationBoundary:
   - July 1 / no boundary consumed → August 31 summer deadline;
   - August 31 / summer deadline consumed → September 1 kickoff;
   - September 1 / kickoff consumed / league phase → no supported next event, reason `Match simulation arrives in Phase 8.`
5. Document current-date and consumed-boundary consistency. Invalid backwards dates/cursors or mismatched season state are refused; no zero-length infinite transition.
6. Derive event seeds using root seed, explicit simulation version, event kind and ordered stable logical keys. Use an unambiguous serialization and existing hash/PRNG. No campaignId, entityId, current wall clock or fresh actionId participates.
7. Provide independent streams for world, future fixture, market and development namespaces without implementing those systems. Drawing from one stream cannot change another.
8. Keep previews free of writes; do not add Continue UI yet.

## 7. Tests to add/change

- Correct July/June dates, leap-year crossing, lower/upper supported year rejection.
- Summer/winter boundary dates and outside-window dates.
- July→deadline→kickoff preview sequence with explicit lastBoundaryKey; consuming a same-day deadline moves to the next boundary, not itself.
- At kickoff preview is blocked with the Phase 8 reason; state is unchanged.
- Invalid date/phase/cursor combinations fail.
- Same seed/version/event keys repeat; different namespaces are independent; concatenation-ambiguous key arrays do not serialize identically.
- Entity/campaign ID remapping and different audit timestamps do not alter logical event seeds.
- Relevant domain modules contain no ambient randomness/clock use.

## 8. Verification commands

```bash
pnpm exec vitest run src/test/simulation-calendar.test.ts src/test/simulation-random.test.ts src/test/dates.test.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Browser behavior is unchanged; full browser checks are required again at G05/G06 and phase exit.

## 9. Manual acceptance check

Review the explicit preview fixtures: a July 1, 2026 state points to August 31; the consumed deadline points to September 1; a kickoff state cannot advance. Check that preview evaluation returns no persistent records.

## 10. Definition of done

- [ ] Dates, consumed-boundary behavior and reason text are explicit.
- [ ] Streams are stable, independently keyed and restore-safe.
- [ ] Tests cover actual leap/boundary and ambiguity cases.
- [ ] No writes, fixtures, live ticker or clock-driven gameplay.
- [ ] Required checks pass.

## 11. Commit instructions

```text
feat(p07-g03): define deterministic game time
```

Stage only related code/tests and phase evidence; record the SHA. Preserve later guide files and unrelated user changes.

## 12. Handoff

G04 reuses named streams, season dates and stable keys for generator v2. G06 later uses the same preview rules and cursor for persistence. There is still no gameplay time-advance command.
