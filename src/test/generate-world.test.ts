import { describe, expect, it } from 'vitest'
import prngSource from '../domain/seed/prng.ts?raw'
import namesSource from '../domain/seed/names.ts?raw'
import generatorSource from '../domain/seed/generate-world.ts?raw'
import {
  FEATURED_CAMPAIGN_ID,
  FEATURED_SEED,
  GENERATOR_VERSION,
  generateWorld,
  type GeneratedWorld,
} from '../domain/seed/generate-world'
import {
  clubSchema,
  leagueSchema,
  playerSchema,
} from '../domain/validation/schemas'

const featuredInput = {
  seed: FEATURED_SEED,
  generatorVersion: GENERATOR_VERSION,
  campaignId: FEATURED_CAMPAIGN_ID,
}

function mustGenerate(input = featuredInput): GeneratedWorld {
  const result = generateWorld(input)
  if (!result.ok) throw new Error(result.message)
  return result.value
}

describe('generateWorld', () => {
  it('repeats the featured world and changes it for another seed', () => {
    const world = mustGenerate()
    expect(generateWorld(featuredInput)).toEqual({ ok: true, value: world })
    const other = mustGenerate({ ...featuredInput, seed: 'other-seed' })
    expect(other).not.toEqual(world)
    expect(other.players[0].attributes).not.toEqual(world.players[0].attributes)
  })

  it('rejects an unsupported version without affecting the featured call', () => {
    const world = mustGenerate()
    expect(generateWorld({ ...featuredInput, generatorVersion: '2' })).toEqual({
      ok: false,
      message: 'Unsupported generator version.',
    })
    expect(mustGenerate()).toEqual(world)
  })

  it('changes only ids and references when the campaign id changes', () => {
    const world = mustGenerate()
    const other = mustGenerate({ ...featuredInput, campaignId: 'other' })
    expect(world.clubs[0].id).toBe('demo-club-01')
    expect(other.clubs[0].id).toBe('other-club-01')
    expect(other.clubs[0].prestige).toBe(world.clubs[0].prestige)
    expect(other.players[0].attributes.pace).toBe(
      world.players[0].attributes.pace,
    )
    const normalizeId = (id: string) => id.replace(/^other-/, 'demo-')
    expect({
      leagues: other.leagues.map((league) => ({
        ...league,
        id: normalizeId(league.id),
        campaignId: 'demo',
      })),
      clubs: other.clubs.map((club) => ({
        ...club,
        id: normalizeId(club.id),
        campaignId: 'demo',
        leagueId: normalizeId(club.leagueId),
      })),
      players: other.players.map((player) => ({
        ...player,
        id: normalizeId(player.id),
        campaignId: 'demo',
        clubId: player.clubId === null ? null : normalizeId(player.clubId),
      })),
    }).toEqual(world)
  })

  it('builds four leagues, 72 clubs, 2,880 squad players and 120 free agents', () => {
    const world = mustGenerate()
    expect(world.leagues).toHaveLength(4)
    expect(world.clubs).toHaveLength(72)
    expect(world.players).toHaveLength(3000)
    expect(world.leagues.map((league) => league.name)).toEqual([
      'Northwater Premier',
      'Redfen Championship',
      'Calderan League',
      'Ostmark Regional',
    ])
    expect(
      world.players.filter((player) => player.clubId === null),
    ).toHaveLength(120)
    expect(world.players[0]).toMatchObject({
      id: 'demo-player-0001',
      clubId: 'demo-club-01',
    })
    expect(world.players[2880]).toMatchObject({
      id: 'demo-player-2881',
      clubId: null,
    })
    expect(world.players[2999].id).toBe('demo-player-3000')
    for (const [i, club] of world.clubs.entries()) {
      expect(
        world.players.filter((player) => player.clubId === club.id),
      ).toHaveLength(36 + (i % 9))
      expect(club.leagueId).toBe(world.leagues[Math.floor(i / 18)].id)
    }
    expect(new Set(world.clubs.map((club) => club.name)).size).toBe(72)
    expect(new Set(world.clubs.map((club) => club.shortName)).size).toBe(72)
    expect(world.clubs[0]).toMatchObject({
      name: 'Ashbridge',
      shortName: 'ASH',
    })
    expect(world.clubs[18]).toMatchObject({
      name: 'Ashdale',
      shortName: 'ASH2',
    })
  })

  it('emits fictional drafts accepted by the existing schemas after removing wages', () => {
    const world = mustGenerate()
    for (const league of world.leagues)
      expect(leagueSchema.safeParse(league).success).toBe(true)
    for (const club of world.clubs)
      expect(clubSchema.safeParse(club).success).toBe(true)
    for (const player of world.players) {
      const { weeklyWageCents, ...record } = player
      expect(playerSchema.safeParse(record).success).toBe(true)
      expect(player.birthDate).toBeNull()
      expect(player.source).toBe('fictional')
      expect(player.isNewgen).toBe(false)
      expect(player.externalSourceId).toBeNull()
      expect(player.ageReferenceSeasonOrdinal).toBe(1)
      expect(player.reportedAge).toBeGreaterThanOrEqual(16)
      expect(player.reportedAge).toBeLessThanOrEqual(38)
      for (const cents of [player.marketValueCents, weeklyWageCents]) {
        expect(Number.isInteger(cents)).toBe(true)
        expect(cents).toBeGreaterThanOrEqual(0)
      }
      expect(weeklyWageCents % 50_000).toBe(0)
      expect(weeklyWageCents).toBeGreaterThanOrEqual(50_000)
      const steps =
        player.reportedAge <= 21 ? 16 : player.reportedAge >= 32 ? 40 : 157
      expect(weeklyWageCents).toBeLessThanOrEqual(steps * 50_000)
    }
  })

  it('keeps seed modules free of ambient randomness and clocks', () => {
    for (const source of [prngSource, namesSource, generatorSource]) {
      expect(source).not.toMatch(/Math\.random|Date\.now|new Date/)
    }
  })
})
