import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { addPlayer } from '../data/commands/add-player'
import { renameCampaign } from '../data/commands/rename-campaign'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import type { TouchlineDatabase } from '../data/db'
import { getCampaign, listCampaigns } from '../data/repositories/campaigns'
import { getClub } from '../data/repositories/clubs'
import {
  insertPlayer,
  getPlayer,
  listPlayers,
} from '../data/repositories/players'
import { getActiveSeason } from '../data/repositories/seasons'
import { runCommand } from '../data/transactions/run-command'
import { nextRevision } from '../domain/commands/revision'
import { entityIdSchema, playerSchema } from '../domain/validation/schemas'

const testDatabaseName = 'touchline-os-test'
const now = '2026-10-19T00:00:00.000Z'

afterEach(async () => {
  await deleteDatabaseForTests(testDatabaseName)
})

function openDatabase(): TouchlineDatabase {
  return getDatabase(testDatabaseName)
}

function createInput(
  campaign: 'a' | 'b',
  extra?: { seed?: string | null; generatorVersion?: string | null },
) {
  if (campaign === 'a') {
    return {
      campaignId: 'campaign-a',
      clubId: 'club-a',
      seasonId: 'season-a',
      auditEventId: 'audit-a',
      actionId: 'action-a',
      name: 'Riverside',
      kind: 'fictional' as const,
      seed: extra?.seed ?? null,
      generatorVersion: extra?.generatorVersion ?? null,
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
    seed: extra?.seed ?? null,
    generatorVersion: extra?.generatorVersion ?? null,
    now,
    clubName: 'Hilltown',
    shortName: 'HIL',
    colors: { primary: '#224466', secondary: '#88AACC' },
    prestige: 20,
    academyTier: 2,
    scoutingRegion: null,
  }
}

function playerInput(clubId: string) {
  return {
    campaignId: 'campaign-a',
    playerId: 'player-a',
    expectedRevision: 1,
    now,
    auditEventId: 'audit-player-a',
    actionId: 'action-player-a',
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

function codeOf(result: { ok: boolean; code?: string }): string | undefined {
  return result.ok ? undefined : result.code
}

describe('commands', () => {
  it('adds one to the current revision', () => {
    expect(nextRevision(0)).toBe(1)
    expect(nextRevision(4)).toBe(5)
  })

  it('creates a campaign once and rejects the same ids', async () => {
    const database = openDatabase()
    const input = createInput('a')
    const created = await createCampaign(database, input)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.revision).toBe(1)

    const stored = await getCampaign(database, created.value.id)
    expect(stored?.revision).toBe(1)
    expect(stored?.generatorVersion).toBeNull()
    expect(stored?.seed).toBeNull()
    const club = await getClub(
      database,
      created.value.id,
      created.value.managedClubId,
    )
    expect(club?.leagueId).toBeNull()
    const season = await getActiveSeason(database, created.value.id)
    expect(season?.ordinal).toBe(1)
    expect(season?.status).toBe('active')
    const audits = await database.auditEvents.toArray()
    expect(audits).toHaveLength(1)
    expect(audits[0]?.actionType).toBe('campaign.create')
    expect(audits[0]?.summary).toBe('Created campaign Riverside')

    const duplicate = await createCampaign(database, input)
    expect(duplicate.ok).toBe(false)
    expect(codeOf(duplicate)).toBe('DUPLICATE')
    expect(await database.auditEvents.count()).toBe(1)
    expect(await database.clubs.count()).toBe(1)
    expect(await database.seasons.count()).toBe(1)
  })

  it('stores a provided seed and generator version', async () => {
    const database = openDatabase()
    const created = await createCampaign(
      database,
      createInput('b', { seed: 'alpha', generatorVersion: 'v1' }),
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.revision).toBe(1)
    expect(created.value.seed).toBe('alpha')
    expect(created.value.generatorVersion).toBe('v1')
  })

  it('renames a campaign and rejects a stale revision', async () => {
    const database = openDatabase()
    const created = await createCampaign(database, createInput('a'))
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const rename = {
      campaignId: 'campaign-a',
      name: 'Riverside Athletic',
      expectedRevision: 1,
      now,
      auditEventId: 'audit-rename-a',
      actionId: 'action-rename-a',
    }
    const renamed = await renameCampaign(database, rename)
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(renamed.revision).toBe(2)
    const stored = await getCampaign(database, created.value.id)
    expect(stored?.name).toBe('Riverside Athletic')
    expect(stored?.revision).toBe(2)
    const audits = await database.auditEvents.toArray()
    const renameAudit = audits.find(
      (audit) => audit.actionType === 'campaign.rename',
    )
    expect(renameAudit?.summary).toBe('Renamed campaign to Riverside Athletic')

    const stale = await renameCampaign(database, rename)
    expect(stale.ok).toBe(false)
    expect(codeOf(stale)).toBe('CONFLICT')
    const after = await getCampaign(database, created.value.id)
    expect(after?.name).toBe('Riverside Athletic')
    expect(after?.revision).toBe(2)
    expect(await database.auditEvents.count()).toBe(audits.length)
  })

  it('returns not found for an unknown campaign', async () => {
    const database = openDatabase()
    const result = await renameCampaign(database, {
      campaignId: 'campaign-missing',
      name: 'Nowhere',
      expectedRevision: 0,
      now,
      auditEventId: 'audit-missing',
      actionId: 'action-missing',
    })
    expect(result.ok).toBe(false)
    expect(codeOf(result)).toBe('NOT_FOUND')
    expect(await listCampaigns(database)).toEqual([])
    expect(await database.auditEvents.toArray()).toEqual([])
  })

  it('adds a player and stores an unknown market value', async () => {
    const database = openDatabase()
    const created = await createCampaign(database, createInput('a'))
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const added = await addPlayer(database, playerInput('club-a'))
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(added.revision).toBe(2)
    const player = await getPlayer(database, created.value.id, added.value.id)
    expect(player?.marketValueCents).toBeNull()
    const audits = await database.auditEvents.toArray()
    const playerAudit = audits.find(
      (audit) => audit.actionType === 'player.add',
    )
    expect(playerAudit?.summary).toBe('Added player Amina Cole')
    expect((await getCampaign(database, created.value.id))?.revision).toBe(2)
  })

  it('rejects an invalid player without writing', async () => {
    const database = openDatabase()
    await createCampaign(database, createInput('a'))
    const result = await addPlayer(database, {
      ...playerInput('club-a'),
      positions: [],
    })
    expect(result.ok).toBe(false)
    expect(codeOf(result)).toBe('VALIDATION')
    const campaignId = entityIdSchema.parse('campaign-a')
    expect(await listPlayers(database, campaignId)).toEqual([])
    expect((await getCampaign(database, campaignId))?.revision).toBe(1)
    expect(await database.auditEvents.count()).toBe(1)
  })

  it('rejects a club from the other campaign', async () => {
    const database = openDatabase()
    await createCampaign(database, createInput('a'))
    await createCampaign(database, createInput('b'))
    const result = await addPlayer(database, playerInput('club-b'))
    expect(result.ok).toBe(false)
    expect(codeOf(result)).toBe('VALIDATION')
    expect(
      await database.players.get(entityIdSchema.parse('player-a')),
    ).toBeUndefined()
    const campaignId = entityIdSchema.parse('campaign-a')
    expect((await getCampaign(database, campaignId))?.revision).toBe(1)
    expect(await database.auditEvents.count()).toBe(2)
  })

  it('rolls back a player insert when the body throws', async () => {
    const database = openDatabase()
    const created = await createCampaign(database, createInput('a'))
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const player = playerSchema.parse({
      id: 'player-a',
      campaignId: 'campaign-a',
      clubId: 'club-a',
      name: 'Amina Cole',
      positionGroup: 'MID',
      positions: ['CM'],
      nationalityCode: null,
      birthDate: null,
      reportedAge: 18,
      ageReferenceSeasonOrdinal: 1,
      marketValueCents: null,
      attributes: { passing: 70 },
      potential: null,
      source: 'fictional',
      externalSourceId: null,
      isNewgen: false,
    })

    const result = await runCommand(
      database,
      [database.campaigns, database.players, database.clubs],
      {
        kind: 'update',
        campaignId: created.value.id,
        expectedRevision: 1,
      },
      async () => {
        await insertPlayer(database, created.value.id, player)
        throw new Error('stop')
      },
    )
    expect(result.ok).toBe(false)
    expect(codeOf(result)).toBe('ABORTED')
    expect(await listPlayers(database, created.value.id)).toEqual([])
    expect((await getCampaign(database, created.value.id))?.revision).toBe(1)
    expect(await database.auditEvents.count()).toBe(1)
  })
})
