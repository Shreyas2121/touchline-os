import Dexie, { type EntityTable } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { addPlayer } from '../data/commands/add-player'
import { createCampaign } from '../data/commands/create-campaign'
import { renameCampaign } from '../data/commands/rename-campaign'
import {
  DATABASE_VERSION,
  TouchlineDatabase,
  assertStorageAvailable,
  closeDatabaseForTests,
  deleteDatabaseForTests,
  getDatabase,
} from '../data/db'
import { PersistenceError } from '../data/errors'
import { getCampaign, listCampaigns } from '../data/repositories/campaigns'
import {
  getPlayer,
  insertPlayer,
  listPlayers,
} from '../data/repositories/players'
import { runCommand } from '../data/transactions/run-command'
import {
  entityIdSchema,
  playerSchema,
  type Player,
} from '../domain/validation/schemas'

const testDatabaseName = 'touchline-os-test'
const probeDatabaseName = 'touchline-os-migration-probe'
const now = '2026-10-19T00:00:00.000Z'

afterEach(async () => {
  await deleteDatabaseForTests(testDatabaseName)
  await deleteDatabaseForTests(probeDatabaseName)
})

function openDatabase(): TouchlineDatabase {
  return getDatabase(testDatabaseName)
}

function failureCode(result: {
  ok: boolean
  code?: string
}): string | undefined {
  return result.ok ? undefined : result.code
}

function createInput(campaign: 'a' | 'b') {
  if (campaign === 'a') {
    return {
      campaignId: 'campaign-a',
      clubId: 'club-a',
      seasonId: 'season-a',
      auditEventId: 'audit-a',
      actionId: 'action-a',
      name: 'Riverside',
      kind: 'fictional' as const,
      seed: null,
      generatorVersion: null,
      now,
      clubName: 'Riverside Athletic',
      shortName: 'RIV',
      colors: { primary: '#113355', secondary: '#D4A017' },
      prestige: 40,
      academyTier: 3,
      scoutingRegion: null,
    }
  }
  return {
    campaignId: 'campaign-b',
    clubId: 'club-b',
    seasonId: 'season-b',
    auditEventId: 'audit-b',
    actionId: 'action-b',
    name: 'Hilltown',
    kind: 'fictional' as const,
    seed: null,
    generatorVersion: null,
    now,
    clubName: 'Hilltown',
    shortName: 'HIL',
    colors: { primary: '#224466', secondary: '#88AACC' },
    prestige: 20,
    academyTier: 2,
    scoutingRegion: null,
  }
}

function playerFields(id: string, campaignId: string, clubId: string) {
  return {
    id,
    campaignId,
    clubId,
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
}

function playerCommand(
  playerId: string,
  campaignId: string,
  clubId: string,
  expectedRevision: number,
  auditEventId: string,
  actionId: string,
) {
  const { id, ...fields } = playerFields(playerId, campaignId, clubId)
  void id
  return {
    ...fields,
    playerId,
    expectedRevision,
    now,
    auditEventId,
    actionId,
  }
}

describe('persistence invariants', () => {
  it('keeps committed campaign state isolated across failure and reopen', async () => {
    const database = openDatabase()
    const createdA = await createCampaign(database, createInput('a'))
    const createdB = await createCampaign(database, createInput('b'))
    expect(createdA.ok).toBe(true)
    expect(createdB.ok).toBe(true)
    if (!createdA.ok || !createdB.ok) return
    expect(createdA.revision).toBe(1)
    expect(createdB.revision).toBe(1)

    const added = await addPlayer(
      database,
      playerCommand(
        'player-a',
        'campaign-a',
        'club-a',
        1,
        'audit-player-a',
        'action-player-a',
      ),
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(added.revision).toBe(2)
    expect(await listPlayers(database, createdB.value.id)).toEqual([])
    expect(
      await getPlayer(database, createdB.value.id, added.value.id),
    ).toBeUndefined()
    expect(await database.players.get(added.value.id)).toBeDefined()
    expect(
      (await getPlayer(database, createdA.value.id, added.value.id))
        ?.marketValueCents,
    ).toBeNull()

    const auditsBeforeStale = await database.auditEvents
      .where('campaignId')
      .equals(createdA.value.id)
      .count()
    const stale = await renameCampaign(database, {
      campaignId: 'campaign-a',
      name: 'Stale Name',
      expectedRevision: 1,
      now,
      auditEventId: 'audit-stale-a',
      actionId: 'action-stale-a',
    })
    expect(stale.ok).toBe(false)
    expect(failureCode(stale)).toBe('CONFLICT')
    const afterStale = await getCampaign(database, createdA.value.id)
    expect(afterStale?.name).toBe('Riverside')
    expect(afterStale?.revision).toBe(2)
    expect(
      await database.auditEvents
        .where('campaignId')
        .equals(createdA.value.id)
        .count(),
    ).toBe(auditsBeforeStale)

    const auditsBeforeAbort = await database.auditEvents
      .where('campaignId')
      .equals(createdB.value.id)
      .count()
    const abortPlayer = playerSchema.parse(
      playerFields('player-abort', 'campaign-b', 'club-b'),
    )
    const aborted = await runCommand(
      database,
      [database.campaigns, database.players, database.clubs],
      {
        kind: 'update',
        campaignId: createdB.value.id,
        expectedRevision: 1,
      },
      async () => {
        await insertPlayer(database, createdB.value.id, abortPlayer)
        throw new Error('stop')
      },
    )
    expect(aborted.ok).toBe(false)
    expect(failureCode(aborted)).toBe('ABORTED')
    expect(await listPlayers(database, createdB.value.id)).toEqual([])
    expect((await getCampaign(database, createdB.value.id))?.revision).toBe(1)
    expect(
      await database.auditEvents
        .where('campaignId')
        .equals(createdB.value.id)
        .count(),
    ).toBe(auditsBeforeAbort)

    const cross = await addPlayer(
      database,
      playerCommand(
        'player-cross',
        'campaign-a',
        'club-b',
        2,
        'audit-cross-a',
        'action-cross-a',
      ),
    )
    expect(cross.ok).toBe(false)
    expect(failureCode(cross)).toBe('VALIDATION')
    expect((await getCampaign(database, createdA.value.id))?.revision).toBe(2)
    expect(
      await database.players.get(entityIdSchema.parse('player-cross')),
    ).toBeUndefined()

    const duplicate = await addPlayer(
      database,
      playerCommand(
        'player-a',
        'campaign-b',
        'club-b',
        1,
        'audit-duplicate-b',
        'action-duplicate-b',
      ),
    )
    expect(duplicate.ok).toBe(false)
    expect(failureCode(duplicate)).toBe('DUPLICATE')
    expect(
      (await getPlayer(database, createdA.value.id, added.value.id))?.name,
    ).toBe('Amina Cole')
    expect((await getCampaign(database, createdB.value.id))?.revision).toBe(1)
    expect(await listPlayers(database, createdB.value.id)).toEqual([])

    expect(
      await getCampaign(database, entityIdSchema.parse('missing')),
    ).toBeUndefined()
    const missing = await renameCampaign(database, {
      campaignId: 'campaign-missing',
      name: 'Nowhere',
      expectedRevision: 0,
      now,
      auditEventId: 'audit-missing',
      actionId: 'action-missing',
    })
    expect(missing.ok).toBe(false)
    expect(failureCode(missing)).toBe('NOT_FOUND')
    expect(
      (await listCampaigns(database)).map((campaign) => campaign.id).sort(),
    ).toEqual([createdA.value.id, createdB.value.id])

    const { source, ...withoutSource } = playerFields(
      'player-bad',
      'campaign-a',
      'club-a',
    )
    void source
    await database.players.add(withoutSource as unknown as Player)
    let thrown: unknown
    try {
      await getPlayer(
        database,
        createdA.value.id,
        entityIdSchema.parse('player-bad'),
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(PersistenceError)
    if (!(thrown instanceof PersistenceError)) return
    expect(thrown.code).toBe('CORRUPT')
    expect(
      (await getPlayer(database, createdA.value.id, added.value.id))
        ?.marketValueCents,
    ).toBeNull()

    const renamed = await renameCampaign(database, {
      campaignId: 'campaign-a',
      name: 'Riverside Athletic',
      expectedRevision: 2,
      now,
      auditEventId: 'audit-rename-a',
      actionId: 'action-rename-a',
    })
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(renamed.revision).toBe(3)

    closeDatabaseForTests(testDatabaseName)
    const reopened = getDatabase(testDatabaseName)
    expect(reopened).not.toBe(database)
    const stored = await getCampaign(reopened, createdA.value.id)
    expect(stored?.name).toBe('Riverside Athletic')
    expect(stored?.revision).toBe(3)
    const player = await getPlayer(reopened, createdA.value.id, added.value.id)
    expect(player?.name).toBe('Amina Cole')
    expect(player?.marketValueCents).toBeNull()
  })

  it('keeps a version 1 row when a probe opens version 2', async () => {
    class ProbeV1 extends Dexie {
      rows!: EntityTable<{ id: string; name: string }, 'id'>

      constructor() {
        super(probeDatabaseName)
        this.version(1).stores({ rows: 'id' })
      }
    }

    const first = new ProbeV1()
    await first.rows.add({ id: 'row-1', name: 'kept' })
    first.close()

    class ProbeV2 extends Dexie {
      rows!: EntityTable<{ id: string; name: string }, 'id'>

      constructor() {
        super(probeDatabaseName)
        this.version(1).stores({ rows: 'id' })
        this.version(2)
          .stores({ rows: 'id' })
          .upgrade(() => {})
      }
    }

    const second = new ProbeV2()
    expect((await second.rows.get('row-1'))?.name).toBe('kept')
    second.close()
    await Dexie.delete(probeDatabaseName)

    expect(DATABASE_VERSION).toBe(1)
    const production = new TouchlineDatabase(testDatabaseName)
    try {
      await production.open()
      expect(production.verno).toBe(1)
    } finally {
      production.close()
    }
  })

  it('rejects a missing IndexedDB implementation', () => {
    expect(() => assertStorageAvailable(undefined)).toThrow(PersistenceError)
    try {
      assertStorageAvailable(undefined)
    } catch (error) {
      expect(error).toBeInstanceOf(PersistenceError)
      if (!(error instanceof PersistenceError)) return
      expect(error.code).toBe('UNAVAILABLE')
    }
  })
})
