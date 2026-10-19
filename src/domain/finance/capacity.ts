import { formatMoneyEuros, moneyCentsSchema } from '../models/money'
import type { LedgerEntry } from '../validation/schemas'

export type CapacityBreakdown = {
  initialAllocationCents: number
  saleCreditCents: number
  prizeCreditCents: number
  carryoverCents: number
  incomingFeesCents: number
  authorizedCents: number
  remainingCents: number
}

export function transferCapacity(
  entries: readonly LedgerEntry[],
  seasonId: string,
  clubId: string,
  percents: { salesReinvestmentPct: number; prizeReinvestmentPct: number },
): CapacityBreakdown {
  const scoped = entries.filter(
    (entry) => entry.seasonId === seasonId && entry.clubId === clubId,
  )
  const reversedIds = new Set(
    scoped
      .filter((entry) => entry.kind === 'reversal')
      .map((entry) => entry.reversesEntryId),
  )
  let initialAllocationCents = 0
  let grossSales = 0
  let grossPrizes = 0
  let carryoverCents = 0
  let incomingFeesCents = 0
  for (const entry of scoped) {
    if (reversedIds.has(entry.id)) continue
    switch (entry.kind) {
      case 'initial_allocation':
        initialAllocationCents += entry.amountCents
        break
      case 'player_sale':
        grossSales += entry.amountCents
        break
      case 'prize_income':
        grossPrizes += entry.amountCents
        break
      case 'approved_carryover':
        carryoverCents += entry.amountCents
        break
      case 'incoming_fee':
        incomingFeesCents += entry.amountCents
        break
    }
  }
  const saleCreditCents = Math.floor(
    (grossSales * percents.salesReinvestmentPct) / 100,
  )
  const prizeCreditCents = Math.floor(
    (grossPrizes * percents.prizeReinvestmentPct) / 100,
  )
  const authorizedCents =
    initialAllocationCents + saleCreditCents + prizeCreditCents + carryoverCents
  return {
    initialAllocationCents,
    saleCreditCents,
    prizeCreditCents,
    carryoverCents,
    incomingFeesCents,
    authorizedCents,
    remainingCents: authorizedCents - incomingFeesCents,
  }
}

export function formatCapacity(cents: number | null): string {
  if (cents === null) return 'Unknown'
  const euros = formatMoneyEuros(moneyCentsSchema.parse(Math.abs(cents)))
  return cents < 0 ? `-${euros}` : euros
}

const kindLabels: Record<LedgerEntry['kind'], string> = {
  initial_allocation: 'opening allocation',
  prize_income: 'prize income',
  player_sale: 'player sale',
  incoming_fee: 'incoming fee',
  approved_carryover: 'carryover',
  reversal: 'reversal',
}

export function ledgerKindLabel(kind: LedgerEntry['kind']): string {
  return kindLabels[kind]
}

export function displayLedgerKind(kind: LedgerEntry['kind']): string {
  const label = ledgerKindLabel(kind)
  return label.charAt(0).toUpperCase() + label.slice(1)
}
