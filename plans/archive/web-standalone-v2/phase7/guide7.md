> **ARCHIVED / SUPERSEDED — reference only.** Replaced by MASTER_PLAN.md 3.0.0 / DEC-002. Complete the separate native migration bridge before executing resumed P07-G06/G07. Completed G01–G05 remain unchanged at their original paths.

---

# P07-G07 — Verify standalone foundations

## 1. Context and authority

- Master: `MASTER_PLAN.md` 2.0.0 §§9 Phase 7 and 12.
- Parent: `plans/phase7.md` §§7–10.
- Predecessor: `guide6.md`; find `feat(p07-g06): advance the standalone game clock` and verify ancestry.
- Commit: `test(p07-g07): verify standalone foundations`.

## 2. Goal and user-observable result

The foundation has reviewable migration, creation, guard, retry and browser evidence. A reviewer can keep an old save, start a separate complete standalone world and reach kickoff exactly once. No later gameplay feature is falsely certified.

## 3. Preconditions

All preceding guides are committed and their targeted tests pass. Do not use this guide to introduce the match engine, AI market, rollover, importer or PWA. Fix failures within existing foundation contracts rather than weakening them.

## 4. Files to inspect

- All active Phase 7 guides and progress log.
- Migration, generator, creation, guards and advance-time suites from G02–G06.
- Existing `e2e/demo-journey.spec.ts`, `transfers.spec.ts`, `smoke.spec.ts` and Playwright configuration.
- `README.md`, `DECISIONS.md` and the master implementation-status notes.
- DB cleanup/reset scopes and standalone demo identity.

## 5. Files to create/modify

| Path                                      | Change                                    |
| ----------------------------------------- | ----------------------------------------- |
| `e2e/standalone-foundations.spec.ts`      | Isolated new-career/reload/mode journey   |
| `src/test/standalone-foundations.test.ts` | Cross-feature integration gaps only       |
| Existing foundation tests                 | Fix meaningful missing cases/regressions  |
| `README.md`                               | Verified checkpoint and remaining roadmap |
| `plans/phase7.md` §10                     | Actual commits, checks and handoff        |

Do not mirror every implementation function with another test. Reuse the earlier suites and add only cross-feature properties or uncovered failure cases.

## 6. Implementation steps

1. Audit actual v1 migration coverage, complete-world checks and direct-call guards. Confirm no legacy data was promoted or rewritten.
2. Add a browser journey with its own context and appropriate seed timeout: preserve legacy match, create standalone Challenge, reload, advance to deadline/kickoff, switch saves and inspect isolation.
3. Cover separate demo reset/delete and simulation-store cleanup without affecting legacy or another standalone campaign.
4. Verify Sandbox policy edit does not create a second opening allocation.
5. Inspect rendered states at kickoff: future match/market/lifecycle features are clearly unavailable. There are no simulated results, awards, newgens or development snapshots.
6. Compare normalized generated worlds under two campaign IDs and different audit timestamps. Confirm stable logical keys/seeds; a full export/restore test belongs to Phase 12.
7. Run full checks and the browser journey in a production preview where practical. Record actual evidence, failures and limitations honestly.
8. Update README and the Phase 7 handoff. Historical Guide 1 file and progress evidence remain intact.

## 7. Tests to add/change

Browser journey proves visible user behavior and reload persistence. Integration coverage proves atomicity, actual upgrade, direct-call protections and cleanup; do not rely only on hidden UI.

Retain legacy tests and their meaning. New standalone history must not be seeded into the legacy demo just to update assertions.

## 8. Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test e2e/standalone-foundations.spec.ts
pnpm test:e2e
```

Use installed Chromium or install it if missing. Run `pnpm preview` for the production manual check; document results rather than claiming a PWA/offline certification.

## 9. Manual acceptance check

Perform the complete phase §8 journey with keyboard-accessible controls. Verify distinct saved dates/history after switching campaigns, separate demo reset scope, immutable Challenge policy and audited Sandbox edits. At kickoff inspect the explicit Phase 8 message and confirm Continue cannot bypass it.

## 10. Definition of done

- [ ] Phase acceptance criteria pass with actual code/test evidence.
- [ ] Required guide commits exist in order and progress log is complete.
- [ ] v1 migration and generator v1 remain compatible.
- [ ] Complete standalone creation, guards, retries, rollback and cleanup are covered.
- [ ] Browser reload/isolation journey passes.
- [ ] No match engine, full-season or offline release claim is recorded.
- [ ] README and Phase 8 handoff match implementation.

## 11. Commit instructions

```text
test(p07-g07): verify standalone foundations
```

Stage related tests/docs/fixes only. Record the final guide SHA/check evidence in phase §10; a separate narrow evidence docs commit is permitted. Do not mark the phase complete while required checks fail.

## 12. Handoff

Generate `plans/phase8.md` and all its guides from master 2.0.0 before match implementation. Phase 8 starts from complete worlds and deterministic kickoff state, adds a later DB migration for fixtures/results/appearances, and uses the same core engine for managed and AI fixtures. AI transfers are Phase 9, sustainable rollover Phase 10, scouting/import/PWA Phases 11/12/13.
