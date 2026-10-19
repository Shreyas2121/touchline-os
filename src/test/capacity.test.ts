import { describe, expect, it } from 'vitest'
import {
  displayLedgerKind,
  formatCapacity,
  ledgerKindLabel,
  transferCapacity,
} from '../domain/finance/capacity'
import { formatWageCommitment, wageCommitment } from '../domain/finance/wages'
import {
  contractSchema,
  ledgerEntrySchema,
  type LedgerEntry,
} from '../domain/validation/schemas'

function entry(
  id: string,
  kind: LedgerEntry['kind'],
  amountCents: number,
  fields: Record<string, unknown> = {},
) {
  return ledgerEntrySchema.parse({
    id,
    campaignId: 'campaign-a',
    seasonId: 'season-a',
    clubId: 'club-a',
    kind,
    amountCents,
    effectiveOn: '2026-10-19',
    sourceActionId: `action-${id}`,
    reversesEntryId: null,
    note: null,
    ...fields,
  })
}
const percents = { salesReinvestmentPct: 70, prizeReinvestmentPct: 100 }
function capacity(entries: LedgerEntry[], rates = percents) {
  return transferCapacity(entries, 'season-a', 'club-a', rates)
}

describe('transfer capacity', () => {
  it.each([
    [70, 700_000_000],
    [100, 1_000_000_000],
    [0, 0],
  ])('credits %i percent of completed sales', (percent, expected) => {
    expect(
      capacity([entry('sale', 'player_sale', 1_000_000_000)], {
        ...percents,
        salesReinvestmentPct: percent,
      }).saleCreditCents,
    ).toBe(expected)
  })
  it('floors the aggregate credit, rather than each individual sale', () => {
    expect(capacity([entry('sale', 'player_sale', 1)]).saleCreditCents).toBe(0)
    expect(
      capacity([
        entry('sale-a', 'player_sale', 1),
        entry('sale-b', 'player_sale', 1),
      ]).saleCreditCents,
    ).toBe(1)
  })
  it.each([
    [100, 100_000_000],
    [50, 50_000_000],
    [0, 0],
  ])('credits %i percent of prizes', (percent, expected) => {
    expect(
      capacity([entry('prize', 'prize_income', 100_000_000)], {
        ...percents,
        prizeReinvestmentPct: percent,
      }).prizeCreditCents,
    ).toBe(expected)
  })
  it('includes opening allocations, carryover and fees in the breakdown', () => {
    const entries = [
      entry('opening', 'initial_allocation', 500_000_000),
      entry('sale', 'player_sale', 1_000_000_000),
    ]
    expect(capacity(entries)).toEqual({
      initialAllocationCents: 500_000_000,
      saleCreditCents: 700_000_000,
      prizeCreditCents: 0,
      carryoverCents: 0,
      incomingFeesCents: 0,
      authorizedCents: 1_200_000_000,
      remainingCents: 1_200_000_000,
    })
    expect(
      capacity([
        ...entries,
        entry('carry', 'approved_carryover', 100),
        entry('fee', 'incoming_fee', 200),
      ]),
    ).toMatchObject({
      carryoverCents: 100,
      incomingFeesCents: 200,
      authorizedCents: 1_200_000_100,
      remainingCents: 1_199_999_900,
    })
    expect(capacity([entry('fee', 'incoming_fee', 1_050)]).remainingCents).toBe(
      -1_050,
    )
  })
  it('drops reversed sales and fees without crediting the reversal amount', () => {
    const entries = [
      entry('opening', 'initial_allocation', 500_000_000),
      entry('sale', 'player_sale', 1_000_000_000),
      entry('fee', 'incoming_fee', 100_000_000),
    ]
    const reversals = [
      entry('sale-rev', 'reversal', 1_000_000_000, { reversesEntryId: 'sale' }),
      entry('fee-rev', 'reversal', 100_000_000, { reversesEntryId: 'fee' }),
    ]
    const before = structuredClone(entries)
    expect(capacity([...reversals, ...entries])).toMatchObject({
      saleCreditCents: 0,
      incomingFeesCents: 0,
      remainingCents: 500_000_000,
    })
    expect(entries).toEqual(before)
    expect(
      capacity([
        entry('orphan', 'reversal', 500, { reversesEntryId: 'absent' }),
      ]),
    ).toEqual(capacity([]))
  })
  it('scopes both entries and reversals to the requested season and club', () => {
    const entries = [
      entry('a', 'prize_income', 100),
      entry('b', 'prize_income', 200, { seasonId: 'season-b' }),
      entry('c', 'prize_income', 300, { clubId: 'club-b' }),
      entry('foreign-reversal', 'reversal', 100, {
        seasonId: 'season-b',
        reversesEntryId: 'a',
      }),
    ]
    expect(capacity(entries).prizeCreditCents).toBe(100)
    expect(
      transferCapacity(entries, 'season-b', 'club-a', percents)
        .prizeCreditCents,
    ).toBe(200)
  })
  it('formats unknown, zero and negative remaining capacity', () => {
    expect(formatCapacity(null)).toBe('Unknown')
    expect(formatCapacity(0)).toBe('€0.00')
    expect(formatCapacity(1_200_000_000)).toBe('€12,000,000.00')
    expect(formatCapacity(-1_050)).toBe('-€10.50')
  })
  it.each([
    ['initial_allocation', 'opening allocation', 'Opening allocation'],
    ['prize_income', 'prize income', 'Prize income'],
    ['player_sale', 'player sale', 'Player sale'],
    ['incoming_fee', 'incoming fee', 'Incoming fee'],
    ['approved_carryover', 'carryover', 'Carryover'],
    ['reversal', 'reversal', 'Reversal'],
  ] as const)('labels %s', (kind, lower, display) => {
    expect(ledgerKindLabel(kind)).toBe(lower)
    expect(displayLedgerKind(kind)).toBe(display)
  })
})

function contract(fields: Record<string, unknown> = {}) {
  return contractSchema.parse({
    id: 'contract-a',
    campaignId: 'campaign-a',
    playerId: 'player-a',
    clubId: 'club-a',
    weeklyWageCents: null,
    squadTier: null,
    startsOn: null,
    expiresOn: null,
    status: 'active',
    ...fields,
  })
}

describe('wage commitment', () => {
  it('keeps unknown wages separate and ignores ended contracts and other clubs', () => {
    const result = wageCommitment(
      [
        contract(),
        contract({ status: 'ended', weeklyWageCents: 999 }),
        contract({ clubId: 'club-b', weeklyWageCents: 999 }),
      ],
      'club-a',
    )
    expect(result).toEqual({
      knownCents: 0,
      unknownCount: 1,
      byTier: {
        key: { count: 0, knownCents: 0, unknownCount: 0 },
        rotation: { count: 0, knownCents: 0, unknownCount: 0 },
        youth: { count: 0, knownCents: 0, unknownCount: 0 },
        unknown: { count: 1, knownCents: 0, unknownCount: 1 },
      },
    })
    expect(formatWageCommitment(result)).toBe('Unknown')
    expect(formatWageCommitment(wageCommitment([], 'club-a'))).toBe('€0.00')
  })
  it('reports mixed known and unknown wages and every tier', () => {
    const result = wageCommitment(
      [
        contract({ squadTier: 'key', weeklyWageCents: 1_050 }),
        contract({ squadTier: 'rotation' }),
        contract({ squadTier: 'youth', weeklyWageCents: 0 }),
        contract({ weeklyWageCents: 0 }),
      ],
      'club-a',
    )
    expect(result).toEqual({
      knownCents: 1_050,
      unknownCount: 1,
      byTier: {
        key: { count: 1, knownCents: 1_050, unknownCount: 0 },
        rotation: { count: 1, knownCents: 0, unknownCount: 1 },
        youth: { count: 1, knownCents: 0, unknownCount: 0 },
        unknown: { count: 1, knownCents: 0, unknownCount: 0 },
      },
    })
    expect(formatWageCommitment(result)).toBe('€10.50 · 1 unknown')
    expect(formatWageCommitment({ knownCents: 1_050, unknownCount: 0 })).toBe(
      '€10.50',
    )
  })
})
