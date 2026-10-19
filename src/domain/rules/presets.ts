import { moneyCentsSchema } from '../models/money'
import type { Constitution } from '../validation/schemas'

export type ConstitutionPresetName = 'balanced' | 'strict' | 'custom'

export function constitutionPreset(
  name: ConstitutionPresetName,
): Constitution['rules'] {
  const strict = name === 'strict'
  const enabled = name !== 'custom'

  return [
    {
      id: 'SELL_TO_BUY',
      enabled,
      salesReinvestmentPct: strict ? 50 : 70,
      prizeReinvestmentPct: strict ? 50 : 100,
      carryoverPct: 0,
      initialAllocationCents: moneyCentsSchema.parse(
        strict ? 200_000_000 : 500_000_000,
      ),
    },
    {
      id: 'MAX_SIGNING_AGE',
      enabled,
      maxAge: strict ? 23 : 26,
      freeTransfersExempt: !strict,
    },
    {
      id: 'WAGE_TIER_CAP',
      enabled,
      keyWeeklyCapCents: moneyCentsSchema.parse(strict ? 2_250_000 : 4_500_000),
      rotationWeeklyCapCents: moneyCentsSchema.parse(
        strict ? 1_000_000 : 2_000_000,
      ),
      youthWeeklyCapCents: moneyCentsSchema.parse(strict ? 250_000 : 500_000),
    },
    {
      id: 'PRESTIGE_BID_SALE',
      enabled,
      requiredFeeNumerator: strict ? 2 : 3,
      requiredFeeDenominator: strict ? 1 : 2,
      requireHigherPrestige: true,
    },
    {
      id: 'REGISTRATION_QUOTA',
      enabled,
      rosterLimit: strict ? 20 : 25,
      minimumHomegrown: strict ? 10 : 8,
      ageExemptionUnder: 21,
      competitionKey: 'league',
    },
  ]
}
