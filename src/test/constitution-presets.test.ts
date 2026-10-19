import { describe, expect, it } from 'vitest'
import {
  constitutionPreset,
  type ConstitutionPresetName,
} from '../domain/rules/presets'
import { parsePolicyAction, type PolicyAction } from '../domain/rules/types'
import { constitutionSchema } from '../domain/validation/schemas'
import presetsSource from '../domain/rules/presets.ts?raw'
import typesSource from '../domain/rules/types.ts?raw'

const ruleIds = [
  'SELL_TO_BUY',
  'MAX_SIGNING_AGE',
  'WAGE_TIER_CAP',
  'PRESTIGE_BID_SALE',
  'REGISTRATION_QUOTA',
]

describe('constitution presets', () => {
  it.each<ConstitutionPresetName>(['balanced', 'strict', 'custom'])(
    '%s has five unique ordered rules and fits the stored schema',
    (name) => {
      const rules = constitutionPreset(name)
      expect(rules.map((rule) => rule.id)).toEqual(ruleIds)
      expect(new Set(rules.map((rule) => rule.id)).size).toBe(5)
      expect(rules.every((rule) => rule.enabled === (name !== 'custom'))).toBe(
        true,
      )
      expect(
        constitutionSchema.safeParse({
          id: 'constitution-a',
          campaignId: 'campaign-a',
          version: 1,
          updatedAt: '2026-10-19T00:00:00.000Z',
          rules,
        }).success,
      ).toBe(true)
    },
  )

  it.each([
    {
      name: 'balanced' as const,
      sales: 70,
      prize: 100,
      allocation: 500_000_000,
      age: 26,
      exempt: true,
      caps: [4_500_000, 2_000_000, 500_000],
      numerator: 3,
      denominator: 2,
      roster: 25,
      homegrown: 8,
    },
    {
      name: 'strict' as const,
      sales: 50,
      prize: 50,
      allocation: 200_000_000,
      age: 23,
      exempt: false,
      caps: [2_250_000, 1_000_000, 250_000],
      numerator: 2,
      denominator: 1,
      roster: 20,
      homegrown: 10,
    },
  ])('$name matches the preset table', (preset) => {
    expect(constitutionPreset(preset.name)).toEqual([
      {
        id: 'SELL_TO_BUY',
        enabled: true,
        salesReinvestmentPct: preset.sales,
        prizeReinvestmentPct: preset.prize,
        carryoverPct: 0,
        initialAllocationCents: preset.allocation,
      },
      {
        id: 'MAX_SIGNING_AGE',
        enabled: true,
        maxAge: preset.age,
        freeTransfersExempt: preset.exempt,
      },
      {
        id: 'WAGE_TIER_CAP',
        enabled: true,
        keyWeeklyCapCents: preset.caps[0],
        rotationWeeklyCapCents: preset.caps[1],
        youthWeeklyCapCents: preset.caps[2],
      },
      {
        id: 'PRESTIGE_BID_SALE',
        enabled: true,
        requiredFeeNumerator: preset.numerator,
        requiredFeeDenominator: preset.denominator,
        requireHigherPrestige: true,
      },
      {
        id: 'REGISTRATION_QUOTA',
        enabled: true,
        rosterLimit: preset.roster,
        minimumHomegrown: preset.homegrown,
        ageExemptionUnder: 21,
        competitionKey: 'league',
      },
    ])
  })

  it('keeps every Balanced parameter when Custom disables the rules', () => {
    expect(constitutionPreset('custom')).toEqual(
      constitutionPreset('balanced').map((rule) => ({
        ...rule,
        enabled: false,
      })),
    )
    expect(constitutionPreset('custom')[0]).toHaveProperty(
      'initialAllocationCents',
      500_000_000,
    )
  })

  it('returns independent rules on every call', () => {
    const first = constitutionPreset('balanced')
    const second = constitutionPreset('balanced')
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    first.forEach((rule, index) => expect(rule).not.toBe(second[index]))
    first[0].enabled = false
    expect(second[0].enabled).toBe(true)
  })

  it('keeps the rules modules free of randomness and clock construction', () => {
    for (const source of [presetsSource, typesSource]) {
      expect(source).not.toContain('Math.random')
      expect(source).not.toContain('new Date')
    }
  })
})

const incoming: PolicyAction = {
  type: 'incoming-transfer',
  feeCents: 100,
  age: 24,
  isFree: false,
  weeklyWageCents: null,
  squadTier: 'rotation',
}
const wage: PolicyAction = {
  type: 'wage-change',
  weeklyWageCents: 0,
  squadTier: 'key',
}
const rejection: PolicyAction = {
  type: 'reject-offer',
  feeCents: 0,
  marketValueCents: null,
  bidderPrestige: 0,
  sellerPrestige: 100,
}
const rollover: PolicyAction = {
  type: 'season-rollover',
  unresolvedQualifyingOffers: 0,
}

describe('parsePolicyAction', () => {
  it.each([
    incoming,
    wage,
    rejection,
    rollover,
    { ...incoming, feeCents: 0, age: null, isFree: true, squadTier: null },
    { ...incoming, age: 0, weeklyWageCents: 1, squadTier: 'youth' },
    { ...incoming, age: 99 },
    { ...wage, weeklyWageCents: null, squadTier: null },
    {
      ...rejection,
      marketValueCents: 100,
      bidderPrestige: null,
      sellerPrestige: null,
    },
  ])('accepts $type with valid values', (action) => {
    expect(parsePolicyAction(action)).toEqual({ ok: true, value: action })
  })

  it.each([incoming, wage, rejection, rollover])(
    'rejects unknown keys and missing fields on $type',
    (action) => {
      expect(parsePolicyAction({ ...action, extra: true }).ok).toBe(false)
      for (const key of Object.keys(action)) {
        const incomplete = { ...action } as Record<string, unknown>
        delete incomplete[key]
        expect(parsePolicyAction(incomplete).ok).toBe(false)
      }
    },
  )

  it.each([
    { type: 'registration' },
    null,
    undefined,
    [],
    'incoming-transfer',
    { ...incoming, feeCents: -1 },
    { ...incoming, feeCents: 0.5 },
    { ...incoming, feeCents: '100' },
    { ...incoming, feeCents: Infinity },
    { ...incoming, age: -1 },
    { ...incoming, age: 100 },
    { ...incoming, age: 24.5 },
    { ...incoming, isFree: 'false' },
    { ...wage, weeklyWageCents: -1 },
    { ...wage, weeklyWageCents: 0.5 },
    { ...wage, squadTier: 'unknown' },
    { ...rejection, feeCents: -1 },
    { ...rejection, feeCents: 0.5 },
    { ...rejection, marketValueCents: -1 },
    { ...rejection, marketValueCents: 0.5 },
    { ...rejection, bidderPrestige: -1 },
    { ...rejection, bidderPrestige: 100.5 },
    { ...rejection, sellerPrestige: 101 },
    { ...rejection, sellerPrestige: 1.5 },
    { ...rollover, unresolvedQualifyingOffers: -1 },
    { ...rollover, unresolvedQualifyingOffers: 0.5 },
  ])('rejects invalid input %#', (action) => {
    expect(parsePolicyAction(action)).toEqual({
      ok: false,
      message: 'Action is not valid.',
    })
  })
})
