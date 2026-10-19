import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { deleteCampaign } from '../data/commands/delete-campaign'
import { resetDemoCampaign } from '../data/commands/reset-demo'
import { seedDemoCampaign } from '../data/commands/seed-demo'
import { setCampaignArchived } from '../data/commands/set-campaign-archived'
import { deleteDatabaseForTests, getDatabase, parseStored } from '../data/db'
import { listAuditEvents } from '../data/repositories/audit-events'
import { getCampaign, listCampaigns } from '../data/repositories/campaigns'
import { listClubs } from '../data/repositories/clubs'
import { listPlayers } from '../data/repositories/players'
import { campaignSchema, entityIdSchema } from '../domain/validation/schemas'
import { campaignA, harborInput } from './fixtures/campaign'
import { timestampUtcSchema } from '../domain/models/dates'

const now = '2026-10-19T00:00:00.000Z'
const demoId = entityIdSchema.parse('demo')
const harborId = entityIdSchema.parse('campaign-a')
const auditIds = {
  createAuditEventId: 'demo-audit-create',
  createActionId: 'demo-action-create',
  seedAuditEventId: 'demo-audit-seed',
  seedActionId: 'demo-action-seed',
}
const seedInput = {
  campaignId: 'demo',
  seed: 'touchline-demo-v1',
  generatorVersion: '1',
  now,
  reason: 'create',
  ...auditIds,
}
const commandInput = {
  campaignId: harborId,
  expectedRevision: 1,
  now,
  auditEventId: 'audit-management',
  actionId: 'action-management',
}

afterEach(async () => {
  await deleteDatabaseForTests('touchline-os-test')
})

describe('campaign management', () => {
  it('archives idempotently, rejects stale deletion, and restores with an audit', async () => {
    const database = getDatabase('touchline-os-test')
    await createCampaign(database, harborInput)
    const archived = await setCampaignArchived(database, {
      ...commandInput,
      archived: true,
    })
    expect(archived.ok).toBe(true)
    if (!archived.ok) throw new Error(archived.message)
    expect(archived.value.status).toBe('archived')
    expect(
      (await listCampaigns(database)).filter(
        (campaign) => campaign.status === 'active',
      ),
    ).toEqual([])
    expect(
      await setCampaignArchived(database, { ...commandInput, archived: true }),
    ).toEqual(archived)
    expect(
      (await listAuditEvents(database, harborId)).filter(
        (audit) => audit.actionType === 'campaign.archive',
      ),
    ).toHaveLength(1)
    expect(await deleteCampaign(database, commandInput)).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    })
    expect(await getCampaign(database, harborId)).toEqual(archived.value)
    const restored = await setCampaignArchived(database, {
      ...commandInput,
      archived: false,
      expectedRevision: archived.revision,
      auditEventId: 'audit-restore',
      actionId: 'action-restore',
    })
    expect(restored).toMatchObject({
      ok: true,
      revision: 3,
      value: { status: 'active' },
    })
    expect(
      (await listAuditEvents(database, harborId)).map((audit) => audit.summary),
    ).toContain('Restored campaign Harbor')
  })

  it(
    'deletes one save and keeps the demo and unscoped imports',
    { timeout: 20_000 },
    async () => {
      const database = getDatabase('touchline-os-test')
      expect((await seedDemoCampaign(database, seedInput, () => {})).ok).toBe(
        true,
      )
      await createCampaign(database, harborInput)
      // Sentinels exercise campaign-scoped deletion on every indexed table, including tables without writers yet.
      for (const table of database.tables.filter(
        (table) => table.name !== 'campaigns',
      )) {
        await table.add({ id: `sentinel-${table.name}`, campaignId: harborId })
      }
      await database.importReceipts.add({
        id: entityIdSchema.parse('unscoped-import'),
        campaignId: null,
        sourceName: 'local.csv',
        sourceType: 'csv',
        importedAt: timestampUtcSchema.parse(now),
        rowCounts: {},
        mappingVersion: '1',
        warnings: [],
        provenance: 'imported',
      })
      expect(await deleteCampaign(database, commandInput)).toMatchObject({
        ok: true,
        value: { id: harborId },
      })
      expect(
        (await listCampaigns(database)).map((campaign) => campaign.id),
      ).toEqual([demoId])
      expect(await listPlayers(database, demoId)).toHaveLength(3000)
      expect(await listClubs(database, harborId)).toEqual([])
      for (const table of database.tables.filter(
        (table) => table.name !== 'campaigns',
      )) {
        expect(await table.where('campaignId').equals(harborId).count()).toBe(0)
      }
      expect(
        await database.importReceipts.get(
          entityIdSchema.parse('unscoped-import'),
        ),
      ).toBeDefined()
    },
  )

  it(
    'resets only demo and refuses a stale reset before deleting',
    { timeout: 20_000 },
    async () => {
      const database = getDatabase('touchline-os-test')
      const seeded = await seedDemoCampaign(database, seedInput, () => {})
      if (!seeded.ok) throw new Error(seeded.message)
      await createCampaign(database, harborInput)
      const resetInput = {
        campaignId: 'demo',
        expectedRevision: seeded.revision,
        now,
        ...auditIds,
      }
      expect(
        await resetDemoCampaign(
          database,
          { ...resetInput, expectedRevision: 0 },
          () => {},
        ),
      ).toMatchObject({ ok: false, code: 'CONFLICT' })
      expect(await getCampaign(database, demoId)).toEqual(seeded.value)
      expect((await resetDemoCampaign(database, resetInput, () => {})).ok).toBe(
        true,
      )
      expect(await listPlayers(database, demoId)).toHaveLength(3000)
      expect(
        (await listAuditEvents(database, demoId)).find(
          (audit) => audit.actionType === 'campaign.seed',
        )?.summary,
      ).toBe('Reset fictional world')
      expect(await listClubs(database, harborId)).toHaveLength(1)
      expect(
        await resetDemoCampaign(
          database,
          { ...resetInput, campaignId: harborId },
          () => {},
        ),
      ).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'Only the fictional demo can be reset.',
      })
      expect(await getCampaign(database, harborId)).toBeDefined()
    },
  )

  it('requires status on stored campaigns and returns missing and validation failures', async () => {
    const database = getDatabase('touchline-os-test')
    const { status, ...legacy } = campaignA
    void status
    expect(() => parseStored(campaignSchema, legacy)).toThrow(
      'Stored row does not match its schema.',
    )
    expect(await deleteCampaign(database, commandInput)).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    expect(
      await setCampaignArchived(database, { ...commandInput, archived: true }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await deleteCampaign(database, {})).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await setCampaignArchived(database, {})).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await resetDemoCampaign(database, {}, () => {})).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
  })
})
