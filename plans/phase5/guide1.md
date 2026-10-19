# P05-G01 — Explainable policy engine

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.1 and §5.2.
- **Parent phase:** `plans/phase5.md`, guide **P05-G01**. Preset numbers and the report types are phase §5 “Presets” and “Policy types”. The work block is phase §6 `P05-G01`.
- **Predecessor guide:** none in Phase 5. Phase 4 is complete.
- **Predecessor commit:** `63b619699f4a0eefaccafeabe61eec49c41d091f` (`phase 4 done`). Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p05-g01): introduce explainable policy engine`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase5.md` → this guide. This guide does not evaluate a rule, write a constitution, or change a screen.

## 2. Goal and user-observable result

Nothing a person can click changes. The app still shows the finance and constitution previews.

What this guide adds is a pure module:

- `constitutionPreset` returns Balanced, Strict, and Custom rule lists that already match the stored constitution schema.
- `parsePolicyAction` accepts the four action shapes and rejects a registration action.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor 63b619699f4a0eefaccafeabe61eec49c41d091f HEAD` succeeds.
- `src/domain/rules/` does not exist. If it does, stop and reconcile with this guide before editing.
- Do not install a package. Do not edit `schemaV1` or `src/data/migrations/v1.ts`.
- Leave `MASTER_PLAN.md` and `plans/phase5.md` unchanged in this commit. If `plans/phase5.md` is still untracked, leave it untracked.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase5.md` §5 “Presets” and “Policy types”, and the `P05-G01` block in §6.
- `src/domain/validation/schemas.ts` — `constitutionSchema`, `constitutionRuleSchema`, and the five rule object schemas. Do not change them.
- `src/domain/validation/result.ts` — `ParseResult<T>`.
- `src/test/schemas.test.ts` — the disabled constitution fixture. Its registration numbers are the Balanced registration numbers. Do not edit that fixture.
- `eslint.config.js` — `src/domain/**` already cannot import React, Dexie, `Math.random`, or `Date`. New files inherit that ban.

`src/domain/rules/evaluate-action.ts` does not exist. Do not create it in this guide.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/rules/types.ts` | Report types and `parsePolicyAction` |
| `src/domain/rules/presets.ts` | `constitutionPreset` |
| `src/test/constitution-presets.test.ts` | Preset table and the registration rejection |

Do not edit `src/features/**`, `src/data/**`, or `e2e/**`.

### Public API

```ts
export type Severity = 'BLOCK' | 'WARN' | 'INFO'

export type RuleVerdict = {
  ruleId:
    | 'SELL_TO_BUY'
    | 'MAX_SIGNING_AGE'
    | 'WAGE_TIER_CAP'
    | 'PRESTIGE_BID_SALE'
  severity: Severity
  code: string
  message: string
  evidence: Record<string, number | string | null>
  remedy: string
}

export type RuleReport = {
  allowed: boolean
  verdicts: RuleVerdict[]
  snapshotRevision: number
}

export type PolicySnapshot = {
  revision: number
  remainingCapacityCents: number | null
}

export type SquadTierChoice = 'key' | 'rotation' | 'youth'

export type PolicyAction =
  | {
      type: 'incoming-transfer'
      feeCents: number
      age: number | null
      isFree: boolean
      weeklyWageCents: number | null
      squadTier: SquadTierChoice | null
    }
  | {
      type: 'wage-change'
      weeklyWageCents: number | null
      squadTier: SquadTierChoice | null
    }
  | {
      type: 'reject-offer'
      feeCents: number
      marketValueCents: number | null
      bidderPrestige: number | null
      sellerPrestige: number | null
    }
  | {
      type: 'season-rollover'
      unresolvedQualifyingOffers: number
    }

export function parsePolicyAction(value: unknown): ParseResult<PolicyAction>

export type ConstitutionPresetName = 'balanced' | 'strict' | 'custom'

export function constitutionPreset(
  name: ConstitutionPresetName,
): Constitution['rules']
```

`Constitution` is the type already exported from `src/domain/validation/schemas.ts`. A failed parse returns `{ ok: false, message: 'Action is not valid.' }`.

## 6. Implementation steps

1. Add `types.ts` with the aliases above. Do not add a registration member to `PolicyAction`.
2. Implement `parsePolicyAction` with a strict Zod discriminated union on `type`. Integer fields that are cents or counts are nonnegative integers. `age`, when not null, is an integer 0–99. Prestige, when not null, is an integer 0–100. `unresolvedQualifyingOffers` is an integer ≥ 0. Unknown keys fail. `{ type: 'registration' }` fails.
3. Add `presets.ts`. `constitutionPreset` returns a new array on every call. The five ids, in this order, are `SELL_TO_BUY`, `MAX_SIGNING_AGE`, `WAGE_TIER_CAP`, `PRESTIGE_BID_SALE`, `REGISTRATION_QUOTA`.
4. Use the exact numbers in phase §5 “Presets”. Balanced and Strict set every `enabled` to `true`. Custom sets every `enabled` to `false` and copies the Balanced parameters, including `initialAllocationCents` 500_000_000.
5. Do not give the preset an id, campaign id, version, or `updatedAt`. Do not read the clock. Do not call `constitutionPreset` from a feature or a command.

## 7. Tests to add/change

`src/test/constitution-presets.test.ts`:

- Balanced, Strict, and Custom each have five unique ids in the order in §6.
- Balanced: enabled, sales 70, prize 100, carryover 0, allocation 500_000_000, age 26, free transfers exempt, caps 4_500_000 / 2_000_000 / 500_000, fee 3/2, higher prestige required, roster 25, homegrown 8, age exemption 21, competition `league`.
- Strict: enabled, sales 50, prize 50, carryover 0, allocation 200_000_000, age 23, free transfers not exempt, caps 2_250_000 / 1_000_000 / 250_000, fee 2/1, roster 20, homegrown 10, age exemption 21, competition `league`.
- Custom is disabled and its `initialAllocationCents` is still 500_000_000.
- Building `{ id: 'constitution-a', campaignId: 'campaign-a', version: 1, updatedAt: '2026-10-19T00:00:00.000Z', rules: constitutionPreset('balanced') }` passes `constitutionSchema`. Repeat for `strict` and `custom`.
- Two calls with `'balanced'` deep-equal and are not the same array reference.
- `parsePolicyAction` accepts `{ type: 'incoming-transfer', feeCents: 100, age: 24, isFree: false, weeklyWageCents: null, squadTier: 'rotation' }`.
- `parsePolicyAction({ type: 'registration' })` returns `ok: false`.
- The rules module source, read as text from `presets.ts` and `types.ts`, does not contain `Math.random` or `new Date`.

Do not open a database in this file.

## 8. Verification commands

Run from the repository root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: each command exits 0. `pnpm test` includes the previous files plus `constitution-presets.test.ts`.

Do not run Playwright. This guide must not change a screen.

## 9. Manual acceptance check

There is no screen change. Finance still shows the empty ledger. Constitution still lists the five rule ids and says `Rules are not active in this build.`

The behavior is proven by `src/test/constitution-presets.test.ts`.

## 10. Definition of done

- [ ] The three presets match phase §5 and pass `constitutionSchema` once the constitution fields are added.
- [ ] `parsePolicyAction` rejects `{ type: 'registration' }`.
- [ ] No feature, repository, or command imports the new modules.
- [ ] `schemaV1` is unchanged. No package was added.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `MASTER_PLAN.md` and `plans/phase5.md` have no edits in this commit.

## 11. Commit instructions

Stage the files in §5, and `plans/phase5/guide1.md` if this guide is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase5.md`, or later guide files.

Suggested message:

```text
feat(p05-g01): introduce explainable policy engine
```

Do not commit when §8 is failing. Do not amend `63b619699f4a0eefaccafeabe61eec49c41d091f`. After the commit succeeds, record its full SHA on the `P05-G01` row of the progress log in `plans/phase5.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P05-G02` may import `ConstitutionPresetName` only if it needs it. It does not have to. `P05-G03` owns `evaluateAction` and must use `PolicyAction`, `PolicySnapshot`, `RuleVerdict`, and `RuleReport` from this guide.

Known limitations this guide leaves on purpose:

- No rule returns a verdict yet.
- No constitution row is written.
- Finance and Constitution are still previews.
