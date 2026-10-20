> **ARCHIVED / SUPERSEDED — reference only.** Replaced by MASTER_PLAN.md 3.0.0 / DEC-002. Complete the separate native migration bridge before executing resumed P07-G06/G07. Completed G01–G05 remain unchanged at their original paths.

---

# P07-G06 — Advance the standalone game clock

## 1. Context and authority

- Master: `MASTER_PLAN.md` 2.0.0 §§4.5, 7.1 and 8.
- Parent: `plans/phase7.md` §§5.3, 5.7–5.8.
- Predecessor: `guide5.md`; find `feat(p07-g05): start standalone careers safely` and verify ancestry.
- Commit: `feat(p07-g06): advance the standalone game clock`.

## 2. Goal and user-observable result

Continue moves a standalone career from July 1 to its summer deadline and then kickoff, with persisted receipts and no automatic wall-clock progression. At kickoff the app explains that match simulation belongs to Phase 8.

## 3. Preconditions

G05 creation/guards and G03 preview/cursor rules are implemented. Do not add fixtures, results, market ticks, contract expiry, growth, injuries or rollover. No schema redesign or package installation.

## 4. Files to inspect

- Calendar/random APIs and simulation state/receipt repositories.
- `src/data/transactions/run-command.ts`, campaign revision helpers and error mapping.
- New standalone creation receipt/fingerprint handling from G05.
- `src/features/dashboard/CommandCenterPage.tsx` and campaign-summary loader.
- `src/features/matches/MatchJournalPage.tsx`, `src/app/layout/WorkspaceLayout.tsx` and `src/app/copy.ts`.
- Existing conflict/command-center tests and match/legacy UI tests.

## 5. Files to create/modify

| Path                                          | Change                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `src/data/commands/advance-time.ts`           | Bounded receipt-aware transition                                        |
| `src/domain/simulation/progression.ts`        | Shared readiness/operation identity if calendar module needs extraction |
| Simulation repositories                       | Narrow state/receipt operations as needed                               |
| Command Center / campaign summary             | Game date, next event, mode and Continue                                |
| Standalone matches view / copy                | Clear future-phase state, no manual form                                |
| `src/test/advance-time.test.ts`               | Atomic progression, retries and stale state                             |
| `src/test/standalone-command-center.test.tsx` | Next action, feedback and reload                                        |
| `README.md`                                   | Exact kickoff-only milestone                                            |

Input includes campaignId, expectedRevision, expectedDate, expectedLastBoundaryKey, expectedTargetBoundaryKey, IDs and timestamp. The UI passes the preview's boundary identity; it cannot select an arbitrary future date.

## 6. Implementation steps

1. Validate input/mode/version and load the campaign, active season and simulation state.
2. Derive a canonical request fingerprint from critical source/target identity and input revision, excluding fresh audit/action IDs. Operation key uses stable season + target boundary, not actionId.
3. If an identical logical receipt already exists, return its persisted outcome without another write. A different fingerprint for the same operation cannot be treated as a successful retry. Use an explicit receipt-return path or a narrow transaction-wrapper extension: returning early inside the current `runCommand` update body must not report a fictitious incremented revision.
4. For a new event, derive the authoritative next boundary and compare input source date/cursor/target. Refuse stale/backwards/unsupported transitions.
5. Recheck source state, receipt and revision in a short transaction. Write currentDate, lastBoundaryKey and phase, a compact receipt, one audit and one campaign revision increment atomically.
6. Preserve the expected conflict sentence in UI and existing failure code semantics. A failure leaves every row unchanged.
7. Implement July 1 → August 31 deadline consumed → September 1 league kickoff. An already-consumed deadline cannot become today's next event again.
8. At kickoff preview and command both stop with `Match simulation arrives in Phase 8.` Do not treat a disabled button as the only guard.
9. Add Game date, Next event, mode/preset and Continue to standalone Command Center. Disable during commit, expose validation/conflict/success states and reload persisted state after success.
10. Hide legacy manual match entry for standalone; keep the route useful with clear not-yet-available fixture/report copy. Do not remove legacy journal forms.
11. No writes occur on render, polling, mount, reload, page focus or audit-time changes.

Future Phase 9 will add actual offer/deadline decisions through the same readiness policy; do not fabricate bids or import legacy open offers into this new career.

## 7. Tests to add/change

- July 1 → August 31 → September 1, with correct cursor/phase, one receipt/audit/revision per new event.
- Replay the first request after later progress: return the first receipt, do not move time backward or forward again.
- Same key but different critical inputs fails; altered fresh actionId does not produce another event.
- Two concurrent next-event submissions cannot both advance; stale revision and wrong source/target produce no mutation.
- Inject transaction failure and confirm state/cursor/audit/receipt/revision all roll back.
- Different real timestamps/reloads do not change the game date or event seed.
- Kickoff direct command refuses and writes nothing; no players/contracts/money/matches change during foundation progression.
- Standalone/legacy UI and campaign isolation remain correct.

## 8. Verification commands

```bash
pnpm exec vitest run src/test/advance-time.test.ts src/test/standalone-command-center.test.tsx
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## 9. Manual acceptance check

Create a standalone career at July 1, 2026. Click Continue once and confirm August 31; reload; click again and confirm September 1. Reload and wait without clicking: time stays unchanged. Confirm kickoff message, no further progression and no fabricated fixtures/results. Switch to legacy and verify its journal works.

## 10. Definition of done

- [ ] Preview/command/button eligibility share the same rules.
- [ ] Cursor and receipts prevent repeated same-day or retry progression.
- [ ] Conflict and rollback leave no partial state.
- [ ] Kickoff is a hard boundary, including direct calls.
- [ ] UI and README accurately describe this milestone.
- [ ] Required checks pass.

## 11. Commit instructions

```text
feat(p07-g06): advance the standalone game clock
```

Record actual SHA/evidence in phase §10. Stage only related files; leave later-guide work untouched.

## 12. Handoff

G07 verifies the foundation across migration, creation, progression and browser reload. Phase 8 must add the match handler and later schema migration; this guide must not skip unimplemented events to show a pretend playable season.
