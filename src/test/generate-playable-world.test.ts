import { describe, expect, it } from 'vitest'
import abilitySource from '../domain/player/ability.ts?raw'
import generatorSource from '../domain/seed/generate-playable-world.ts?raw'
import settingsSource from '../domain/seed/playable-world-settings.ts?raw'
import validationSource from '../domain/seed/playable-world-validation.ts?raw'
import { formationSlots, type FormationId } from '../domain/graphics/pitch'
import { dateOnlySchema } from '../domain/models/dates'
import { wageCommitment } from '../domain/finance/wages'
import {
  attributeNames,
  goalkeeperRating,
  roleAbility,
  type AttributeRatings,
} from '../domain/player/ability'
import { evaluateAction } from '../domain/rules/evaluate-action'
import { constitutionPreset } from '../domain/rules/presets'
import type { PolicyAction } from '../domain/rules/types'
import {
  generatePlayableWorld,
  identityTooLongMessage,
  invalidCampaignIdMessage,
  invalidSeedMessage,
  invalidStartYearMessage,
  PLAYABLE_GENERATOR_VERSION,
  unsupportedGeneratorVersionMessage,
  type PlayableWorld,
  type PlayableWorldInput,
} from '../domain/seed/generate-playable-world'
import {
  ATTRIBUTE_DRAW_SPAN,
  attributeWindows,
  marketValueCents,
  PLAYABLE_CAMPAIGN_ID_MAX,
  persistenceSuffix,
  PLAYABLE_PLAYER_COUNT,
  recruitmentMarginCents,
  strictWageCapCents,
  transferBalanceCents,
  wageBudgetWeeklyCents,
  weeklyWageCents,
} from '../domain/seed/playable-world-settings'
import { constitutionSchema, type Player } from '../domain/validation/schemas'
import type { PlayerSimulationState } from '../domain/simulation/schemas'
import { limits } from '../domain/validation/limits'

const featured: PlayableWorldInput = {
  seed: 'playable-world-v2',
  generatorVersion: PLAYABLE_GENERATOR_VERSION,
  campaignId: 'sample',
  startYear: 2026,
}

const formations = [
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '3-5-2',
] as const satisfies readonly FormationId[]

function mustGenerate(input: PlayableWorldInput = featured): PlayableWorld {
  const result = generatePlayableWorld(input)
  if (!result.ok) throw new Error(result.message)
  return result.value
}

function ratingsOf(player: Player): AttributeRatings {
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
    throw new Error(`${player.id} is missing an attribute.`)
  }
  return { pace, finishing, passing, dribbling, defending, physical }
}

function chooseRegistration(
  members: readonly {
    player: Player
    profile: PlayerSimulationState
  }[],
  rosterLimit: number,
  minimumHomegrown: number,
) {
  const nonExempt = members.filter(
    (member) => (member.player.reportedAge ?? -1) >= 21,
  )
  const homegrown = nonExempt.filter(
    (member) => member.profile.homegrownClub || member.profile.homegrownNation,
  )
  const others = nonExempt.filter(
    (member) =>
      !(member.profile.homegrownClub || member.profile.homegrownNation),
  )
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

function expectFeasible(world: PlayableWorld, startYear: number) {
  expect(Object.keys(world).sort()).toEqual([
    'clubSimulationStates',
    'clubs',
    'contracts',
    'leagues',
    'playerSimulationStates',
    'players',
  ])
  expect(world.leagues).toHaveLength(4)
  expect(world.clubs).toHaveLength(72)
  expect(world.players).toHaveLength(3000)
  expect(world.contracts).toHaveLength(2880)
  expect(world.players.filter((player) => player.clubId === null)).toHaveLength(
    120,
  )
  const profiles = new Map(
    world.playerSimulationStates.map((profile) => [profile.playerId, profile]),
  )
  const contracts = new Map(
    world.contracts.map((contract) => [contract.playerId, contract]),
  )
  expect(contracts.size).toBe(2880)
  for (const player of world.players) {
    const profile = profiles.get(player.id)
    const contract = contracts.get(player.id) ?? null
    const ratings = ratingsOf(player)
    const ability = roleAbility(ratings, player.positionGroup)
    expect(profile).toMatchObject({
      fitness: 100,
      injuryUntilDate: null,
      suspensionMatches: 0,
      status: 'active',
    })
    expect(profile?.sharpness).toBeGreaterThanOrEqual(70)
    expect(profile?.sharpness).toBeLessThanOrEqual(95)
    expect(player.birthDate).toBeNull()
    expect(player.source).toBe('fictional')
    expect(player.isNewgen).toBe(false)
    expect(player.potential).toBeGreaterThanOrEqual(ability)
    expect(player.marketValueCents).toBe(
      marketValueCents({
        age: player.reportedAge ?? 0,
        roleAbility: ability,
        potential: player.potential ?? ability,
      }),
    )
    if (player.positionGroup === 'GK') {
      expect(profile?.goalkeeping).toBe(goalkeeperRating(ratings))
    } else {
      expect(profile?.goalkeeping).toBeNull()
    }
    if (player.clubId === null) {
      expect(contract).toBeNull()
      expect(profile).toMatchObject({
        homegrownClub: false,
        homegrownNation: false,
      })
    } else {
      expect(contract).toMatchObject({
        clubId: player.clubId,
        status: 'active',
        startsOn: `${startYear}-07-01`,
      })
      expect(contract?.weeklyWageCents).toEqual(expect.any(Number))
      expect(contract?.squadTier).toEqual(expect.any(String))
      expect(
        contract?.expiresOn && contract.expiresOn >= `${startYear + 1}-06-30`,
      ).toBe(true)
      expect(contract?.expiresOn?.endsWith('-06-30')).toBe(true)
    }
  }
  const constitutions = (['balanced', 'strict'] as const).map((name) => {
    const rules = constitutionPreset(name)
    const quota = rules.find((rule) => rule.id === 'REGISTRATION_QUOTA')
    if (!quota || quota.id !== 'REGISTRATION_QUOTA') {
      throw new Error('Missing registration quota.')
    }
    return { name, quota }
  })
  for (const [index, club] of world.clubs.entries()) {
    const squad = world.players.filter((player) => player.clubId === club.id)
    expect(squad).toHaveLength(36 + (index % 9))
    expect(
      squad.filter((player) => player.positionGroup === 'GK').length,
    ).toBeGreaterThanOrEqual(2)
    const state = world.clubSimulationStates[index]
    const commitment = wageCommitment(world.contracts, club.id)
    expect(commitment.unknownCount).toBe(0)
    expect(state?.transferBalanceCents).toBe(
      transferBalanceCents(club.prestige),
    )
    expect(state?.wageBudgetWeeklyCents).toBeGreaterThanOrEqual(
      commitment.knownCents + recruitmentMarginCents(commitment.knownCents),
    )
    expect(state?.simulationKey).toMatch(/^club:\d{2}$/)
    for (const formation of formations) {
      const available = [...squad]
      for (const slot of formationSlots(formation)) {
        const slotIndex = available.findIndex(
          (player) => player.positionGroup === slot.group,
        )
        expect(slotIndex).toBeGreaterThanOrEqual(0)
        available.splice(slotIndex, 1)
      }
      expect(available.length).toBeGreaterThanOrEqual(7)
      expect(available.some((player) => player.positionGroup === 'GK')).toBe(
        true,
      )
    }
    const members = squad.flatMap((player) => {
      const profile = profiles.get(player.id)
      return profile ? [{ player, profile }] : []
    })
    const seniors = members.filter(
      (member) => (member.player.reportedAge ?? -1) >= 21,
    )
    const homegrown = seniors.filter(
      (member) =>
        member.profile.homegrownClub || member.profile.homegrownNation,
    )
    expect(seniors.length).toBeGreaterThanOrEqual(25)
    expect(homegrown.length).toBeGreaterThanOrEqual(10)
    for (const { name, quota } of constitutions) {
      const chosen = chooseRegistration(
        members,
        quota.rosterLimit,
        quota.minimumHomegrown,
      )
      expect(chosen, `${club.name} ${name}`).not.toBeNull()
      const action: PolicyAction = {
        type: 'registration',
        competitionKey: quota.competitionKey,
        players: (chosen ?? []).map((member) => ({
          playerId: member.player.id,
          status: 'registered',
          homegrownClub: member.profile.homegrownClub,
          homegrownNation: member.profile.homegrownNation,
          ageExempt: false,
          age: member.player.reportedAge,
        })),
      }
      const constitution = constitutionSchema.parse({
        id: 'rule-check',
        campaignId: world.leagues[0]?.campaignId ?? featured.campaignId,
        version: 1,
        rules: constitutionPreset(name),
        updatedAt: `${startYear}-07-01T00:00:00.000Z`,
      })
      expect(
        evaluateAction(
          action,
          { revision: 0, remainingCapacityCents: null },
          constitution,
          dateOnlySchema.parse(`${startYear}-07-01`),
        ).allowed,
      ).toBe(true)
    }
  }
}

function remapCampaign(world: PlayableWorld, from: string, to: string) {
  const id = (value: string) => {
    const prefix = `${from}-`
    if (!value.startsWith(prefix)) throw new Error(value)
    return `${to}-${value.slice(prefix.length)}`
  }
  return {
    leagues: world.leagues.map((league) => ({
      ...league,
      id: id(league.id),
      campaignId: to,
    })),
    clubs: world.clubs.map((club) => ({
      ...club,
      id: id(club.id),
      campaignId: to,
      leagueId: id(club.leagueId ?? ''),
    })),
    players: world.players.map((player) => ({
      ...player,
      id: id(player.id),
      campaignId: to,
      clubId: player.clubId === null ? null : id(player.clubId),
    })),
    contracts: world.contracts.map((contract) => ({
      ...contract,
      id: id(contract.id),
      campaignId: to,
      playerId: id(contract.playerId),
      clubId: id(contract.clubId),
    })),
    clubSimulationStates: world.clubSimulationStates.map((state) => ({
      ...state,
      id: id(state.id),
      campaignId: to,
      clubId: id(state.clubId),
    })),
    playerSimulationStates: world.playerSimulationStates.map((state) => ({
      ...state,
      id: id(state.id),
      campaignId: to,
      playerId: id(state.playerId),
    })),
  }
}

function shiftYear(world: PlayableWorld, delta: number) {
  const shift = (date: string) =>
    `${Number(date.slice(0, 4)) + delta}${date.slice(4)}`
  return {
    ...world,
    contracts: world.contracts.map((contract) => ({
      ...contract,
      startsOn: contract.startsOn === null ? null : shift(contract.startsOn),
      expiresOn: contract.expiresOn === null ? null : shift(contract.expiresOn),
    })),
  }
}

describe('generatePlayableWorld', () => {
  it('builds a feasible world and repeats it for the same inputs', () => {
    const world = mustGenerate()
    expect(generatePlayableWorld(featured)).toEqual({ ok: true, value: world })
    expect(world.leagues.map((league) => league.name)).toEqual([
      'Northwater Premier',
      'Redfen Championship',
      'Calderan League',
      'Ostmark Regional',
    ])
    expect(world.clubs[0]).toMatchObject({
      id: 'sample-club-01',
      name: 'Ashbridge',
      shortName: 'ASH',
    })
    expect(world.clubs[18]).toMatchObject({
      name: 'Ashdale',
      shortName: 'ASH2',
    })
    expect(world.players[0]).toMatchObject({
      id: 'sample-player-0001',
      clubId: 'sample-club-01',
      positionGroup: 'GK',
      positions: ['GK'],
      source: 'fictional',
      birthDate: null,
    })
    expect(world.players[2879].clubId).not.toBeNull()
    expect(world.players[2880]).toMatchObject({
      id: 'sample-player-2881',
      clubId: null,
    })
    expect(world.playerSimulationStates[0].simulationKey).toBe('player:0001')
    expect(world.playerSimulationStates[2999].simulationKey).toBe('player:3000')
    expect(world.contracts[0]).toMatchObject({
      playerId: 'sample-player-0001',
      startsOn: '2026-07-01',
      status: 'active',
    })
    expectFeasible(world, 2026)
  }, 30_000)

  it('changes persistence ids only when the campaign id changes', () => {
    const world = mustGenerate()
    const other = mustGenerate({ ...featured, campaignId: 'other-save' })
    expect(other.players[0].id).toBe('other-save-player-0001')
    expect(other.playerSimulationStates[0].simulationKey).toBe('player:0001')
    expect(remapCampaign(other, 'other-save', 'sample')).toEqual(world)
  }, 30_000)

  it('changes contract dates only when the start year changes', () => {
    const world = mustGenerate()
    const later = mustGenerate({ ...featured, startYear: 2027 })
    expect(later.contracts[0].startsOn).toBe('2027-07-01')
    expect(later.players[0].attributes).toEqual(world.players[0].attributes)
    expect(shiftYear(later, -1)).toEqual(world)
  }, 30_000)

  it('keeps several other seeds playable and distinct', () => {
    const worlds = [
      'playable-seed-a',
      'playable-seed-b',
      'playable-seed-c',
    ].map((seed) => mustGenerate({ ...featured, seed }))
    for (const world of worlds) expectFeasible(world, 2026)
    const signatures = worlds.map((world) =>
      world.players.map((player) => player.potential).join(','),
    )
    expect(new Set(signatures).size).toBe(3)
  }, 30_000)

  it('accepts the longest campaign id and seed that still fit', () => {
    const campaignId = 'c'.repeat(PLAYABLE_CAMPAIGN_ID_MAX)
    expect(
      `${campaignId}-${persistenceSuffix('player-state', PLAYABLE_PLAYER_COUNT)}`
        .length,
    ).toBe(limits.idMax)
    const world = mustGenerate({
      ...featured,
      campaignId,
      seed: 's'.repeat(limits.seedMax),
    })
    expect(world.playerSimulationStates[2999].id).toHaveLength(limits.idMax)
    expectFeasible(world, 2026)
  }, 30_000)
})

describe('playable world formulas', () => {
  it('moves value and wages with ability, age, and potential in whole cents', () => {
    for (const group of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      for (const name of attributeNames) {
        const [floor, ceiling] = attributeWindows[group][name]
        expect(ceiling - floor).toBeGreaterThanOrEqual(ATTRIBUTE_DRAW_SPAN - 1)
      }
    }
    expect(marketValueCents({ age: 27, roleAbility: 0, potential: 0 })).toBe(0)
    expect(
      marketValueCents({ age: 27, roleAbility: 40, potential: 40 }),
    ).toBeLessThan(
      marketValueCents({ age: 27, roleAbility: 70, potential: 70 }),
    )
    expect(
      marketValueCents({ age: 27, roleAbility: 50, potential: 50 }),
    ).toBeLessThan(
      marketValueCents({ age: 27, roleAbility: 50, potential: 70 }),
    )
    expect(
      marketValueCents({ age: 37, roleAbility: 60, potential: 70 }),
    ).toBeLessThan(
      marketValueCents({ age: 27, roleAbility: 60, potential: 70 }),
    )
    expect(
      Number.isInteger(
        marketValueCents({ age: 18, roleAbility: 63, potential: 81 }),
      ),
    ).toBe(true)
    expect(weeklyWageCents({ age: 27, roleAbility: 0, squadTier: 'key' })).toBe(
      0,
    )
    expect(
      weeklyWageCents({ age: 27, roleAbility: 100, squadTier: 'key' }),
    ).toBe(strictWageCapCents.key)
    expect(
      weeklyWageCents({ age: 16, roleAbility: 90, squadTier: 'youth' }),
    ).toBeLessThanOrEqual(strictWageCapCents.youth)
    expect(
      weeklyWageCents({ age: 30, roleAbility: 80, squadTier: 'rotation' }),
    ).toBeLessThanOrEqual(strictWageCapCents.rotation)
    expect(wageBudgetWeeklyCents(0)).toBe(100_000)
    expect(wageBudgetWeeklyCents(1_000_000)).toBe(1_200_000)
    expect(transferBalanceCents(40)).toBe(100_000_000 + 40 * 4_000_000)
    const allocation = constitutionPreset('balanced').find(
      (rule) => rule.id === 'SELL_TO_BUY',
    )
    expect(allocation?.id).toBe('SELL_TO_BUY')
    if (allocation?.id === 'SELL_TO_BUY') {
      expect(transferBalanceCents(40)).not.toBe(
        allocation.initialAllocationCents,
      )
    }
  })
})

describe('playable world input failures', () => {
  it('rejects an unsupported version, a bad seed, a bad year, and a long id', () => {
    const world = mustGenerate()
    for (const generatorVersion of ['1', '3', '']) {
      expect(generatePlayableWorld({ ...featured, generatorVersion })).toEqual({
        ok: false,
        message: unsupportedGeneratorVersionMessage,
      })
    }
    for (const seed of ['', ' seed', 's'.repeat(limits.seedMax + 1)]) {
      expect(generatePlayableWorld({ ...featured, seed })).toEqual({
        ok: false,
        message: invalidSeedMessage,
      })
    }
    for (const startYear of [1899, 2199, 2026.5, Number.NaN]) {
      expect(generatePlayableWorld({ ...featured, startYear })).toEqual({
        ok: false,
        message: invalidStartYearMessage,
      })
    }
    expect(
      generatePlayableWorld({ ...featured, campaignId: 'bad id' }),
    ).toEqual({ ok: false, message: invalidCampaignIdMessage })
    expect(
      generatePlayableWorld({ ...featured, campaignId: 'a'.repeat(65) }),
    ).toEqual({ ok: false, message: invalidCampaignIdMessage })
    expect(
      generatePlayableWorld({ ...featured, campaignId: 'a'.repeat(49) }),
    ).toEqual({ ok: false, message: identityTooLongMessage })
    expect(mustGenerate()).toEqual(world)
  }, 30_000)

  it('keeps the generator free of ambient randomness and clocks', () => {
    for (const source of [
      abilitySource,
      generatorSource,
      settingsSource,
      validationSource,
    ]) {
      expect(source).not.toMatch(/Math\.random|Date\.now|new Date/)
    }
  })
})
