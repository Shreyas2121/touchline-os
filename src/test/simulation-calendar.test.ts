import { describe, expect, it } from 'vitest'
import { addDays, dateOnlySchema } from '../domain/models/dates'
import {
  activeTransferWindow,
  matchSimulationUnavailable,
  nextFoundationBoundary,
  previewTimeAdvance,
  seasonDates,
  transferWindowOn,
} from '../domain/simulation/calendar'
import {
  simulationStateSchema,
  type SimulationState,
} from '../domain/simulation/schemas'
import { seasonSchema, type Season } from '../domain/validation/schemas'
import { seasonA } from './fixtures/campaign'
import { simulationState } from './fixtures/simulation'

const season = seasonSchema.parse({ ...seasonA, ...seasonDates(2026) })
const deadlineKey = 'season:2026:summer-deadline'
const kickoffKey = 'season:2026:league-kickoff'
const deadlineState = simulationStateSchema.parse({
  ...simulationState,
  currentDate: '2026-08-31',
  lastBoundaryKey: deadlineKey,
})
const kickoffState = simulationStateSchema.parse({
  ...deadlineState,
  currentDate: '2026-09-01',
  lastBoundaryKey: kickoffKey,
  phase: 'league',
})

describe('season dates and Gregorian arithmetic', () => {
  it.each<[number, string, string, number]>([
    [1900, '1900-07-01', '1901-06-30', 365],
    [1999, '1999-07-01', '2000-06-30', 366],
    [2026, '2026-07-01', '2027-06-30', 365],
    [2027, '2027-07-01', '2028-06-30', 366],
    [2099, '2099-07-01', '2100-06-30', 365],
    [2198, '2198-07-01', '2199-06-30', 365],
  ])(
    'defines the complete season starting in %i',
    (year, start, end, length) => {
      const dates = seasonDates(year)
      expect(dates).toEqual({ startDate: start, endDate: end })
      expect(dateOnlySchema.safeParse(dates.startDate).success).toBe(true)
      expect(dateOnlySchema.safeParse(dates.endDate).success).toBe(true)
      expect(addDays(dates.startDate, length - 1)).toBe(end)
      expect(addDays(dates.endDate, 1 - length)).toBe(start)
    },
  )

  it.each([1899, 2199, 2200, 2026.5, NaN, Infinity, -Infinity])(
    'refuses unsupported season start %s',
    (year) => {
      expect(() => seasonDates(year)).toThrow(RangeError)
    },
  )

  it.each<[string, number, string]>([
    ['2028-02-28', 1, '2028-02-29'],
    ['2028-02-29', 1, '2028-03-01'],
    ['2028-03-01', -1, '2028-02-29'],
    ['1900-02-28', 1, '1900-03-01'],
    ['2000-02-28', 1, '2000-02-29'],
    ['2100-03-01', -1, '2100-02-28'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2026-04-30', 1, '2026-05-01'],
    ['2026-07-01', 0, '2026-07-01'],
    ['1900-01-01', 109_572, '2199-12-31'],
    ['2199-12-31', -109_572, '1900-01-01'],
  ])('adds %s / %i days to get %s', (input, offset, expected) => {
    expect(addDays(dateOnlySchema.parse(input), offset)).toBe(expected)
  })

  it.each<[string, number]>([
    ['1900-01-01', -1],
    ['2199-12-31', 1],
    ['2026-07-01', 1.5],
    ['2026-07-01', NaN],
    ['2026-07-01', Infinity],
    ['2026-07-01', Number.MAX_SAFE_INTEGER],
    ['2026-07-01', Number.MAX_SAFE_INTEGER + 1],
  ])('refuses out-of-range arithmetic %s / %s', (date, offset) => {
    expect(() => addDays(dateOnlySchema.parse(date), offset)).toThrow(
      RangeError,
    )
  })

  it('validates date inputs at runtime even when their brand is bypassed', () => {
    const invalid = '2026-02-30' as ReturnType<typeof dateOnlySchema.parse>
    expect(() => addDays(invalid, 0)).toThrow()
    expect(() => transferWindowOn(invalid)).toThrow()
  })
})

describe('calendar windows and cursor readiness', () => {
  it.each([
    ['2026-06-30', null],
    ['2026-07-01', 'summer'],
    ['2026-08-30', 'summer'],
    ['2026-08-31', 'summer'],
    ['2026-09-01', null],
    ['2026-12-31', null],
    ['2027-01-01', 'winter'],
    ['2027-01-31', 'winter'],
    ['2027-02-01', null],
    ['2028-02-29', null],
  ])('identifies the inclusive window on %s', (date, expected) => {
    expect(transferWindowOn(dateOnlySchema.parse(date))).toBe(expected)
  })

  it('closes logical summer readiness on August 31 only after consumption', () => {
    const unconsumed = { ...deadlineState, lastBoundaryKey: null }
    expect(activeTransferWindow(simulationState, season)).toBe('summer')
    expect(activeTransferWindow(unconsumed, season)).toBe('summer')
    expect(transferWindowOn(deadlineState.currentDate)).toBe('summer')
    expect(activeTransferWindow(deadlineState, season)).toBeNull()
    expect(activeTransferWindow(kickoffState, season)).toBeNull()
  })
})

describe('foundation clock previews', () => {
  it('previews July 1 to the deadline, then kickoff, then the Phase 8 stop without writes', () => {
    const initial = Object.freeze({ ...simulationState })
    const activeSeason = Object.freeze({ ...season })
    const before = structuredClone({
      initial,
      activeSeason,
      deadlineState,
      kickoffState,
    })
    const deadline = previewTimeAdvance(initial, activeSeason)
    expect(deadline).toMatchObject({
      fromDate: '2026-07-01',
      sourceBoundaryKey: null,
      targetBoundaryKey: deadlineKey,
      allowed: true,
      reason: null,
      target: { key: deadlineKey, date: '2026-08-31', kind: 'summer-deadline' },
    })
    expect(deadline.eventSeed).toBe(3772907847)
    expect(nextFoundationBoundary(initial, activeSeason)).toEqual(
      deadline.target,
    )
    const kickoff = previewTimeAdvance(deadlineState, activeSeason)
    expect(kickoff).toMatchObject({
      fromDate: '2026-08-31',
      sourceBoundaryKey: deadlineKey,
      targetBoundaryKey: kickoffKey,
      allowed: true,
      reason: null,
      target: { key: kickoffKey, date: '2026-09-01', kind: 'league-kickoff' },
    })
    expect(kickoff.eventSeed).toBe(4048042120)
    expect(nextFoundationBoundary(deadlineState, activeSeason)).toEqual(
      kickoff.target,
    )
    expect(previewTimeAdvance(kickoffState, activeSeason)).toEqual({
      fromDate: '2026-09-01',
      sourceBoundaryKey: kickoffKey,
      target: null,
      targetBoundaryKey: null,
      eventSeed: null,
      allowed: false,
      reason: 'Match simulation arrives in Phase 8.',
    })
    expect(matchSimulationUnavailable).toBe(
      'Match simulation arrives in Phase 8.',
    )
    expect(nextFoundationBoundary(kickoffState, activeSeason)).toBeNull()
    expect({ initial, activeSeason, deadlineState, kickoffState }).toEqual(
      before,
    )
    expect(previewTimeAdvance(initial, activeSeason)).toEqual(deadline)
  })

  it('consumes a same-day deadline once and never returns it after consumption', () => {
    const due = { ...deadlineState, lastBoundaryKey: null }
    const preview = previewTimeAdvance(due, season)
    expect(preview.allowed).toBe(true)
    expect(preview.target?.date).toBe(due.currentDate)
    expect(preview.targetBoundaryKey).not.toBe(preview.sourceBoundaryKey)
    expect(previewTimeAdvance(deadlineState, season).target?.date).toBe(
      '2026-09-01',
    )
  })

  it('always selects the same deadline for unconsumed preseason days', () => {
    for (let day = 0; day <= 61; day++) {
      const state = {
        ...simulationState,
        currentDate: addDays(simulationState.currentDate, day),
      }
      const preview = previewTimeAdvance(state, season)
      expect(preview.targetBoundaryKey).toBe(deadlineKey)
      expect(preview.target!.date >= preview.fromDate).toBe(true)
    }
  })

  it('uses the explicit season year instead of audit time or season ordinal', () => {
    const nextSeason = seasonSchema.parse({
      ...season,
      ordinal: 5,
      ...seasonDates(2027),
      openedAt: '2099-12-31T00:00:00.000Z',
    })
    const state = simulationStateSchema.parse({
      ...simulationState,
      currentDate: '2027-07-01',
    })
    expect(previewTimeAdvance(state, nextSeason).target).toEqual({
      key: 'season:2027:summer-deadline',
      date: '2027-08-31',
      kind: 'summer-deadline',
    })
  })

  it.each([
    { currentDate: '2026-06-30' },
    { currentDate: '2027-07-01' },
    { currentDate: '2026-09-01' },
    { currentDate: '2026-02-30' },
    { phase: 'league' },
    { phase: 'review' },
    { lastBoundaryKey: deadlineKey },
    {
      lastBoundaryKey: 'season:2025:summer-deadline',
      currentDate: '2026-08-31',
    },
    { lastBoundaryKey: 'unknown' },
    { lastBoundaryKey: kickoffKey, currentDate: '2026-08-31', phase: 'league' },
    { lastBoundaryKey: kickoffKey, currentDate: '2026-09-01' },
    { lastBoundaryKey: deadlineKey, currentDate: '2026-09-01' },
    {
      lastBoundaryKey: deadlineKey,
      currentDate: '2026-08-31',
      phase: 'league',
    },
    { lastBoundaryKey: kickoffKey, currentDate: '2026-09-02', phase: 'league' },
    { simulationVersion: '2' },
    { calendarVersion: '2' },
  ])('refuses invalid or unsupported date/phase/cursor state %j', (changes) => {
    const state = { ...simulationState, ...changes } as SimulationState
    const before = structuredClone(state)
    expect(() => nextFoundationBoundary(state, season)).toThrow()
    expect(() => previewTimeAdvance(state, season)).toThrow()
    expect(() => activeTransferWindow(state, season)).toThrow()
    expect(state).toEqual(before)
  })

  it.each([
    { campaignId: 'other' },
    { id: 'other' },
    { status: 'closed' },
    { closedAt: '2026-08-31T00:00:00.000Z' },
    { startDate: null },
    { endDate: null },
    { startDate: '2026-07-02' },
    { endDate: '2027-06-29' },
  ])('refuses mismatched or incomplete season %j', (changes) => {
    const invalidSeason = { ...season, ...changes } as Season
    expect(() => previewTimeAdvance(simulationState, invalidSeason)).toThrow(
      RangeError,
    )
    expect(() =>
      nextFoundationBoundary(simulationState, invalidSeason),
    ).toThrow(RangeError)
    expect(() => activeTransferWindow(simulationState, invalidSeason)).toThrow(
      RangeError,
    )
  })
})
