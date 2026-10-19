import { afterEach, describe, expect, it } from 'vitest'
import { getDatabase, deleteDatabaseForTests } from '../data/db'
import { PersistenceError } from '../data/errors'
import {
  insertCampaign,
  listCampaigns,
  getCampaign,
  updateCampaign,
} from '../data/repositories/campaigns'
import { insertClub, listClubs, getClub } from '../data/repositories/clubs'
import { insertLeague } from '../data/repositories/leagues'
import {
  insertPlayer,
  getPlayer,
  listPlayers,
  listPlayersByClub,
} from '../data/repositories/players'
import {
  insertSeason,
  listSeasons,
  getSeason,
  getActiveSeason,
} from '../data/repositories/seasons'
import { runInTransaction } from '../data/transactions/run-in-transaction'
import {
  entityIdSchema,
  leagueSchema,
  playerSchema,
  seasonSchema,
  clubSchema,
  campaignSchema,
  type Player,
  type Season,
} from '../domain/validation/schemas'
import {
  campaignA,
  campaignB,
  clubA,
  clubB,
  seasonA,
  seasonB,
} from './fixtures/campaign'
import type { TouchlineDatabase } from '../data/db'

const testDatabaseName = 'touchline-os-test'

const playerInput = {
  id: 'player-a',
  campaignId: 'campaign-a',
  clubId: 'club-a',
  name: 'Amina Cole',
  positionGroup: 'MID' as const,
  positions: ['CM'] as const,
  nationalityCode: null,
  birthDate: null,
  reportedAge: 18,
  ageReferenceSeasonOrdinal: 1,
  marketValueCents: null,
  attributes: { passing: 70 },
  potential: null,
  source: 'fictional' as const,
  externalSourceId: null,
  isNewgen: false,
}

const leagueA = leagueSchema.parse({
  id: 'league-a',
  campaignId: 'campaign-a',
  name: 'North Counties',
  countryCode: 'GB',
  tier: 1,
})

const leagueB = leagueSchema.parse({
  id: 'league-b',
  campaignId: 'campaign-b',
  name: 'South Ridges',
  countryCode: 'GB',
  tier: 1,
})

afterEach(async () => {
  await deleteDatabaseForTests(testDatabaseName)
})

function openDatabase(): TouchlineDatabase {
  return getDatabase(testDatabaseName)
}

async function seedWorld(database: TouchlineDatabase): Promise<void> {
  await runInTransaction(
    database,
    [database.campaigns, database.clubs, database.seasons],
    async () => {
      await insertCampaign(database, campaignA)
      await insertCampaign(database, campaignB)
      await insertClub(database, campaignA.id, clubA)
      await insertClub(database, campaignB.id, clubB)
      await insertSeason(database, campaignA.id, seasonA)
      await insertSeason(database, campaignB.id, seasonB)
    },
  )
}

function buildSeason(
  id: string,
  ordinal: number,
  status: 'active' | 'closed',
): Season {
  return seasonSchema.parse({
    id,
    campaignId: campaignA.id,
    label: 'Season 1',
    ordinal,
    status,
    startDate: '2026-10-19',
    endDate: null,
    openedAt: '2026-10-19T00:00:00.000Z',
    closedAt: null,
  })
}

async function expectCode(
  promise: Promise<unknown>,
  code: PersistenceError['code'],
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(PersistenceError)
  await expect(promise).rejects.toMatchObject({ code })
}

describe('repositories', () => {
  it('keeps two campaigns isolated and does not write an audit row', async () => {
    const database = openDatabase()
    await seedWorld(database)

    const campaigns = await listCampaigns(database)
    expect(campaigns.map((campaign) => campaign.id).sort()).toEqual([
      campaignA.id,
      campaignB.id,
    ])
    const clubs = await listClubs(database, campaignA.id)
    expect(clubs.map((club) => club.id)).toEqual([clubA.id])
    const seasons = await listSeasons(database, campaignB.id)
    expect(seasons.map((season) => season.id)).toEqual([seasonB.id])
    expect((await getCampaign(database, campaignA.id))?.revision).toBe(0)
    expect(await database.auditEvents.toArray()).toEqual([])
  })

  it('returns a player only for its campaign and keeps an unknown value', async () => {
    const database = openDatabase()
    await seedWorld(database)
    const player = playerSchema.parse(playerInput)
    await runInTransaction(database, [database.players, database.clubs], () =>
      insertPlayer(database, campaignA.id, player),
    )

    const stored = await getPlayer(database, campaignA.id, player.id)
    expect(stored?.marketValueCents).toBeNull()
    expect(stored?.name).toBe('Amina Cole')
    expect(await getPlayer(database, campaignB.id, player.id)).toBeUndefined()
    expect(await listPlayers(database, campaignB.id)).toEqual([])
    expect(await database.players.get(player.id)).toBeDefined()
  })

  it('rejects a repeated player id without overwriting the row', async () => {
    const database = openDatabase()
    await seedWorld(database)
    const player = playerSchema.parse(playerInput)
    await runInTransaction(database, [database.players, database.clubs], () =>
      insertPlayer(database, campaignA.id, player),
    )

    const duplicate = runInTransaction(
      database,
      [database.players, database.clubs],
      () => insertPlayer(database, campaignA.id, player),
    )
    await expectCode(duplicate, 'DUPLICATE')

    const players = await listPlayers(database, campaignA.id)
    expect(players).toHaveLength(1)
    expect(players[0]?.name).toBe('Amina Cole')
  })

  it('allows a closed season and rejects a second active season or ordinal', async () => {
    const database = openDatabase()
    await seedWorld(database)

    await runInTransaction(database, [database.seasons], () =>
      insertSeason(
        database,
        campaignA.id,
        buildSeason('season-a2', 2, 'closed'),
      ),
    )
    const stored = await listSeasons(database, campaignA.id)
    expect(stored.map((season) => season.id).sort()).toEqual([
      'season-a',
      'season-a2',
    ])

    const secondActive = runInTransaction(database, [database.seasons], () =>
      insertSeason(
        database,
        campaignA.id,
        buildSeason('season-a3', 3, 'active'),
      ),
    )
    await expectCode(secondActive, 'SCOPE')
    expect((await getActiveSeason(database, campaignA.id))?.id).toBe(seasonA.id)

    const repeatedOrdinal = runInTransaction(database, [database.seasons], () =>
      insertSeason(
        database,
        campaignA.id,
        buildSeason('season-a4', 1, 'closed'),
      ),
    )
    await expectCode(repeatedOrdinal, 'DUPLICATE')
    const after = await listSeasons(database, campaignA.id)
    expect(after.find((season) => season.ordinal === 1)?.id).toBe(seasonA.id)
  })

  it('rejects a player whose club belongs to the other campaign', async () => {
    const database = openDatabase()
    await seedWorld(database)
    const player = playerSchema.parse({
      ...playerInput,
      id: 'player-cross',
      clubId: 'club-b',
    })

    const attempt = runInTransaction(
      database,
      [database.players, database.clubs],
      () => insertPlayer(database, campaignA.id, player),
    )
    await expectCode(attempt, 'SCOPE')

    const players = await listPlayers(database, campaignA.id)
    expect(players.map((row) => row.id)).not.toContain(player.id)
    expect(
      await database.players.get(entityIdSchema.parse('player-cross')),
    ).toBeUndefined()
  })

  it('stores a free agent outside the club list', async () => {
    const database = openDatabase()
    await seedWorld(database)
    const player = playerSchema.parse({
      ...playerInput,
      id: 'player-free',
      clubId: null,
    })
    await runInTransaction(database, [database.players], () =>
      insertPlayer(database, campaignA.id, player),
    )

    const byClub = await listPlayersByClub(database, campaignA.id, clubA.id)
    expect(byClub.map((row) => row.id)).not.toContain(player.id)
    expect(await getPlayer(database, campaignA.id, player.id)).toMatchObject({
      id: player.id,
      clubId: null,
    })
  })

  it('rejects a club whose league belongs to the other campaign', async () => {
    const database = openDatabase()
    await runInTransaction(database, [database.leagues], async () => {
      await insertLeague(database, campaignA.id, leagueA)
      await insertLeague(database, campaignB.id, leagueB)
    })
    const linked = clubSchema.parse({
      ...clubA,
      id: 'club-linked',
      leagueId: leagueA.id,
    })
    await runInTransaction(database, [database.clubs, database.leagues], () =>
      insertClub(database, campaignA.id, linked),
    )
    expect(await getClub(database, campaignA.id, linked.id)).toMatchObject({
      id: linked.id,
    })

    const foreign = clubSchema.parse({
      ...clubA,
      id: 'club-foreign',
      leagueId: leagueB.id,
    })
    const attempt = runInTransaction(
      database,
      [database.clubs, database.leagues],
      () => insertClub(database, campaignA.id, foreign),
    )
    await expectCode(attempt, 'SCOPE')
    expect(
      await getClub(
        database,
        campaignA.id,
        entityIdSchema.parse('club-foreign'),
      ),
    ).toBeUndefined()
  })

  it('rejects a season whose campaign does not match the scope', async () => {
    const database = openDatabase()
    const mismatch = seasonSchema.parse({
      ...seasonB,
      id: 'season-mismatch',
    })
    const attempt = runInTransaction(database, [database.seasons], () =>
      insertSeason(database, campaignA.id, mismatch),
    )
    await expectCode(attempt, 'SCOPE')
    expect(
      await database.seasons.get(entityIdSchema.parse('season-mismatch')),
    ).toBeUndefined()
  })

  it('hides a club and a season that belong to the other campaign', async () => {
    const database = openDatabase()
    await seedWorld(database)
    expect(await getClub(database, campaignB.id, clubA.id)).toBeUndefined()
    expect(await getSeason(database, campaignA.id, seasonB.id)).toBeUndefined()
  })

  it('updates an existing campaign without inserting or changing revision', async () => {
    const database = openDatabase()
    await runInTransaction(database, [database.campaigns], () =>
      insertCampaign(database, campaignB),
    )
    const before = await listCampaigns(database)
    const missing = campaignSchema.parse({
      ...campaignA,
      id: 'campaign-missing',
    })
    await runInTransaction(database, [database.campaigns], () =>
      updateCampaign(database, missing),
    )
    expect(await listCampaigns(database)).toEqual(before)

    await runInTransaction(database, [database.campaigns], () =>
      insertCampaign(database, campaignA),
    )
    const renamed = campaignSchema.parse({
      ...campaignA,
      name: 'Riverside Athletic',
    })
    await runInTransaction(database, [database.campaigns], () =>
      updateCampaign(database, renamed),
    )
    const stored = await getCampaign(database, campaignA.id)
    expect(stored?.name).toBe('Riverside Athletic')
    expect(stored?.revision).toBe(0)
    expect(await database.auditEvents.toArray()).toEqual([])
  })

  it('fails the player read and the campaign list when one row is corrupt', async () => {
    const database = openDatabase()
    await seedWorld(database)
    const player = playerSchema.parse(playerInput)
    const { source, ...withoutSource } = { ...playerInput, id: 'player-bad' }
    void source
    await database.players.add(withoutSource as unknown as Player)
    await runInTransaction(database, [database.players, database.clubs], () =>
      insertPlayer(database, campaignA.id, player),
    )

    await expectCode(
      getPlayer(database, campaignA.id, entityIdSchema.parse('player-bad')),
      'CORRUPT',
    )
    await expectCode(listPlayers(database, campaignA.id), 'CORRUPT')
  })
})
