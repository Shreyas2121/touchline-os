import type { AttributeName } from '../player/ability'
import type { Position } from '../models/positions'
import { constitutionPreset } from '../rules/presets'
import { limits } from '../validation/limits'
import { prefixes, suffixes } from './names'

/**
 * Versioned fictional generation, valuation, and wage scale for playable worlds.
 * These are gameplay choices for this game. They are not external football facts.
 * Club transfer balances and wage ceilings are the club's own funds. They are
 * separate from the managed board's opening allocation in the constitution presets.
 */

export const PLAYABLE_LEAGUE_COUNT = 4
export const PLAYABLE_CLUB_COUNT = 72
export const PLAYABLE_OWNED_PLAYER_COUNT = 2_880
export const PLAYABLE_FREE_AGENT_COUNT = 120
export const PLAYABLE_PLAYER_COUNT =
  PLAYABLE_OWNED_PLAYER_COUNT + PLAYABLE_FREE_AGENT_COUNT
export const PLAYABLE_CLUBS_PER_LEAGUE = 18

export const PLAYABLE_ROSTER_BASE = 36
export const PLAYABLE_ROSTER_CYCLE = 9

export function rosterSize(clubIndex: number): number {
  return PLAYABLE_ROSTER_BASE + (clubIndex % PLAYABLE_ROSTER_CYCLE)
}

export function fictionalClubNames(
  count: number,
): { name: string; shortName: string }[] {
  const shortNameCounts = new Map<string, number>()
  return Array.from({ length: count }, (_, index) => {
    const name =
      prefixes[index % prefixes.length] +
      suffixes[Math.floor(index / prefixes.length)]
    const base = name.slice(0, 3).toUpperCase()
    const seen = (shortNameCounts.get(base) ?? 0) + 1
    shortNameCounts.set(base, seen)
    return { name, shortName: seen === 1 ? base : `${base}${seen}` }
  })
}

/** Assigned before any discretionary position draw. Counts: GK 2, DEF 6, MID 7, FWD 5. */
export const guaranteedPositions = [
  'GK',
  'GK',
  'CB',
  'CB',
  'CB',
  'LB',
  'RB',
  'CDM',
  'CM',
  'CM',
  'CAM',
  'LM',
  'RM',
  'LW',
  'RW',
  'ST',
  'ST',
  'CB',
  'CM',
  'ST',
] as const satisfies readonly Position[]

export const discretionaryPositionWeights = [
  ['GK', 2],
  ['CB', 4],
  ['LB', 2],
  ['RB', 2],
  ['CDM', 2],
  ['CM', 4],
  ['CAM', 2],
  ['LM', 1],
  ['RM', 1],
  ['LW', 2],
  ['RW', 2],
  ['ST', 3],
  ['CF', 1],
] as const satisfies readonly (readonly [Position, number])[]

export const DISCRETIONARY_POSITION_TICKETS =
  discretionaryPositionWeights.reduce((sum, [, weight]) => sum + weight, 0)

export const SENIOR_COUNT = 25
export const HOMEGROWN_CLUB_COUNT = 12
export const SENIOR_AGE_MIN = 21
export const SENIOR_AGE_SPAN = 14
export const OPEN_AGE_MIN = 16
export const OPEN_AGE_SPAN = 23
export const REGISTRATION_AGE_EXEMPT_UNDER = 21

export const PRESTIGE_MIN = 20
export const PRESTIGE_SPAN = 71
export const FREE_AGENT_PRESTIGE = 55
export const ACADEMY_TIER_SPAN = 5

/** Inclusive draw of 25 integers inside each attribute's floor/ceiling. */
export const ATTRIBUTE_DRAW_SPAN = 25

export const attributeWindows = {
  GK: {
    pace: [20, 60],
    finishing: [5, 40],
    passing: [25, 70],
    dribbling: [10, 50],
    defending: [30, 80],
    physical: [40, 90],
  },
  DEF: {
    pace: [30, 85],
    finishing: [10, 50],
    passing: [25, 80],
    dribbling: [20, 70],
    defending: [40, 95],
    physical: [40, 95],
  },
  MID: {
    pace: [30, 90],
    finishing: [25, 85],
    passing: [40, 95],
    dribbling: [30, 90],
    defending: [20, 80],
    physical: [30, 90],
  },
  FWD: {
    pace: [40, 95],
    finishing: [40, 95],
    passing: [25, 80],
    dribbling: [35, 95],
    defending: [10, 50],
    physical: [30, 90],
  },
} as const satisfies Record<
  'GK' | 'DEF' | 'MID' | 'FWD',
  Record<AttributeName, readonly [number, number]>
>

export function attributeWindowStart(
  floor: number,
  ceiling: number,
  prestige: number,
): number {
  const usable = ceiling - floor - (ATTRIBUTE_DRAW_SPAN - 1)
  return floor + Math.floor((usable * prestige) / 100)
}

export const YOUTH_POTENTIAL_AGE = 23
export const YOUTH_POTENTIAL_SPREAD = 15
export const SENIOR_POTENTIAL_SPREAD = 8

export function potentialSpread(age: number): number {
  return age <= YOUTH_POTENTIAL_AGE
    ? YOUTH_POTENTIAL_SPREAD
    : SENIOR_POTENTIAL_SPREAD
}

export const SHARPNESS_MIN = 70
export const SHARPNESS_MAX = 95
export const SHARPNESS_SPAN = SHARPNESS_MAX - SHARPNESS_MIN + 1
export const FITNESS = 100
export const MINIMUM_BENCH = 7

export const KEY_ABILITY = 70
export const YOUTH_AGE_MAX = 21
export const VALUE_PEAK_AGE = 27
export const AGE_FACTOR_DROP_PER_YEAR = 3
export const AGE_FACTOR_MIN = 50
export const AGE_FACTOR_MAX = 100

/** €50,000 of fictional value per current role-ability point, before age. */
export const VALUE_CENTS_PER_ABILITY = 5_000_000
/** €20,000 of fictional value per potential point above current ability. */
export const VALUE_CENTS_PER_UPSIDE = 2_000_000

/** Euro cents of weekly wage per ability point, before the age factor and cap. */
export const WAGE_CENTS_PER_ABILITY = {
  youth: 2_000,
  rotation: 12_000,
  key: 25_000,
} as const

function strictWageCaps(): {
  key: number
  rotation: number
  youth: number
} {
  const rule = constitutionPreset('strict').find(
    (item) => item.id === 'WAGE_TIER_CAP',
  )
  if (!rule || rule.id !== 'WAGE_TIER_CAP') {
    throw new RangeError('Strict wage caps are missing.')
  }
  return {
    key: rule.keyWeeklyCapCents,
    rotation: rule.rotationWeeklyCapCents,
    youth: rule.youthWeeklyCapCents,
  }
}

/** Strict preset caps: €22,500 / €10,000 / €2,500 per week. Balanced caps are higher. */
export const strictWageCapCents = strictWageCaps()

export type SquadTierName = 'key' | 'rotation' | 'youth'

export function ageFactor(age: number): number {
  const gap = Math.abs(age - VALUE_PEAK_AGE)
  return Math.max(
    AGE_FACTOR_MIN,
    AGE_FACTOR_MAX - gap * AGE_FACTOR_DROP_PER_YEAR,
  )
}

export function marketValueCents(input: {
  age: number
  roleAbility: number
  potential: number
}): number {
  const upside = Math.max(0, input.potential - input.roleAbility)
  const youthMultiplier = input.age <= YOUTH_POTENTIAL_AGE ? 2 : 1
  const raw =
    input.roleAbility * VALUE_CENTS_PER_ABILITY +
    upside * VALUE_CENTS_PER_UPSIDE * youthMultiplier
  return Math.floor((raw * ageFactor(input.age)) / 100)
}

export function squadTierFor(age: number, ability: number): SquadTierName {
  if (age <= YOUTH_AGE_MAX) return 'youth'
  if (ability >= KEY_ABILITY) return 'key'
  return 'rotation'
}

export function weeklyWageCents(input: {
  age: number
  roleAbility: number
  squadTier: SquadTierName
}): number {
  const raw = Math.floor(
    (input.roleAbility *
      WAGE_CENTS_PER_ABILITY[input.squadTier] *
      ageFactor(input.age)) /
      100,
  )
  return Math.min(strictWageCapCents[input.squadTier], raw)
}

/** At least current weekly wages plus 20 percent, and at least €1,000. */
export const RECRUITMENT_MARGIN_NUMERATOR = 1
export const RECRUITMENT_MARGIN_DENOMINATOR = 5
export const MIN_RECRUITMENT_MARGIN_CENTS = 100_000

export function recruitmentMarginCents(commitmentCents: number): number {
  return Math.max(
    MIN_RECRUITMENT_MARGIN_CENTS,
    Math.floor(
      (commitmentCents * RECRUITMENT_MARGIN_NUMERATOR) /
        RECRUITMENT_MARGIN_DENOMINATOR,
    ),
  )
}

export function wageBudgetWeeklyCents(commitmentCents: number): number {
  return commitmentCents + recruitmentMarginCents(commitmentCents)
}

/** €1,000,000 plus €40,000 per prestige point. Not a board-policy allocation. */
export const TRANSFER_BASE_CENTS = 100_000_000
export const TRANSFER_CENTS_PER_PRESTIGE = 4_000_000

export function transferBalanceCents(prestige: number): number {
  return TRANSFER_BASE_CENTS + prestige * TRANSFER_CENTS_PER_PRESTIGE
}

export const MAX_CONTRACT_SEASONS = 4

export function maxContractSeasons(startYear: number): number {
  return Math.min(MAX_CONTRACT_SEASONS, limits.yearMax - startYear)
}

export type PersistenceKind =
  'league' | 'club' | 'player' | 'contract' | 'club-state' | 'player-state'

export function persistenceSuffix(
  kind: PersistenceKind,
  index: number,
): string {
  if (kind === 'league') return `league-${index}`
  const width = kind === 'club' || kind === 'club-state' ? 2 : 4
  return `${kind}-${String(index).padStart(width, '0')}`
}

export function clubKey(index: number): string {
  return `club:${String(index).padStart(2, '0')}`
}

export function playerKey(index: number): string {
  return `player:${String(index).padStart(4, '0')}`
}

export const LONGEST_ID_SUFFIX = `-${persistenceSuffix(
  'player-state',
  PLAYABLE_PLAYER_COUNT,
)}`

export const PLAYABLE_CAMPAIGN_ID_MAX = limits.idMax - LONGEST_ID_SUFFIX.length

export function positionForTicket(ticket: number): Position {
  let remaining = ticket
  for (const [position, weight] of discretionaryPositionWeights) {
    if (remaining < weight) return position
    remaining -= weight
  }
  throw new RangeError('Position ticket is out of range.')
}
