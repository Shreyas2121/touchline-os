import type { DateOnly } from '../models/dates'
import { formationSlots, type FormationId } from '../graphics/pitch'
import { wageCommitment } from '../finance/wages'
import {
  attributeNames,
  goalkeeperRating,
  roleAbility,
  type AttributeRatings,
} from '../player/ability'
import { evaluateAction } from '../rules/evaluate-action'
import { constitutionPreset } from '../rules/presets'
import type { PolicyAction } from '../rules/types'
import { seasonDates } from '../simulation/calendar'
import { leagues, nationalities, palettes, regions } from './names'
import type { ParseResult } from '../validation/result'
import { limits } from '../validation/limits'
import {
  clubSchema,
  constitutionSchema,
  contractSchema,
  leagueSchema,
  playerSchema,
  type Club,
  type Contract,
  type League,
  type Player,
} from '../validation/schemas'
import {
  clubSimulationStateSchema,
  playerSimulationStateSchema,
  type ClubSimulationState,
  type PlayerSimulationState,
} from '../simulation/schemas'
import {
  ATTRIBUTE_DRAW_SPAN,
  attributeWindows,
  attributeWindowStart,
  clubKey,
  fictionalClubNames,
  FITNESS,
  FREE_AGENT_PRESTIGE,
  guaranteedPositions,
  HOMEGROWN_CLUB_COUNT,
  marketValueCents,
  maxContractSeasons,
  MINIMUM_BENCH,
  OPEN_AGE_MIN,
  OPEN_AGE_SPAN,
  persistenceSuffix,
  playerKey,
  PLAYABLE_CLUB_COUNT,
  PLAYABLE_CLUBS_PER_LEAGUE,
  PLAYABLE_FREE_AGENT_COUNT,
  PLAYABLE_LEAGUE_COUNT,
  PLAYABLE_OWNED_PLAYER_COUNT,
  PLAYABLE_PLAYER_COUNT,
  potentialSpread,
  PRESTIGE_MIN,
  PRESTIGE_SPAN,
  recruitmentMarginCents,
  rosterSize,
  SENIOR_AGE_MIN,
  SENIOR_AGE_SPAN,
  SENIOR_COUNT,
  SHARPNESS_MAX,
  SHARPNESS_MIN,
  squadTierFor,
  transferBalanceCents,
  wageBudgetWeeklyCents,
  weeklyWageCents,
  type PersistenceKind,
} from './playable-world-settings'

export type PlayableWorld = {
  leagues: League[]
  clubs: Club[]
  players: Player[]
  contracts: Contract[]
  clubSimulationStates: ClubSimulationState[]
  playerSimulationStates: PlayerSimulationState[]
}

export type PlayableWorldDraft = {
  leagues: readonly unknown[]
  clubs: readonly unknown[]
  players: readonly unknown[]
  contracts: readonly unknown[]
  clubSimulationStates: readonly unknown[]
  playerSimulationStates: readonly unknown[]
}

const supportedFormations = [
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '3-5-2',
] as const satisfies readonly FormationId[]

const registrationPresets = ['balanced', 'strict'] as const

function failed(detail: string): string {
  return `Playable world failed validation: ${detail}`
}

function persistenceId(
  campaignId: string,
  kind: PersistenceKind,
  index: number,
): string {
  return `${campaignId}-${persistenceSuffix(kind, index)}`
}

export function validatePlayableWorld(
  draft: PlayableWorldDraft,
  input: { campaignId: string; startYear: number },
): ParseResult<PlayableWorld> {
  if (
    !Number.isInteger(input.startYear) ||
    input.startYear < limits.yearMin ||
    input.startYear >= limits.yearMax
  ) {
    return {
      ok: false,
      message: 'Start year is outside the supported season range.',
    }
  }
  const season = seasonDates(input.startYear)
  const leaguesResult = parseRows(leagueSchema, draft.leagues, 'league')
  if (!leaguesResult.ok) return leaguesResult
  const clubsResult = parseRows(clubSchema, draft.clubs, 'club')
  if (!clubsResult.ok) return clubsResult
  const playersResult = parseRows(playerSchema, draft.players, 'player')
  if (!playersResult.ok) return playersResult
  const contractsResult = parseRows(contractSchema, draft.contracts, 'contract')
  if (!contractsResult.ok) return contractsResult
  const clubStatesResult = parseRows(
    clubSimulationStateSchema,
    draft.clubSimulationStates,
    'club simulation state',
  )
  if (!clubStatesResult.ok) return clubStatesResult
  const playerStatesResult = parseRows(
    playerSimulationStateSchema,
    draft.playerSimulationStates,
    'player simulation state',
  )
  if (!playerStatesResult.ok) return playerStatesResult
  const world: PlayableWorld = {
    leagues: leaguesResult.value,
    clubs: clubsResult.value,
    players: playersResult.value,
    contracts: contractsResult.value,
    clubSimulationStates: clubStatesResult.value,
    playerSimulationStates: playerStatesResult.value,
  }
  const problem = [
    checkShape(world, input.campaignId),
    checkPlayers(world, input.campaignId, input.startYear, season.endDate),
    checkFunds(world),
    checkSelections(world, input.campaignId, input.startYear, season.startDate),
  ].find((item) => item !== null)
  if (problem) return { ok: false, message: problem }
  return { ok: true, value: world }
}

function parseRows<T>(
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false }
  },
  rows: readonly unknown[],
  label: string,
): ParseResult<T[]> {
  const parsed: T[] = []
  for (const [index, row] of rows.entries()) {
    const result = schema.safeParse(row)
    if (!result.success) {
      return {
        ok: false,
        message: failed(
          `${label} ${index + 1} does not match the stored schema.`,
        ),
      }
    }
    parsed.push(result.data)
  }
  return { ok: true, value: parsed }
}

function checkShape(world: PlayableWorld, campaignId: string): string | null {
  if (world.leagues.length !== PLAYABLE_LEAGUE_COUNT) {
    return failed('league count is not 4.')
  }
  if (world.clubs.length !== PLAYABLE_CLUB_COUNT) {
    return failed('club count is not 72.')
  }
  if (world.players.length !== PLAYABLE_PLAYER_COUNT) {
    return failed('player count is not 3000.')
  }
  if (world.contracts.length !== PLAYABLE_OWNED_PLAYER_COUNT) {
    return failed('contract count is not 2880.')
  }
  if (world.clubSimulationStates.length !== PLAYABLE_CLUB_COUNT) {
    return failed('club simulation state count is not 72.')
  }
  if (world.playerSimulationStates.length !== PLAYABLE_PLAYER_COUNT) {
    return failed('player simulation state count is not 3000.')
  }
  const clubNames = fictionalClubNames(PLAYABLE_CLUB_COUNT)
  for (const [index, league] of world.leagues.entries()) {
    const source = leagues[index]
    if (
      !source ||
      league.id !== persistenceId(campaignId, 'league', index + 1) ||
      league.campaignId !== campaignId ||
      league.name !== source.name ||
      league.countryCode !== source.countryCode ||
      league.tier !== source.tier
    ) {
      return failed(
        `league ${index + 1} does not match the fictional template.`,
      )
    }
  }
  const names = new Set<string>()
  const shortNames = new Set<string>()
  for (const [index, club] of world.clubs.entries()) {
    const expected = clubNames[index]
    const knownColors = palettes.some(
      (palette) =>
        palette.primary === club.colors.primary &&
        palette.secondary === club.colors.secondary,
    )
    const regionList: readonly string[] = regions
    if (
      !expected ||
      club.id !== persistenceId(campaignId, 'club', index + 1) ||
      club.campaignId !== campaignId ||
      club.leagueId !==
        persistenceId(
          campaignId,
          'league',
          Math.floor(index / PLAYABLE_CLUBS_PER_LEAGUE) + 1,
        ) ||
      club.name !== expected.name ||
      club.shortName !== expected.shortName ||
      !knownColors ||
      club.scoutingRegion === null ||
      !regionList.includes(club.scoutingRegion) ||
      club.prestige < PRESTIGE_MIN ||
      club.prestige >= PRESTIGE_MIN + PRESTIGE_SPAN
    ) {
      return failed(`club ${index + 1} is not a generated club.`)
    }
    names.add(club.name)
    shortNames.add(club.shortName)
    const state = world.clubSimulationStates[index]
    if (
      !state ||
      state.id !== persistenceId(campaignId, 'club-state', index + 1) ||
      state.campaignId !== campaignId ||
      state.clubId !== club.id ||
      state.simulationKey !== clubKey(index + 1)
    ) {
      return failed(`club ${index + 1} simulation identity does not match.`)
    }
  }
  if (
    names.size !== world.clubs.length ||
    shortNames.size !== world.clubs.length
  ) {
    return failed('club names are not unique.')
  }
  const owned = world.players.filter((player) => player.clubId !== null)
  if (
    owned.length !== PLAYABLE_OWNED_PLAYER_COUNT ||
    world.players.length - owned.length !== PLAYABLE_FREE_AGENT_COUNT
  ) {
    return failed('owned and free-agent counts are not 2880 and 120.')
  }
  return null
}

function ratingsOf(player: Player): AttributeRatings | null {
  const { pace, finishing, passing, dribbling, defending, physical } =
    player.attributes
  if (
    pace === undefined ||
    finishing === undefined ||
    passing === undefined ||
    dribbling === undefined ||
    defending === undefined ||
    physical === undefined
  ) {
    return null
  }
  return { pace, finishing, passing, dribbling, defending, physical }
}

function checkPlayers(
  world: PlayableWorld,
  campaignId: string,
  startYear: number,
  seasonEnd: DateOnly,
): string | null {
  const nationalityList: readonly string[] = nationalities
  let cursor = 0
  for (let clubIndex = 0; clubIndex < world.clubs.length; clubIndex += 1) {
    const club = world.clubs[clubIndex]
    const league =
      world.leagues[Math.floor(clubIndex / PLAYABLE_CLUBS_PER_LEAGUE)]
    if (!club || !league) return failed('club league reference is missing.')
    const size = rosterSize(clubIndex)
    for (let localIndex = 0; localIndex < size; localIndex += 1) {
      const problem = checkOwnedPlayer(world, {
        campaignId,
        startYear,
        seasonEnd,
        cursor,
        club,
        countryCode: league.countryCode,
        localIndex,
      })
      if (problem) return problem
      cursor += 1
    }
  }
  if (cursor !== PLAYABLE_OWNED_PLAYER_COUNT) {
    return failed('roster schedule does not cover the owned players.')
  }
  for (let index = cursor; index < world.players.length; index += 1) {
    const problem = checkFreeAgent(world, campaignId, index)
    if (problem) return problem
    const player = world.players[index]
    if (
      !player?.nationalityCode ||
      !nationalityList.includes(player.nationalityCode)
    ) {
      return failed(`player ${index + 1} nationality is not fictional.`)
    }
  }
  for (let index = 0; index < cursor; index += 1) {
    const player = world.players[index]
    if (
      !player?.nationalityCode ||
      !nationalityList.includes(player.nationalityCode)
    ) {
      return failed(`player ${index + 1} nationality is not fictional.`)
    }
  }
  return null
}

function checkOwnedPlayer(
  world: PlayableWorld,
  input: {
    campaignId: string
    startYear: number
    seasonEnd: DateOnly
    cursor: number
    club: Club
    countryCode: string | null
    localIndex: number
  },
): string | null {
  const number = input.cursor + 1
  const player = world.players[input.cursor]
  const profile = world.playerSimulationStates[input.cursor]
  const contract = world.contracts[input.cursor]
  if (
    !player ||
    !profile ||
    !contract ||
    player.id !== persistenceId(input.campaignId, 'player', number) ||
    player.campaignId !== input.campaignId ||
    player.clubId !== input.club.id ||
    profile.id !== persistenceId(input.campaignId, 'player-state', number) ||
    profile.playerId !== player.id ||
    profile.simulationKey !== playerKey(number) ||
    contract.id !== persistenceId(input.campaignId, 'contract', number) ||
    contract.playerId !== player.id ||
    contract.clubId !== input.club.id
  ) {
    return failed(`player ${number} references are incomplete.`)
  }
  if (
    input.localIndex < guaranteedPositions.length &&
    player.positions[0] !== guaranteedPositions[input.localIndex]
  ) {
    return failed(`player ${number} is outside the guaranteed coverage.`)
  }
  const senior = input.localIndex < SENIOR_COUNT
  if (player.reportedAge === null) {
    return failed(`player ${number} has no reported age.`)
  }
  const age = player.reportedAge
  const ageInBand = senior
    ? age >= SENIOR_AGE_MIN && age < SENIOR_AGE_MIN + SENIOR_AGE_SPAN
    : age >= OPEN_AGE_MIN && age < OPEN_AGE_MIN + OPEN_AGE_SPAN
  if (!ageInBand) return failed(`player ${number} age is outside its band.`)
  if (
    profile.homegrownClub !== input.localIndex < HOMEGROWN_CLUB_COUNT ||
    profile.homegrownNation !== (player.nationalityCode === input.countryCode)
  ) {
    return failed(`player ${number} eligibility flags are not explicit.`)
  }
  return checkProfileAndContract(player, profile, contract, {
    startYear: input.startYear,
    seasonEnd: input.seasonEnd,
    prestige: input.club.prestige,
  })
}

function checkFreeAgent(
  world: PlayableWorld,
  campaignId: string,
  index: number,
): string | null {
  const number = index + 1
  const player = world.players[index]
  const profile = world.playerSimulationStates[index]
  if (
    !player ||
    !profile ||
    player.id !== persistenceId(campaignId, 'player', number) ||
    player.campaignId !== campaignId ||
    player.clubId !== null ||
    profile.id !== persistenceId(campaignId, 'player-state', number) ||
    profile.playerId !== player.id ||
    profile.simulationKey !== playerKey(number) ||
    profile.homegrownClub !== false ||
    profile.homegrownNation !== false
  ) {
    return failed(`free agent ${number} is not unattached.`)
  }
  if (world.contracts.some((contract) => contract.playerId === player.id)) {
    return failed(`free agent ${number} has a contract.`)
  }
  if (player.reportedAge === null) {
    return failed(`free agent ${number} has no reported age.`)
  }
  const age = player.reportedAge
  if (age < OPEN_AGE_MIN || age >= OPEN_AGE_MIN + OPEN_AGE_SPAN) {
    return failed(`free agent ${number} age is outside its band.`)
  }
  return checkCommonProfile(player, profile, FREE_AGENT_PRESTIGE)
}

function checkProfileAndContract(
  player: Player,
  profile: PlayerSimulationState,
  contract: Contract,
  input: { startYear: number; seasonEnd: DateOnly; prestige: number },
): string | null {
  const common = checkCommonProfile(player, profile, input.prestige)
  if (common) return common
  if (player.reportedAge === null || player.potential === null) {
    return failed(`${player.id} is missing age or potential.`)
  }
  const ratings = ratingsOf(player)
  if (!ratings || player.positionGroup === 'UNKNOWN') {
    return failed(`${player.id} has no complete attribute profile.`)
  }
  const ability = roleAbility(ratings, player.positionGroup)
  const tier = squadTierFor(player.reportedAge, ability)
  const wage = weeklyWageCents({
    age: player.reportedAge,
    roleAbility: ability,
    squadTier: tier,
  })
  if (
    contract.status !== 'active' ||
    contract.squadTier !== tier ||
    contract.weeklyWageCents !== wage ||
    contract.startsOn !== `${input.startYear}-07-01` ||
    contract.expiresOn === null ||
    !contract.expiresOn.endsWith('-06-30') ||
    contract.expiresOn < input.seasonEnd
  ) {
    return failed(`${player.id} contract is incomplete.`)
  }
  const seasons = Number(contract.expiresOn.slice(0, 4)) - input.startYear
  if (seasons < 1 || seasons > maxContractSeasons(input.startYear)) {
    return failed(`${player.id} contract does not cover the first season.`)
  }
  return null
}

function checkCommonProfile(
  player: Player,
  profile: PlayerSimulationState,
  prestige: number,
): string | null {
  if (player.positionGroup === 'UNKNOWN') {
    return failed(`${player.id} is not a fictional generated player.`)
  }
  if (
    player.birthDate !== null ||
    player.ageReferenceSeasonOrdinal !== 1 ||
    player.source !== 'fictional' ||
    player.externalSourceId !== null ||
    player.isNewgen !== false ||
    player.reportedAge === null ||
    player.potential === null
  ) {
    return failed(`${player.id} is not a fictional generated player.`)
  }
  const ratings = ratingsOf(player)
  if (!ratings) return failed(`${player.id} is missing an attribute.`)
  for (const name of attributeNames) {
    const [floor, ceiling] = attributeWindows[player.positionGroup][name]
    const start = attributeWindowStart(floor, ceiling, prestige)
    const value = ratings[name]
    if (value < start || value > start + ATTRIBUTE_DRAW_SPAN - 1) {
      return failed(`${player.id} ${name} is outside the prestige window.`)
    }
  }
  const ability = roleAbility(ratings, player.positionGroup)
  const ceiling = Math.min(100, ability + potentialSpread(player.reportedAge))
  if (player.potential < ability || player.potential > ceiling) {
    return failed(`${player.id} potential is below the role ability.`)
  }
  if (
    player.marketValueCents !==
    marketValueCents({
      age: player.reportedAge,
      roleAbility: ability,
      potential: player.potential,
    })
  ) {
    return failed(`${player.id} market value does not follow the formula.`)
  }
  const keeper = player.positionGroup === 'GK'
  if (
    profile.campaignId !== player.campaignId ||
    profile.fitness !== FITNESS ||
    profile.sharpness < SHARPNESS_MIN ||
    profile.sharpness > SHARPNESS_MAX ||
    profile.injuryUntilDate !== null ||
    profile.suspensionMatches !== 0 ||
    profile.status !== 'active' ||
    (keeper
      ? profile.goalkeeping !== goalkeeperRating(ratings)
      : profile.goalkeeping !== null)
  ) {
    return failed(`${player.id} simulation profile is not playable.`)
  }
  return null
}

function checkFunds(world: PlayableWorld): string | null {
  for (const [index, club] of world.clubs.entries()) {
    const state = world.clubSimulationStates[index]
    if (!state) return failed(`club ${index + 1} has no funds.`)
    const commitment = wageCommitment(world.contracts, club.id)
    const counted =
      commitment.byTier.key.count +
      commitment.byTier.rotation.count +
      commitment.byTier.youth.count +
      commitment.byTier.unknown.count
    if (
      commitment.unknownCount !== 0 ||
      counted !== rosterSize(index) ||
      state.wageBudgetWeeklyCents !==
        wageBudgetWeeklyCents(commitment.knownCents) ||
      state.wageBudgetWeeklyCents <
        commitment.knownCents + recruitmentMarginCents(commitment.knownCents) ||
      state.transferBalanceCents !== transferBalanceCents(club.prestige)
    ) {
      return failed(`club ${index + 1} budget does not cover its commitments.`)
    }
  }
  return null
}

function checkSelections(
  world: PlayableWorld,
  campaignId: string,
  startYear: number,
  effectiveOn: DateOnly,
): string | null {
  const profiles = new Map(
    world.playerSimulationStates.map((profile) => [profile.playerId, profile]),
  )
  for (const preset of registrationPresets) {
    const constitution = constitutionSchema.safeParse({
      id: 'rule-check',
      campaignId,
      version: 1,
      rules: constitutionPreset(preset),
      updatedAt: `${startYear}-07-01T00:00:00.000Z`,
    })
    if (!constitution.success) {
      return failed(`${preset} registration rules could not be checked.`)
    }
    const rule = constitution.data.rules.find(
      (item) => item.id === 'REGISTRATION_QUOTA',
    )
    if (!rule || rule.id !== 'REGISTRATION_QUOTA') {
      return failed(`${preset} registration quota is missing.`)
    }
    for (const club of world.clubs) {
      const squad = world.players.filter((player) => player.clubId === club.id)
      if (preset === 'balanced') {
        const formationProblem = checkFormations(club, squad)
        if (formationProblem) return formationProblem
      }
      const members = squad.flatMap((player) => {
        const profile = profiles.get(player.id)
        return profile ? [{ player, profile }] : []
      })
      if (members.length !== squad.length) {
        return failed(`${club.name} is missing a player profile.`)
      }
      const chosen = chooseRegistration(
        members,
        rule.rosterLimit,
        rule.minimumHomegrown,
        rule.ageExemptionUnder,
      )
      if (!chosen) {
        return failed(`${club.name} cannot fill a ${preset} registration.`)
      }
      const action: PolicyAction = {
        type: 'registration',
        competitionKey: rule.competitionKey,
        players: chosen.map((member) => ({
          playerId: member.player.id,
          status: 'registered' as const,
          homegrownClub: member.profile.homegrownClub,
          homegrownNation: member.profile.homegrownNation,
          ageExempt: false,
          age: member.player.reportedAge,
        })),
      }
      const report = evaluateAction(
        action,
        { revision: 0, remainingCapacityCents: null },
        constitution.data,
        effectiveOn,
      )
      if (!report.allowed) {
        const verdict = report.verdicts.find(
          (item) => item.severity === 'BLOCK',
        )
        return failed(
          `${club.name} ${preset} registration: ${verdict?.message ?? 'blocked.'}`,
        )
      }
    }
  }
  return null
}

function checkFormations(club: Club, squad: readonly Player[]): string | null {
  const keepers = squad.filter((player) => player.positionGroup === 'GK')
  if (keepers.length < 2) {
    return failed(`${club.name} has fewer than two goalkeepers.`)
  }
  for (const formation of supportedFormations) {
    const eleven = startingEleven(squad, formation)
    if (!eleven) {
      return failed(`${club.name} cannot fill ${formation}.`)
    }
    const used = new Set(eleven.map((player) => player.id))
    const bench = squad.filter((player) => !used.has(player.id))
    if (
      bench.length < MINIMUM_BENCH ||
      !bench.some((player) => player.positionGroup === 'GK')
    ) {
      return failed(`${club.name} has no ${formation} bench.`)
    }
  }
  return null
}

function startingEleven(
  squad: readonly Player[],
  formation: FormationId,
): Player[] | null {
  const available = [...squad]
  const chosen: Player[] = []
  for (const slot of formationSlots(formation)) {
    const index = available.findIndex(
      (player) => player.positionGroup === slot.group,
    )
    if (index < 0) return null
    const player = available[index]
    if (!player) return null
    available.splice(index, 1)
    chosen.push(player)
  }
  return chosen
}

function chooseRegistration(
  members: readonly {
    player: Player
    profile: PlayerSimulationState
  }[],
  rosterLimit: number,
  minimumHomegrown: number,
  ageExemptionUnder: number | null,
): { player: Player; profile: PlayerSimulationState }[] | null {
  const nonExempt = members.filter((member) => {
    const age = member.player.reportedAge
    if (age === null) return false
    return ageExemptionUnder === null || age >= ageExemptionUnder
  })
  const homegrown = nonExempt.filter(
    (member) => member.profile.homegrownClub || member.profile.homegrownNation,
  )
  const others = nonExempt.filter(
    (member) =>
      !(member.profile.homegrownClub || member.profile.homegrownNation),
  )
  if (homegrown.length < minimumHomegrown || nonExempt.length < rosterLimit) {
    return null
  }
  const chosen = homegrown.slice(0, minimumHomegrown)
  chosen.push(...others.slice(0, rosterLimit - chosen.length))
  if (chosen.length < rosterLimit) {
    chosen.push(
      ...homegrown.slice(
        minimumHomegrown,
        minimumHomegrown + (rosterLimit - chosen.length),
      ),
    )
  }
  return chosen.length === rosterLimit ? chosen : null
}
