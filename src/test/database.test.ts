import { afterEach, describe, expect, it } from 'vitest'
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  TouchlineDatabase,
  deleteDatabaseForTests,
  getDatabase,
  parseStored,
} from '../data/db'
import { PersistenceError } from '../data/errors'
import { schemaV1 } from '../data/migrations/v1'
import { schemaV2 } from '../data/migrations/v2'
import {
  entityIdSchema,
  playerSchema,
  type Player,
} from '../domain/validation/schemas'

const testDatabaseName = 'touchline-os-test'
const otherDatabaseName = 'touchline-os-other'

const playerRow = {
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

afterEach(async () => {
  await deleteDatabaseForTests(testDatabaseName)
  await deleteDatabaseForTests(otherDatabaseName)
})

describe('database constants', () => {
  it('names the production database and version', () => {
    expect(DATABASE_NAME).toBe('touchline-os')
    expect(DATABASE_VERSION).toBe(2)
    expect(testDatabaseName).not.toBe(DATABASE_NAME)
  })
})

describe('TouchlineDatabase', () => {
  it('opens version 2 and preserves the frozen version 1 declarations', async () => {
    const database = new TouchlineDatabase(testDatabaseName)
    try {
      await database.open()
      expect(database.verno).toBe(2)
      expect(database.tables.map((table) => table.name).sort()).toEqual(
        Object.keys(schemaV2).sort(),
      )
      expect(schemaV1).toEqual({
        campaigns: 'id, kind, managedClubId, activeSeasonId, updatedAt',
        seasons: 'id, campaignId, &[campaignId+ordinal], [campaignId+status]',
        leagues: 'id, campaignId',
        clubs: 'id, campaignId, [campaignId+leagueId]',
        players:
          'id, campaignId, [campaignId+clubId], [campaignId+positionGroup], [campaignId+name]',
        contracts:
          'id, campaignId, [campaignId+playerId], [campaignId+clubId], [campaignId+status]',
        constitutions: 'id, campaignId, &[campaignId+version]',
        ledgerEntries:
          'id, campaignId, [campaignId+seasonId], [campaignId+clubId], sourceActionId, reversesEntryId',
        transfers:
          'id, campaignId, [campaignId+seasonId], [campaignId+playerId], sourceActionId',
        offers:
          'id, campaignId, [campaignId+seasonId], [campaignId+playerId], [campaignId+status]',
        lineups: 'id, campaignId, [campaignId+seasonId]',
        registrations:
          'id, campaignId, &[campaignId+seasonId+competitionKey+playerId], [campaignId+competitionKey]',
        matchRecords:
          'id, campaignId, [campaignId+seasonId], [campaignId+date]',
        appearances:
          'id, campaignId, &[matchId+playerId], [campaignId+seasonId], [campaignId+playerId]',
        shortlistItems: 'id, campaignId, &[campaignId+playerId]',
        scoutingReports:
          'id, campaignId, [campaignId+playerId], [campaignId+seasonId]',
        developmentPlans: 'id, campaignId, &[campaignId+playerId+seasonId]',
        auditEvents: 'id, campaignId, &actionId, [campaignId+createdAt]',
        importReceipts: 'id, campaignId, importedAt',
      })
    } finally {
      database.close()
    }

    const reopened = new TouchlineDatabase(testDatabaseName)
    try {
      await reopened.open()
      expect(reopened.verno).toBe(2)
    } finally {
      reopened.close()
    }
  })
})

describe('getDatabase', () => {
  it('returns the same instance until the cache is deleted', async () => {
    const first = getDatabase(testDatabaseName)
    const second = getDatabase(testDatabaseName)
    expect(second).toBe(first)

    await deleteDatabaseForTests(testDatabaseName)

    const third = getDatabase(testDatabaseName)
    expect(third).not.toBe(first)
    try {
      await third.open()
      expect(third.verno).toBe(2)
    } finally {
      third.close()
    }
  })

  it('keeps a different instance for each name', () => {
    expect(getDatabase(otherDatabaseName)).not.toBe(
      getDatabase(testDatabaseName),
    )
  })
})

describe('parseStored', () => {
  it('returns a player with an unknown market value', () => {
    const player = parseStored(playerSchema, playerRow)
    expect(player.source).toBe('fictional')
    expect(player.marketValueCents).toBeNull()
  })

  it('throws CORRUPT for a stored player without source', async () => {
    const database = new TouchlineDatabase(testDatabaseName)
    try {
      const { source, ...withoutSource } = playerRow
      void source
      await database.players.add(withoutSource as unknown as Player)
      const stored = await database.players.get(
        entityIdSchema.parse('player-a'),
      )
      expect(stored).toMatchObject({ id: 'player-a' })

      let thrown: unknown
      try {
        parseStored(playerSchema, stored)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(PersistenceError)
      if (!(thrown instanceof PersistenceError)) return
      expect(thrown.code).toBe('CORRUPT')
    } finally {
      database.close()
    }
  })
})
