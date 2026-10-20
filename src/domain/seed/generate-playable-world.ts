import type { ParseResult } from '../validation/result'
import { dateOnlySchema } from '../models/dates'
import {
  positionGroupFor,
  unknownPositionMessage,
  type PositionGroup,
} from '../models/positions'
import {
  attributeNames,
  goalkeeperRating,
  roleAbility,
  type AttributeRatings,
} from '../player/ability'
import { seasonDates } from '../simulation/calendar'
import { createEventStream } from '../simulation/random'
import { entityIdSchema } from '../validation/schemas'
import { limits } from '../validation/limits'
import {
  familySyllables,
  givenSyllables,
  leagues,
  nationalities,
  palettes,
  regions,
} from './names'
import { nextInt } from './prng'
import {
  ACADEMY_TIER_SPAN,
  ATTRIBUTE_DRAW_SPAN,
  attributeWindows,
  attributeWindowStart,
  FITNESS,
  fictionalClubNames,
  FREE_AGENT_PRESTIGE,
  guaranteedPositions,
  HOMEGROWN_CLUB_COUNT,
  marketValueCents,
  maxContractSeasons,
  OPEN_AGE_MIN,
  OPEN_AGE_SPAN,
  PLAYABLE_CLUB_COUNT,
  PLAYABLE_CLUBS_PER_LEAGUE,
  PLAYABLE_CAMPAIGN_ID_MAX,
  PLAYABLE_OWNED_PLAYER_COUNT,
  PLAYABLE_PLAYER_COUNT,
  positionForTicket,
  PRESTIGE_MIN,
  PRESTIGE_SPAN,
  potentialSpread,
  rosterSize,
  SENIOR_AGE_MIN,
  SENIOR_AGE_SPAN,
  SENIOR_COUNT,
  SHARPNESS_MIN,
  SHARPNESS_SPAN,
  squadTierFor,
  weeklyWageCents,
  clubKey,
  playerKey,
  persistenceSuffix,
  transferBalanceCents,
  wageBudgetWeeklyCents,
  DISCRETIONARY_POSITION_TICKETS,
  type PersistenceKind,
} from './playable-world-settings'
import {
  validatePlayableWorld,
  type PlayableWorld,
  type PlayableWorldDraft,
} from './playable-world-validation'

export const PLAYABLE_GENERATOR_VERSION = '2'
export const unsupportedGeneratorVersionMessage =
  'Unsupported generator version.'
export const invalidSeedMessage = 'Seed is not valid.'
export const invalidCampaignIdMessage = 'Campaign id is not valid.'
export const identityTooLongMessage =
  'Generated identity exceeds the 64-character limit.'
export const invalidStartYearMessage =
  'Start year is outside the supported season range.'

export type { PlayableWorld }

export type PlayableWorldInput = {
  seed: string
  generatorVersion: string
  campaignId: string
  startYear: number
}

/**
 * Draw order is part of the v2 seed contract.
 * The stream is createEventStream(seed, '1', 'world', ['playable-world:2']).
 * It does not receive the campaign id or the start year.
 * Clubs, in order: palette, prestige, academy tier, region.
 * Players, in order: a position ticket only for discretionary slots, nationality,
 * age, six attributes, potential, sharpness, contract length for owned players,
 * then the given name and family name.
 */
export function generatePlayableWorld(
  input: PlayableWorldInput,
): ParseResult<PlayableWorld> {
  const ready = readyInput(input)
  if (!ready.ok) return ready
  return validatePlayableWorld(buildWorld(ready.value), ready.value)
}

function readyInput(
  input: PlayableWorldInput,
): ParseResult<PlayableWorldInput> {
  if (input.generatorVersion !== PLAYABLE_GENERATOR_VERSION) {
    return { ok: false, message: unsupportedGeneratorVersionMessage }
  }
  if (
    typeof input.seed !== 'string' ||
    input.seed.length < 1 ||
    input.seed.length > limits.seedMax ||
    input.seed.trim() !== input.seed
  ) {
    return { ok: false, message: invalidSeedMessage }
  }
  if (
    typeof input.campaignId !== 'string' ||
    !entityIdSchema.safeParse(input.campaignId).success
  ) {
    return { ok: false, message: invalidCampaignIdMessage }
  }
  if (input.campaignId.length > PLAYABLE_CAMPAIGN_ID_MAX) {
    return { ok: false, message: identityTooLongMessage }
  }
  if (
    typeof input.startYear !== 'number' ||
    !Number.isInteger(input.startYear) ||
    input.startYear < limits.yearMin ||
    input.startYear >= limits.yearMax
  ) {
    return { ok: false, message: invalidStartYearMessage }
  }
  return { ok: true, value: input }
}

function persistenceId(
  campaignId: string,
  kind: PersistenceKind,
  index: number,
): string {
  return `${campaignId}-${persistenceSuffix(kind, index)}`
}

function capitalize(word: string): string {
  return word.slice(0, 1).toUpperCase() + word.slice(1)
}

function drawName(rng: () => number): string {
  const syllableCount = nextInt(rng, 2) === 0 ? 2 : 3
  let given = ''
  for (let syllable = 0; syllable < syllableCount; syllable += 1) {
    given += givenSyllables[nextInt(rng, givenSyllables.length)]
  }
  const family = familySyllables[nextInt(rng, familySyllables.length)]
  return `${capitalize(given)} ${capitalize(family)}`
}

function drawAttributes(
  rng: () => number,
  group: Exclude<PositionGroup, 'UNKNOWN'>,
  prestige: number,
): AttributeRatings {
  const ratings = {} as AttributeRatings
  for (const name of attributeNames) {
    const [floor, ceiling] = attributeWindows[group][name]
    ratings[name] =
      attributeWindowStart(floor, ceiling, prestige) +
      nextInt(rng, ATTRIBUTE_DRAW_SPAN)
  }
  return ratings
}

function buildWorld(input: PlayableWorldInput): PlayableWorldDraft {
  const { seed, campaignId, startYear } = input
  const rng = createEventStream(seed, '1', 'world', ['playable-world:2'])
  const season = seasonDates(startYear)
  const clubNames = fictionalClubNames(PLAYABLE_CLUB_COUNT)
  const generatedLeagues = leagues.map((league, index) => ({
    id: persistenceId(campaignId, 'league', index + 1),
    campaignId,
    name: league.name,
    countryCode: league.countryCode,
    tier: league.tier,
  }))
  const clubs = Array.from({ length: PLAYABLE_CLUB_COUNT }, (_, index) => {
    const namesForClub = clubNames[index]
    const palette = palettes[nextInt(rng, palettes.length)]
    return {
      id: persistenceId(campaignId, 'club', index + 1),
      campaignId,
      leagueId:
        generatedLeagues[Math.floor(index / PLAYABLE_CLUBS_PER_LEAGUE)].id,
      name: namesForClub.name,
      shortName: namesForClub.shortName,
      colors: { primary: palette.primary, secondary: palette.secondary },
      prestige: PRESTIGE_MIN + nextInt(rng, PRESTIGE_SPAN),
      academyTier: 1 + nextInt(rng, ACADEMY_TIER_SPAN),
      scoutingRegion: regions[nextInt(rng, regions.length)],
    }
  })
  const slots: { clubIndex: number; localIndex: number }[] = []
  for (let clubIndex = 0; clubIndex < clubs.length; clubIndex += 1) {
    const size = rosterSize(clubIndex)
    for (let localIndex = 0; localIndex < size; localIndex += 1) {
      slots.push({ clubIndex, localIndex })
    }
  }
  if (slots.length !== PLAYABLE_OWNED_PLAYER_COUNT) {
    throw new RangeError(
      'Owned player count does not match the roster schedule.',
    )
  }
  const players = []
  const contracts = []
  const playerSimulationStates = []
  for (let index = 0; index < PLAYABLE_PLAYER_COUNT; index += 1) {
    const number = index + 1
    const owned = index < PLAYABLE_OWNED_PLAYER_COUNT
    const slot = owned ? slots[index] : null
    if (owned && !slot) throw new RangeError('Missing squad slot.')
    const club = slot ? clubs[slot.clubIndex] : null
    const league = slot
      ? leagues[Math.floor(slot.clubIndex / PLAYABLE_CLUBS_PER_LEAGUE)]
      : null
    const position =
      slot && slot.localIndex < guaranteedPositions.length
        ? guaranteedPositions[slot.localIndex]
        : positionForTicket(nextInt(rng, DISCRETIONARY_POSITION_TICKETS))
    const positionGroup = positionGroupFor(position)
    if (positionGroup === 'UNKNOWN') {
      throw new RangeError(unknownPositionMessage)
    }
    const nationality = nationalities[nextInt(rng, nationalities.length)]
    const age =
      slot && slot.localIndex < SENIOR_COUNT
        ? SENIOR_AGE_MIN + nextInt(rng, SENIOR_AGE_SPAN)
        : OPEN_AGE_MIN + nextInt(rng, OPEN_AGE_SPAN)
    const prestige = club?.prestige ?? FREE_AGENT_PRESTIGE
    const attributes = drawAttributes(rng, positionGroup, prestige)
    const ability = roleAbility(attributes, positionGroup)
    const room = Math.min(potentialSpread(age), 100 - ability)
    const potential = ability + nextInt(rng, room + 1)
    const sharpness = SHARPNESS_MIN + nextInt(rng, SHARPNESS_SPAN)
    const tier = squadTierFor(age, ability)
    const playerId = persistenceId(campaignId, 'player', number)
    if (slot && club) {
      const seasons = 1 + nextInt(rng, maxContractSeasons(startYear))
      contracts.push({
        id: persistenceId(campaignId, 'contract', number),
        campaignId,
        playerId,
        clubId: club.id,
        weeklyWageCents: weeklyWageCents({
          age,
          roleAbility: ability,
          squadTier: tier,
        }),
        squadTier: tier,
        startsOn: season.startDate,
        expiresOn: dateOnlySchema.parse(`${startYear + seasons}-06-30`),
        status: 'active' as const,
      })
    }
    const name = drawName(rng)
    players.push({
      id: playerId,
      campaignId,
      clubId: club?.id ?? null,
      name,
      positionGroup,
      positions: [position],
      nationalityCode: nationality,
      birthDate: null,
      reportedAge: age,
      ageReferenceSeasonOrdinal: 1 as const,
      marketValueCents: marketValueCents({
        age,
        roleAbility: ability,
        potential,
      }),
      attributes,
      potential,
      source: 'fictional' as const,
      externalSourceId: null,
      isNewgen: false,
    })
    playerSimulationStates.push({
      id: persistenceId(campaignId, 'player-state', number),
      campaignId,
      playerId,
      simulationKey: playerKey(number),
      fitness: FITNESS,
      sharpness,
      goalkeeping: positionGroup === 'GK' ? goalkeeperRating(attributes) : null,
      injuryUntilDate: null,
      suspensionMatches: 0,
      status: 'active' as const,
      homegrownClub: slot !== null && slot.localIndex < HOMEGROWN_CLUB_COUNT,
      homegrownNation: league !== null && nationality === league.countryCode,
    })
  }
  const wagesByClub = new Map<string, number>()
  for (const contract of contracts) {
    wagesByClub.set(
      contract.clubId,
      (wagesByClub.get(contract.clubId) ?? 0) + contract.weeklyWageCents,
    )
  }
  const clubSimulationStates = clubs.map((club, index) => ({
    id: persistenceId(campaignId, 'club-state', index + 1),
    campaignId,
    clubId: club.id,
    simulationKey: clubKey(index + 1),
    transferBalanceCents: transferBalanceCents(club.prestige),
    wageBudgetWeeklyCents: wageBudgetWeeklyCents(wagesByClub.get(club.id) ?? 0),
  }))
  return {
    leagues: generatedLeagues,
    clubs,
    players,
    contracts,
    clubSimulationStates,
    playerSimulationStates,
  }
}
