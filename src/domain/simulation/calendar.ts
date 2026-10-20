import { addDays, dateOnlySchema, type DateOnly } from '../models/dates'
import { limits } from '../validation/limits'
import { seasonSchema, type Season } from '../validation/schemas'
import { deriveEventSeed } from './random'
import { simulationStateSchema, type SimulationState } from './schemas'

export const matchSimulationUnavailable = 'Match simulation arrives in Phase 8.'
export type TransferWindow = 'summer' | 'winter'

export type GameBoundary = {
  key: string
  date: DateOnly
  kind: 'summer-deadline' | 'league-kickoff'
}

export type ClockPreview = {
  fromDate: DateOnly
  sourceBoundaryKey: string | null
} & (
  | {
      allowed: true
      target: GameBoundary
      targetBoundaryKey: string
      eventSeed: number
      reason: null
    }
  | {
      allowed: false
      target: null
      targetBoundaryKey: null
      eventSeed: null
      reason: string
    }
)

export function seasonDates(startYear: number): {
  startDate: DateOnly
  endDate: DateOnly
} {
  if (
    !Number.isInteger(startYear) ||
    startYear < limits.yearMin ||
    startYear >= limits.yearMax
  ) {
    throw new RangeError(
      `Choose a season start year from ${limits.yearMin} to ${limits.yearMax - 1}.`,
    )
  }
  return {
    startDate: dateOnlySchema.parse(`${startYear}-07-01`),
    endDate: dateOnlySchema.parse(`${startYear + 1}-06-30`),
  }
}

/** Calendar intervals are inclusive; use activeTransferWindow for cursor readiness. */
export function transferWindowOn(date: DateOnly): TransferWindow | null {
  const monthDay = dateOnlySchema.parse(date).slice(5)
  if (monthDay >= '07-01' && monthDay <= '08-31') return 'summer'
  if (monthDay >= '01-01' && monthDay <= '01-31') return 'winter'
  return null
}

function foundationBoundaries(startYear: number): {
  deadline: GameBoundary
  kickoff: GameBoundary
} {
  const deadline: GameBoundary = {
    key: `season:${startYear}:summer-deadline`,
    date: dateOnlySchema.parse(`${startYear}-08-31`),
    kind: 'summer-deadline',
  }
  return {
    deadline,
    kickoff: {
      key: `season:${startYear}:league-kickoff`,
      date: addDays(deadline.date, 1),
      kind: 'league-kickoff',
    },
  }
}

/**
 * Phase 7 supports only unconsumed preseason dates up to August 31, a consumed
 * deadline exactly on August 31, and consumed kickoff in league phase exactly
 * on September 1. A same-day unconsumed deadline changes the cursor once.
 * Invalid state/season pairs throw; no guessed date or boundary repairs a save.
 */
function foundationClock(state: SimulationState, season: Season) {
  const clock = simulationStateSchema.parse(state)
  const activeSeason = seasonSchema.parse(season)
  if (
    activeSeason.campaignId !== clock.campaignId ||
    activeSeason.id !== clock.activeSeasonId ||
    activeSeason.status !== 'active' ||
    activeSeason.closedAt !== null ||
    activeSeason.startDate === null
  ) {
    throw new RangeError('The clock must reference its campaign active season.')
  }
  const startYear = Number(activeSeason.startDate.slice(0, 4))
  const dates = seasonDates(startYear)
  if (
    activeSeason.startDate !== dates.startDate ||
    activeSeason.endDate !== dates.endDate ||
    clock.currentDate < dates.startDate ||
    clock.currentDate > dates.endDate
  ) {
    throw new RangeError(
      'The clock must be inside an explicit July-June season.',
    )
  }
  const boundaries = foundationBoundaries(startYear)
  const { deadline, kickoff } = boundaries
  const unconsumedPreseason =
    clock.phase === 'preseason' &&
    clock.lastBoundaryKey === null &&
    clock.currentDate <= deadline.date
  const consumedDeadline =
    clock.phase === 'preseason' &&
    clock.lastBoundaryKey === deadline.key &&
    clock.currentDate === deadline.date
  const consumedKickoff =
    clock.phase === 'league' &&
    clock.lastBoundaryKey === kickoff.key &&
    clock.currentDate === kickoff.date
  if (!unconsumedPreseason && !consumedDeadline && !consumedKickoff) {
    throw new RangeError(
      'Game date, phase and consumed boundary are inconsistent.',
    )
  }
  return { clock, ...boundaries }
}

function nextBoundary({
  clock,
  deadline,
  kickoff,
}: ReturnType<typeof foundationClock>): GameBoundary | null {
  if (clock.lastBoundaryKey === null) return deadline
  if (clock.lastBoundaryKey === deadline.key) return kickoff
  return null
}

export function nextFoundationBoundary(
  state: SimulationState,
  season: Season,
): GameBoundary | null {
  return nextBoundary(foundationClock(state, season))
}

/** Phase 7 readiness: consuming the deadline closes summer on the same date. */
export function activeTransferWindow(
  state: SimulationState,
  season: Season,
): TransferWindow | null {
  const { clock, deadline } = foundationClock(state, season)
  if (clock.lastBoundaryKey === deadline.key) return null
  return transferWindowOn(clock.currentDate)
}

export function previewTimeAdvance(
  state: SimulationState,
  season: Season,
): ClockPreview {
  const context = foundationClock(state, season)
  const { clock } = context
  const source = {
    fromDate: clock.currentDate,
    sourceBoundaryKey: clock.lastBoundaryKey,
  }
  const target = nextBoundary(context)
  if (target === null) {
    return {
      ...source,
      allowed: false,
      target: null,
      targetBoundaryKey: null,
      eventSeed: null,
      reason: matchSimulationUnavailable,
    }
  }
  return {
    ...source,
    allowed: true,
    target,
    targetBoundaryKey: target.key,
    eventSeed: deriveEventSeed(
      clock.rootSeed,
      clock.simulationVersion,
      'calendar',
      [target.key],
    ),
    reason: null,
  }
}
