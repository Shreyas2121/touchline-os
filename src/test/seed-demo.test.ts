import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { seedDemoCampaign, type SeedProgress } from '../data/commands/seed-demo'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { listAuditEvents } from '../data/repositories/audit-events'
import { listPlayers } from '../data/repositories/players'
import { auditEventSchema, entityIdSchema } from '../domain/validation/schemas'

const databaseName = 'touchline-os-test'
const now = '2026-10-19T00:00:00.000Z'
const demoId = entityIdSchema.parse('demo')
const input = {
  campaignId: 'demo',
  seed: 'touchline-demo-v1',
  generatorVersion: '1',
  now,
  reason: 'create',
  createAuditEventId: 'demo-audit-create',
  createActionId: 'demo-action-create',
  seedAuditEventId: 'demo-audit-seed',
  seedActionId: 'demo-action-seed',
}
const secondInput = {
  campaignId: 'campaign-b',
  clubId: 'club-b',
  seasonId: 'season-b',
  auditEventId: 'audit-b',
  actionId: 'action-b',
  name: 'Hilltown',
  kind: 'fictional',
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
const ignoreProgress = () => {}

afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})

describe('seedDemoCampaign', () => {
  it(
    'seeds the full world once, reports progress, and isolates another campaign',
    { timeout: 20_000 },
    async () => {
      const database = getDatabase(databaseName)
      const second = await createCampaign(database, secondInput)
      expect(second.ok).toBe(true)
      const progress: SeedProgress[] = []
      const result = await seedDemoCampaign(database, input, (event) =>
        progress.push(event),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.message)
      expect(result.revision).toBe(14)
      expect(result.value).toMatchObject({
        id: 'demo',
        name: 'Fictional demo',
        managedClubId: 'demo-club-01',
        activeSeasonId: 'demo-season-1',
      })
      expect(
        await database.leagues.where('campaignId').equals(demoId).count(),
      ).toBe(4)
      expect(
        await database.clubs.where('campaignId').equals(demoId).count(),
      ).toBe(72)
      expect(
        await database.players.where('campaignId').equals(demoId).count(),
      ).toBe(3000)
      expect(
        await database.seasons.where('campaignId').equals(demoId).count(),
      ).toBe(1)
      expect(
        await database.seasons.get(entityIdSchema.parse('demo-season-1')),
      ).toMatchObject({
        label: 'Season 1',
        ordinal: 1,
        status: 'active',
        startDate: '2026-10-19',
        endDate: null,
        openedAt: now,
        closedAt: null,
      })
      expect(await database.campaigns.get(demoId)).toEqual(result.value)
      expect(
        await database.players.get(entityIdSchema.parse('demo-player-0001')),
      ).not.toHaveProperty('weeklyWageCents')
      const audits = await listAuditEvents(database, demoId)
      expect(audits).toHaveLength(2)
      expect(audits.map((audit) => audit.actionType)).toEqual([
        'campaign.seed',
        'campaign.create',
      ])
      expect(audits[0]).toMatchObject({
        summary: 'Seeded fictional world',
        payload: {
          seed: input.seed,
          generatorVersion: '1',
          leagueCount: 4,
          clubCount: 72,
          playerCount: 3000,
          reason: 'create',
        },
      })
      expect(audits[0].payload).toEqual({
        seed: input.seed,
        generatorVersion: '1',
        leagueCount: 4,
        clubCount: 72,
        playerCount: 3000,
        reason: 'create',
      })
      expect(progress.slice(0, 2)).toEqual([
        { stage: 'leagues', done: 0, total: 4 },
        { stage: 'clubs', done: 0, total: 72 },
      ])
      expect(
        progress
          .filter((event) => event.stage === 'players')
          .map((event) => event.done),
      ).toEqual(Array.from({ length: 12 }, (_, i) => i * 250))
      expect(progress.at(-1)).toEqual({
        stage: 'ready',
        done: 3000,
        total: 3000,
      })
      const repeatProgress: SeedProgress[] = []
      expect(
        await seedDemoCampaign(database, input, (event) =>
          repeatProgress.push(event),
        ),
      ).toEqual(result)
      expect(repeatProgress).toEqual([
        { stage: 'ready', done: 3000, total: 3000 },
      ])
      expect(await database.players.count()).toBe(3000)
      expect(await listAuditEvents(database, demoId)).toEqual(audits)
      expect(
        await listPlayers(database, entityIdSchema.parse('campaign-b')),
      ).toEqual([])
      if (second.ok)
        expect(await database.campaigns.get(second.value.id)).toEqual(
          second.value,
        )
    },
  )

  it('aborts the first player batch and resumes without duplicating clubs', async () => {
    const database = getDatabase(databaseName)
    const stopped = await seedDemoCampaign(database, input, (event) => {
      if (event.stage === 'players') throw new Error('stop')
    })
    expect(stopped).toEqual({
      ok: false,
      code: 'ABORTED',
      message: 'Command did not finish.',
    })
    expect(await database.leagues.count()).toBe(4)
    expect(await database.clubs.count()).toBe(72)
    expect(await database.players.count()).toBe(0)
    expect((await database.campaigns.get(demoId))?.revision).toBe(1)
    expect(
      (await listAuditEvents(database, demoId)).map(
        (audit) => audit.actionType,
      ),
    ).toEqual(['campaign.create'])
    const resumed = await seedDemoCampaign(database, input, ignoreProgress)
    expect(resumed.ok).toBe(true)
    expect(await database.players.count()).toBe(3000)
    expect(
      await database.clubs.where('id').equals('demo-club-01').count(),
    ).toBe(1)
  })

  it('resumes after committed player batches and preserves the managed club', async () => {
    const database = getDatabase(databaseName)
    await seedDemoCampaign(database, input, (event) => {
      if (event.stage === 'players' && event.done === 500)
        throw new Error('stop')
    })
    expect(await database.players.count()).toBe(500)
    const firstPlayer = await database.players.get(
      entityIdSchema.parse('demo-player-0001'),
    )
    await database.campaigns.update(demoId, {
      managedClubId: entityIdSchema.parse('demo-club-02'),
    })
    const result = await seedDemoCampaign(
      database,
      { ...input, reason: 'reset' },
      ignoreProgress,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    expect(result.revision).toBe(14)
    expect(result.value.managedClubId).toBe('demo-club-02')
    expect(
      await database.players.get(entityIdSchema.parse('demo-player-0001')),
    ).toEqual(firstPlayer)
    expect((await listAuditEvents(database, demoId))[0].summary).toBe(
      'Reset fictional world',
    )
  })

  it('rejects a mismatching stored world without writes', async () => {
    const database = getDatabase(databaseName)
    const created = await createCampaign(database, {
      ...secondInput,
      campaignId: 'demo',
      seed: 'old-seed',
      generatorVersion: '0',
    })
    expect(created.ok).toBe(true)
    expect(await seedDemoCampaign(database, input, ignoreProgress)).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Demo world version does not match.',
    })
    expect(await database.leagues.count()).toBe(0)
    expect((await database.campaigns.get(demoId))?.revision).toBe(1)
    if (created.ok)
      expect(await database.campaigns.get(demoId)).toEqual(created.value)
    expect(await database.auditEvents.count()).toBe(1)
  })

  it('rejects invalid input and non-featured worlds before writing', async () => {
    const database = getDatabase(databaseName)
    for (const invalid of [
      {},
      { ...input, extra: true },
      { ...input, now: 'yesterday' },
    ]) {
      expect(await seedDemoCampaign(database, invalid, ignoreProgress)).toEqual(
        {
          ok: false,
          code: 'VALIDATION',
          message: 'Command input is not valid.',
        },
      )
    }
    for (const changed of [
      { campaignId: 'campaign-a' },
      { seed: 'other' },
      { generatorVersion: '2' },
    ]) {
      expect(
        await seedDemoCampaign(
          database,
          { ...input, ...changed },
          ignoreProgress,
        ),
      ).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'Only the fictional demo can be seeded.',
      })
    }
    expect(await database.campaigns.count()).toBe(0)
    expect(await database.clubs.count()).toBe(0)
    expect(await database.auditEvents.count()).toBe(0)
  })
})

describe('listAuditEvents', () => {
  it('sorts newest first, breaks ties by descending id, and scopes the results', async () => {
    const database = getDatabase(databaseName)
    for (const [id, campaignId, createdAt] of [
      ['a', 'demo', now],
      ['b', 'demo', now],
      ['c', 'demo', '2026-10-20T00:00:00.000Z'],
      ['d', 'campaign-b', now],
    ]) {
      await database.auditEvents.add(
        auditEventSchema.parse({
          id,
          campaignId,
          createdAt,
          seasonId: null,
          actionId: `action-${id}`,
          actionType: 'campaign.create',
          summary: 'Created campaign',
          payload: {},
        }),
      )
    }
    expect(
      (await listAuditEvents(database, demoId)).map((audit) => audit.id),
    ).toEqual(['c', 'b', 'a'])
  })
})
