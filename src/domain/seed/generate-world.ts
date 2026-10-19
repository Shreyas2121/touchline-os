import {
  positionGroupFor,
  type Position,
  type PositionGroup,
} from '../models/positions'
import type { ParseResult } from '../validation/result'
import {
  familySyllables,
  givenSyllables,
  leagues,
  nationalities,
  palettes,
  prefixes,
  regions,
  suffixes,
} from './names'
import { hashSeed, mulberry32, nextInt } from './prng'

export const GENERATOR_VERSION = '1'
export const FEATURED_SEED = 'touchline-demo-v1'
export const FEATURED_CAMPAIGN_ID = 'demo'

export type GeneratedLeague = {
  id: string
  campaignId: string
  name: string
  countryCode: string
  tier: number
}

export type GeneratedClub = {
  id: string
  campaignId: string
  leagueId: string
  name: string
  shortName: string
  colors: { primary: string; secondary: string }
  prestige: number
  academyTier: number
  scoutingRegion: string
}

export type GeneratedPlayer = {
  id: string
  campaignId: string
  clubId: string | null
  name: string
  positionGroup: PositionGroup
  positions: [Position]
  nationalityCode: string
  birthDate: null
  reportedAge: number
  ageReferenceSeasonOrdinal: 1
  marketValueCents: number
  attributes: {
    pace: number
    finishing: number
    passing: number
    dribbling: number
    defending: number
    physical: number
  }
  potential: number
  source: 'fictional'
  externalSourceId: null
  isNewgen: false
  weeklyWageCents: number
}

export type GeneratedWorld = {
  leagues: GeneratedLeague[]
  clubs: GeneratedClub[]
  players: GeneratedPlayer[]
}

const positionWeights = [
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

// Attribute ranges follow pace, finishing, passing, dribbling, defending, physical.
const attributeBounds = {
  GK: [
    [20, 55],
    [5, 30],
    [25, 60],
    [15, 45],
    [30, 70],
    [40, 80],
  ],
  DEF: [
    [30, 80],
    [15, 50],
    [30, 75],
    [25, 70],
    [45, 90],
    [40, 90],
  ],
  MID: [
    [35, 85],
    [30, 80],
    [45, 90],
    [40, 90],
    [25, 80],
    [35, 85],
  ],
  FWD: [
    [45, 95],
    [50, 95],
    [30, 80],
    [45, 90],
    [15, 50],
    [35, 85],
  ],
} as const

function drawPosition(rng: () => number): Position {
  let ticket = nextInt(rng, 28)
  for (const [position, weight] of positionWeights) {
    if (ticket < weight) return position
    ticket -= weight
  }
  throw new RangeError('Position ticket is out of range.')
}

function capitalize(word: string): string {
  return word[0].toUpperCase() + word.slice(1)
}

export function generateWorld(input: {
  seed: string
  generatorVersion: string
  campaignId: string
}): ParseResult<GeneratedWorld> {
  const { seed, generatorVersion, campaignId } = input
  if (generatorVersion !== GENERATOR_VERSION) {
    return { ok: false, message: 'Unsupported generator version.' }
  }

  const rng = mulberry32(hashSeed(seed, generatorVersion))
  const generatedLeagues = leagues.map((league, i) => ({
    ...league,
    id: `${campaignId}-league-${i + 1}`,
    campaignId,
  }))
  const shortNameCounts = new Map<string, number>()
  const clubs: GeneratedClub[] = Array.from({ length: 72 }, (_, i) => {
    const name = prefixes[i % 18] + suffixes[Math.floor(i / 18)]
    const base = name.slice(0, 3).toUpperCase()
    const count = (shortNameCounts.get(base) ?? 0) + 1
    shortNameCounts.set(base, count)
    return {
      id: `${campaignId}-club-${String(i + 1).padStart(2, '0')}`,
      campaignId,
      leagueId: generatedLeagues[Math.floor(i / 18)].id,
      name,
      shortName: count === 1 ? base : `${base}${count}`,
      colors: { ...palettes[nextInt(rng, 8)] },
      prestige: 20 + nextInt(rng, 71),
      academyTier: 1 + nextInt(rng, 5),
      scoutingRegion: regions[nextInt(rng, 6)],
    }
  })
  const clubAssignments = clubs.flatMap((club, i) =>
    Array<string>(36 + (i % 9)).fill(club.id),
  )
  const players: GeneratedPlayer[] = Array.from({ length: 3000 }, (_, i) => {
    const position = drawPosition(rng)
    const positionGroup = positionGroupFor(position)
    const nationalityCode = nationalities[nextInt(rng, 10)]
    const reportedAge = 16 + nextInt(rng, 23)
    if (positionGroup === 'UNKNOWN')
      throw new RangeError('Unknown generated position.')
    const [pace, finishing, passing, dribbling, defending, physical] =
      attributeBounds[positionGroup].map(
        ([min, max]) => min + nextInt(rng, max - min + 1),
      )
    const potential = 40 + nextInt(rng, 56)
    const marketValueCents = (2 + nextInt(rng, 799)) * 2_500_000
    const wageStepCount = reportedAge <= 21 ? 16 : reportedAge >= 32 ? 40 : 157
    const weeklyWageCents = (1 + nextInt(rng, wageStepCount)) * 50_000
    const syllableCount = nextInt(rng, 2) === 0 ? 2 : 3
    let given = ''
    for (let j = 0; j < syllableCount; j += 1) {
      given += givenSyllables[nextInt(rng, givenSyllables.length)]
    }
    const family = familySyllables[nextInt(rng, familySyllables.length)]
    return {
      id: `${campaignId}-player-${String(i + 1).padStart(4, '0')}`,
      campaignId,
      clubId: clubAssignments[i] ?? null,
      name: `${capitalize(given)} ${capitalize(family)}`,
      positionGroup,
      positions: [position],
      nationalityCode,
      birthDate: null,
      reportedAge,
      ageReferenceSeasonOrdinal: 1,
      marketValueCents,
      attributes: { pace, finishing, passing, dribbling, defending, physical },
      potential,
      source: 'fictional',
      externalSourceId: null,
      isNewgen: false,
      weeklyWageCents,
    }
  })
  return { ok: true, value: { leagues: generatedLeagues, clubs, players } }
}
