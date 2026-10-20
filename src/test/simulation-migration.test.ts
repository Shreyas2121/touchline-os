import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { TouchlineDatabase } from '../data/db'
import { schemaV1 } from '../data/migrations/v1'
import { schemaV2 } from '../data/migrations/v2'
import { getCampaign } from '../data/repositories/campaigns'
import { campaignA, clubA, seasonA } from './fixtures/campaign'
import { simulationPlayer } from './fixtures/simulation'

const name = 'touchline-simulation-migration-test'

afterEach(async () => {
  await Dexie.delete(name)
})

describe('simulation migration', () => {
  it('really upgrades a linked v1 save, changing only campaign modes', async () => {
    const old = new Dexie(name)
    old.version(1).stores(schemaV1)
    const { mode, rulesMode, ...legacyCampaign } = campaignA
    void mode
    void rulesMode
    const rows: Record<string, unknown[]> = {
      campaigns: [legacyCampaign],
      seasons: [seasonA],
      clubs: [clubA],
      players: [simulationPlayer],
      contracts: [
        {
          id: 'contract-a',
          campaignId: campaignA.id,
          playerId: simulationPlayer.id,
          clubId: clubA.id,
          weeklyWageCents: null,
          squadTier: null,
          startsOn: null,
          expiresOn: null,
          status: 'active',
        },
      ],
      ledgerEntries: [
        {
          id: 'ledger-a',
          campaignId: campaignA.id,
          seasonId: seasonA.id,
          clubId: clubA.id,
          kind: 'initial_allocation',
          amountCents: 150_000,
          effectiveOn: '2026-10-19',
          sourceActionId: 'action-a',
          reversesEntryId: null,
          note: null,
        },
      ],
      auditEvents: [
        {
          id: 'audit-a',
          campaignId: campaignA.id,
          seasonId: seasonA.id,
          actionId: 'action-a',
          actionType: 'campaign.create',
          createdAt: campaignA.createdAt,
          summary: 'Created legacy campaign',
          payload: { original: true, nullable: null },
        },
      ],
      matchRecords: [
        {
          id: 'match-a',
          campaignId: campaignA.id,
          seasonId: seasonA.id,
          date: '2026-10-19',
          opponent: 'Calder Reserve',
          homeAway: 'home',
          goalsFor: 2,
          goalsAgainst: 1,
          competition: null,
          notes: null,
          xgFor: null,
          xgAgainst: null,
        },
      ],
      appearances: [
        {
          id: 'appearance-a',
          campaignId: campaignA.id,
          seasonId: seasonA.id,
          matchId: 'match-a',
          playerId: simulationPlayer.id,
          minutes: 90,
          started: true,
          goals: null,
          assists: null,
          rating: null,
        },
      ],
    }
    try {
      await old.open()
      await old.transaction('rw', old.tables, async () => {
        for (const [table, values] of Object.entries(rows))
          await old.table(table).bulkAdd(values)
      })
      expect(old.verno).toBe(1)
    } finally {
      old.close()
    }

    const current = new TouchlineDatabase(name)
    try {
      await current.open()
      expect(current.verno).toBe(2)
      for (const table of current.tables) {
        const expected =
          table.name === 'campaigns'
            ? [{ ...legacyCampaign, mode: 'legacy', rulesMode: 'sandbox' }]
            : (rows[table.name] ?? [])
        expect(await table.toArray(), table.name).toEqual(expected)
      }
      expect(await getCampaign(current, campaignA.id)).toMatchObject({
        mode: 'legacy',
        rulesMode: 'sandbox',
        managedClubId: clubA.id,
      })
    } finally {
      current.close()
    }

    const reopened = new TouchlineDatabase(name)
    try {
      await reopened.open()
      expect(await reopened.campaigns.get(campaignA.id)).toEqual({
        ...legacyCampaign,
        mode: 'legacy',
        rulesMode: 'sandbox',
      })
      expect(await reopened.simulationStates.count()).toBe(0)
    } finally {
      reopened.close()
    }
  })

  it('creates every old and new table with the old indexes preserved, and reopens idempotently', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const database = new TouchlineDatabase(name)
      try {
        await database.open()
        expect(database.verno).toBe(2)
        expect(database.tables.map((table) => table.name).sort()).toEqual(
          Object.keys(schemaV2).sort(),
        )
        for (const [tableName, declaration] of Object.entries(schemaV1)) {
          expect(schemaV2[tableName as keyof typeof schemaV1]).toBe(declaration)
          const table = database.table(tableName)
          expect(table.schema.primKey.src).toBe('id')
          expect(table.schema.indexes.map((index) => index.src)).toEqual(
            declaration.split(', ').slice(1),
          )
        }
        for (const table of database.tables) expect(await table.count()).toBe(0)
      } finally {
        database.close()
      }
    }
  })

  it('refuses a future database version without wiping its rows', async () => {
    const future = new Dexie(name)
    future.version(3).stores(schemaV2)
    try {
      await future.open()
      await future.table('campaigns').add(campaignA)
    } finally {
      future.close()
    }
    const current = new TouchlineDatabase(name)
    try {
      await expect(current.open()).rejects.toMatchObject({
        name: 'VersionError',
      })
    } finally {
      current.close()
    }
    const inspect = new Dexie(name)
    try {
      await inspect.open()
      expect(inspect.verno).toBe(3)
      expect(await inspect.table('campaigns').get(campaignA.id)).toEqual(
        campaignA,
      )
    } finally {
      inspect.close()
    }
  })
})
