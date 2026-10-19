import { formatMoneyEuros, moneyCentsSchema } from '../models/money'
import type { Contract } from '../validation/schemas'

export type WageTier = 'key' | 'rotation' | 'youth' | 'unknown'

export type WageCommitment = {
  knownCents: number
  unknownCount: number
  byTier: Record<
    WageTier,
    { count: number; knownCents: number; unknownCount: number }
  >
}

export function wageCommitment(
  contracts: readonly Contract[],
  clubId: string,
): WageCommitment {
  const result: WageCommitment = {
    knownCents: 0,
    unknownCount: 0,
    byTier: {
      key: { count: 0, knownCents: 0, unknownCount: 0 },
      rotation: { count: 0, knownCents: 0, unknownCount: 0 },
      youth: { count: 0, knownCents: 0, unknownCount: 0 },
      unknown: { count: 0, knownCents: 0, unknownCount: 0 },
    },
  }
  for (const contract of contracts) {
    if (contract.status !== 'active' || contract.clubId !== clubId) continue
    const tier = result.byTier[contract.squadTier ?? 'unknown']
    tier.count += 1
    if (contract.weeklyWageCents === null) {
      result.unknownCount += 1
      tier.unknownCount += 1
    } else {
      result.knownCents += contract.weeklyWageCents
      tier.knownCents += contract.weeklyWageCents
    }
  }
  return result
}

export function formatWageCommitment(commitment: {
  knownCents: number
  unknownCount: number
}): string {
  if (commitment.knownCents === 0 && commitment.unknownCount > 0)
    return 'Unknown'
  const euros = formatMoneyEuros(moneyCentsSchema.parse(commitment.knownCents))
  return commitment.unknownCount === 0
    ? euros
    : `${euros} · ${commitment.unknownCount} unknown`
}
