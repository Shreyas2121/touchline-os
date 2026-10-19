import { describe, expect, it } from 'vitest'
import { dateOnlySchema } from '../domain/models/dates'
import { evaluateAction } from '../domain/rules/evaluate-action'
import { constitutionPreset } from '../domain/rules/presets'
import {
  parsePolicyAction,
  type PolicyAction,
  type PolicySnapshot,
  type RuleVerdict,
} from '../domain/rules/types'
import {
  constitutionSchema,
  type Constitution,
  type ConstitutionRule,
} from '../domain/validation/schemas'

const effectiveDate = dateOnlySchema.parse('2026-10-19')
const snapshot: PolicySnapshot = {
  revision: 4,
  remainingCapacityCents: 500_000_000,
}
const balanced = constitutionSchema.parse({
  id: 'constitution-a',
  campaignId: 'campaign-a',
  version: 1,
  updatedAt: '2026-10-19T00:00:00.000Z',
  rules: constitutionPreset('balanced'),
})
const incoming: Extract<PolicyAction, { type: 'incoming-transfer' }> = {
  type: 'incoming-transfer',
  feeCents: 100_000_000,
  age: 24,
  isFree: false,
  weeklyWageCents: 1_000_000,
  squadTier: 'rotation',
}
const offer: Extract<PolicyAction, { type: 'reject-offer' }> = {
  type: 'reject-offer',
  marketValueCents: 10_000_000,
  feeCents: 15_000_000,
  bidderPrestige: 80,
  sellerPrestige: 50,
}
function configured(
  ruleId: ConstitutionRule['id'],
  fields: Record<string, unknown>,
): Constitution {
  return constitutionSchema.parse({
    ...balanced,
    rules: balanced.rules.map((rule) =>
      rule.id === ruleId ? { ...rule, ...fields } : rule,
    ),
  })
}
const capacityDisabled = configured('SELL_TO_BUY', { enabled: false })
function evaluate(
  action: PolicyAction,
  constitution = balanced,
  state = snapshot,
) {
  return evaluateAction(action, state, constitution, effectiveDate)
}
function expectVerdict(
  action: PolicyAction,
  verdict: RuleVerdict,
  state = snapshot,
) {
  expect(evaluate(action, balanced, state)).toEqual({
    allowed: verdict.severity !== 'BLOCK',
    verdicts: [verdict],
    snapshotRevision: 4,
  })
}

describe('constitution evaluation', () => {
  it('returns deterministic reports without changing inputs or depending on the date', () => {
    const action = {
      ...incoming,
      feeCents: 600_000_000,
      age: 27,
      weeklyWageCents: null,
    }
    const before = structuredClone({ action, snapshot, balanced })
    const report = evaluate(action)
    expect(evaluate(action)).toEqual(report)
    expect(
      evaluateAction(
        action,
        snapshot,
        balanced,
        dateOnlySchema.parse('2030-01-01'),
      ),
    ).toEqual(report)
    expect({ action, snapshot, balanced }).toEqual(before)
    report.verdicts[0].message = 'Changed report'
    expect(evaluate(action)).not.toEqual(report)
  })

  it('blocks a fee above remaining capacity with the exact explanation', () => {
    expectVerdict(
      { ...incoming, feeCents: 600_000_000 },
      {
        ruleId: 'SELL_TO_BUY',
        severity: 'BLOCK',
        code: 'FEE_EXCEEDS_CAPACITY',
        message: 'The fee is above the remaining transfer capacity.',
        evidence: {
          feeCents: 600_000_000,
          remainingCapacityCents: 500_000_000,
        },
        remedy:
          'Record a completed sale, raise the allocation, or lower the fee.',
      },
    )
  })
  it.each([100_000_000, 500_000_000])(
    'allows a fee of %i within capacity without passing verdicts',
    (feeCents) => {
      expect(evaluate({ ...incoming, feeCents })).toEqual({
        allowed: true,
        verdicts: [],
        snapshotRevision: 4,
      })
    },
  )
  it('blocks an unknown capacity for paid signings', () => {
    expectVerdict(
      incoming,
      {
        ruleId: 'SELL_TO_BUY',
        severity: 'BLOCK',
        code: 'INSUFFICIENT_DATA',
        message: 'Transfer capacity is unknown, so this fee cannot be checked.',
        evidence: { feeCents: 100_000_000, remainingCapacityCents: null },
        remedy: 'Save a constitution that posts an opening allocation.',
      },
      { ...snapshot, remainingCapacityCents: null },
    )
  })
  it('allows an exempt free signing of age 27, even with unknown or negative capacity', () => {
    for (const remainingCapacityCents of [null, -100]) {
      expect(
        evaluate(
          { ...incoming, feeCents: 0, isFree: true, age: 27 },
          balanced,
          {
            ...snapshot,
            remainingCapacityCents,
          },
        ),
      ).toMatchObject({ allowed: true, verdicts: [] })
    }
  })
  it('blocks age 27 on paid signings', () => {
    expectVerdict(
      { ...incoming, feeCents: 1, age: 27 },
      {
        ruleId: 'MAX_SIGNING_AGE',
        severity: 'BLOCK',
        code: 'AGE_ABOVE_CAP',
        message: 'Age 27 is above the cap of 26.',
        evidence: { age: 27, maxAge: 26 },
        remedy:
          'Choose a younger player, use an exempt free transfer, or change the constitution.',
      },
    )
    expect(evaluate({ ...incoming, age: 26 }).allowed).toBe(true)
  })
  it.each([false, true])(
    'blocks a missing age even when isFree is %s',
    (isFree) => {
      expectVerdict(
        { ...incoming, feeCents: 0, isFree, age: null },
        {
          ruleId: 'MAX_SIGNING_AGE',
          severity: 'BLOCK',
          code: 'INSUFFICIENT_DATA',
          message: 'Age is unknown, so this signing cannot be checked.',
          evidence: { age: null, maxAge: 26 },
          remedy: 'Enter a birth date or an estimated age on the player.',
        },
      )
    },
  )
  it('treats a free flag with a nonzero fee as paid for both fee and age checks', () => {
    expect(
      evaluate({
        ...incoming,
        isFree: true,
        feeCents: 600_000_000,
        age: 27,
      }).verdicts.map((verdict) => verdict.code),
    ).toEqual(['FEE_EXCEEDS_CAPACITY', 'AGE_ABOVE_CAP'])
    expect(
      evaluate(
        { ...incoming, feeCents: 0, isFree: true, age: 27 },
        configured('MAX_SIGNING_AGE', {
          freeTransfersExempt: false,
        }),
      ).verdicts.map((verdict) => verdict.code),
    ).toEqual(['AGE_ABOVE_CAP'])
  })

  it.each([
    ['key', 'Key', 4_500_000],
    ['rotation', 'Rotation', 2_000_000],
    ['youth', 'Youth', 500_000],
  ] as const)(
    'checks the %s tier cap, allowing equality',
    (squadTier, display, capCents) => {
      const action: PolicyAction = {
        type: 'wage-change',
        weeklyWageCents: capCents + 100_000,
        squadTier,
      }
      expectVerdict(action, {
        ruleId: 'WAGE_TIER_CAP',
        severity: 'BLOCK',
        code: 'WAGE_ABOVE_TIER_CAP',
        message: `The weekly wage is above the ${display} cap.`,
        evidence: { weeklyWageCents: capCents + 100_000, squadTier, capCents },
        remedy: 'Lower the wage, change the tier, or change the constitution.',
      })
      expect(
        evaluate({ ...action, weeklyWageCents: capCents }).verdicts,
      ).toEqual([])
      expect(
        evaluate({ ...incoming, squadTier, weeklyWageCents: capCents + 1 })
          .verdicts[0].code,
      ).toBe('WAGE_ABOVE_TIER_CAP')
    },
  )
  it('blocks an unknown wage without treating it as zero', () => {
    expectVerdict(
      { type: 'wage-change', weeklyWageCents: null, squadTier: 'key' },
      {
        ruleId: 'WAGE_TIER_CAP',
        severity: 'BLOCK',
        code: 'INSUFFICIENT_DATA',
        message: 'Weekly wage is unknown, so the tier cap cannot be checked.',
        evidence: {
          weeklyWageCents: null,
          squadTier: 'key',
          capCents: 4_500_000,
        },
        remedy: 'Enter a weekly wage.',
      },
    )
    expect(
      evaluate({ type: 'wage-change', weeklyWageCents: 0, squadTier: 'key' })
        .verdicts,
    ).toEqual([])
  })
  it('blocks a missing tier and selects no cap', () => {
    expectVerdict(
      { type: 'wage-change', weeklyWageCents: 1_000_000, squadTier: null },
      {
        ruleId: 'WAGE_TIER_CAP',
        severity: 'BLOCK',
        code: 'INSUFFICIENT_DATA',
        message: 'Squad tier is unknown, so the wage cap cannot be checked.',
        evidence: { weeklyWageCents: 1_000_000, squadTier: null },
        remedy: 'Choose Key, Rotation, or Youth.',
      },
    )
    expect(
      evaluate({ type: 'wage-change', weeklyWageCents: null, squadTier: null })
        .verdicts,
    ).toMatchObject([
      {
        code: 'INSUFFICIENT_DATA',
        message: 'Weekly wage is unknown, so the tier cap cannot be checked.',
        evidence: { weeklyWageCents: null, squadTier: null },
      },
    ])
  })

  it('blocks a qualifying bid at the exact rational threshold', () => {
    expectVerdict(offer, {
      ruleId: 'PRESTIGE_BID_SALE',
      severity: 'BLOCK',
      code: 'QUALIFYING_OFFER',
      message:
        'This bid qualifies and cannot be rejected while the rule is on.',
      evidence: {
        feeCents: 15_000_000,
        marketValueCents: 10_000_000,
        bidderPrestige: 80,
        sellerPrestige: 50,
        requiredFeeNumerator: 3,
        requiredFeeDenominator: 2,
      },
      remedy:
        'Accept the bid, or change the constitution in an audited update.',
    })
  })
  it.each([
    { feeCents: 14_999_999 },
    { bidderPrestige: 50 },
    { bidderPrestige: 49 },
  ])('allows a nonqualifying bid %# without a verdict', (fields) => {
    expect(evaluate({ ...offer, ...fields })).toMatchObject({
      allowed: true,
      verdicts: [],
    })
  })
  it('uses integer products where floating point multiplication would round up qualification', () => {
    const large = {
      ...offer,
      marketValueCents: 6_000_000_000_000_003,
      feeCents: 9_000_000_000_000_004,
    }
    expect(evaluate(large).verdicts).toEqual([])
    expect(
      evaluate({ ...large, feeCents: large.feeCents + 1 }).verdicts[0].code,
    ).toBe('QUALIFYING_OFFER')
  })
  it('uses configured fee multiples and the higher prestige option', () => {
    const constitution = configured('PRESTIGE_BID_SALE', {
      requiredFeeNumerator: 4,
      requiredFeeDenominator: 3,
      requireHigherPrestige: false,
    })
    const bid = {
      ...offer,
      marketValueCents: 3,
      feeCents: 4,
      bidderPrestige: 40,
    }
    expect(evaluate(bid, constitution).verdicts[0]).toMatchObject({
      code: 'QUALIFYING_OFFER',
      evidence: { requiredFeeNumerator: 4, requiredFeeDenominator: 3 },
    })
    expect(evaluate({ ...bid, feeCents: 3 }, constitution).verdicts).toEqual([])
  })
  it.each(['marketValueCents', 'bidderPrestige', 'sellerPrestige'] as const)(
    'warns without blocking when %s is unknown',
    (field) => {
      const action = { ...offer, [field]: null }
      expectVerdict(action, {
        ruleId: 'PRESTIGE_BID_SALE',
        severity: 'WARN',
        code: 'UNKNOWN_VALUATION',
        message:
          'Valuation or prestige is unknown, so this bid needs a manual review.',
        evidence: {
          feeCents: action.feeCents,
          marketValueCents: action.marketValueCents,
          bidderPrestige: action.bidderPrestige,
          sellerPrestige: action.sellerPrestige,
        },
        remedy: 'Enter the market value and both prestige figures.',
      })
    },
  )
  it('blocks rollover only when a qualifying offer is unresolved', () => {
    expectVerdict(
      { type: 'season-rollover', unresolvedQualifyingOffers: 1 },
      {
        ruleId: 'PRESTIGE_BID_SALE',
        severity: 'BLOCK',
        code: 'UNRESOLVED_QUALIFYING_OFFER',
        message: 'A qualifying offer is still unresolved.',
        evidence: { unresolvedQualifyingOffers: 1 },
        remedy:
          'Accept the qualifying offer, or change the constitution in an audited update.',
      },
    )
    expect(
      evaluate({ type: 'season-rollover', unresolvedQualifyingOffers: 0 })
        .verdicts,
    ).toEqual([])
  })

  it('orders verdicts by rule id regardless of the stored rule order', () => {
    const action = {
      ...incoming,
      feeCents: 600_000_000,
      age: 27,
      weeklyWageCents: 2_000_001,
    }
    const reordered = { ...balanced, rules: [...balanced.rules].reverse() }
    expect(evaluate(action, reordered)).toEqual(evaluate(action))
    expect(evaluate(action).verdicts.map((verdict) => verdict.ruleId)).toEqual([
      'SELL_TO_BUY',
      'MAX_SIGNING_AGE',
      'WAGE_TIER_CAP',
    ])
    expect(evaluate(action, capacityDisabled).verdicts).toEqual(
      evaluate(action).verdicts.slice(1),
    )
    expect(
      evaluate({ ...incoming, feeCents: 600_000_000 }, capacityDisabled)
        .allowed,
    ).toBe(true)
  })
  it.each(['MAX_SIGNING_AGE', 'WAGE_TIER_CAP'] as const)(
    'disabled %s adds no verdicts',
    (ruleId) => {
      const action = { ...incoming, age: null, weeklyWageCents: null }
      expect(
        evaluate(action, configured(ruleId, { enabled: false })).verdicts,
      ).toEqual(
        evaluate(action).verdicts.filter(
          (verdict) => verdict.ruleId !== ruleId,
        ),
      )
    },
  )
  it('a disabled prestige rule ignores both rejection and rollover checks', () => {
    const constitution = configured('PRESTIGE_BID_SALE', { enabled: false })
    for (const action of [
      offer,
      { ...offer, marketValueCents: null },
      { type: 'season-rollover', unresolvedQualifyingOffers: 1 } as const,
    ]) {
      expect(evaluate(action, constitution)).toMatchObject({
        allowed: true,
        verdicts: [],
      })
    }
  })
  it('Custom disables every check while registration remains outside the action parser', () => {
    const constitution = { ...balanced, rules: constitutionPreset('custom') }
    expect(
      evaluate(
        {
          ...incoming,
          feeCents: 600_000_000,
          age: null,
          weeklyWageCents: null,
        },
        constitution,
      ),
    ).toMatchObject({
      allowed: true,
      verdicts: [],
    })
    expect(parsePolicyAction({ type: 'registration' }).ok).toBe(false)
  })
})
