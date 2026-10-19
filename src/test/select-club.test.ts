import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { renameCampaign } from '../data/commands/rename-campaign'
import { seedDemoCampaign } from '../data/commands/seed-demo'
import { selectManagedClub } from '../data/commands/select-managed-club'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { getCampaign } from '../data/repositories/campaigns'
import { listAuditEvents } from '../data/repositories/audit-events'
import { entityIdSchema } from '../domain/validation/schemas'
import { previewBanner, staleSave } from '../app/copy'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
const demoId = entityIdSchema.parse('demo')
const now = harborInput.now

afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests(databaseName)
})

async function seed() {
  const result = await seedDemoCampaign(
    getDatabase(databaseName),
    {
      campaignId: 'demo',
      seed: 'touchline-demo-v1',
      generatorVersion: '1',
      now,
      reason: 'create',
      createAuditEventId: 'demo-audit-create',
      createActionId: 'demo-action-create',
      seedAuditEventId: 'demo-audit-seed',
      seedActionId: 'demo-action-seed',
    },
    () => {},
  )
  if (!result.ok) throw new Error(result.message)
  return result
}

describe('selectManagedClub', () => {
  it(
    'records each confirmed choice, including club 01',
    { timeout: 20_000 },
    async () => {
      const database = getDatabase(databaseName)
      const seeded = await seed()
      const input = {
        campaignId: 'demo',
        clubId: 'demo-club-19',
        expectedRevision: seeded.revision,
        now,
        auditEventId: 'audit-select-1',
        actionId: 'action-select-1',
      }
      const first = await selectManagedClub(database, input)
      expect(first).toMatchObject({
        ok: true,
        revision: seeded.revision + 1,
        value: { managedClubId: 'demo-club-19', updatedAt: now },
      })
      if (!first.ok) throw new Error(first.message)
      expect(await getCampaign(database, demoId)).toEqual(first.value)
      let audits = (await listAuditEvents(database, demoId)).filter(
        (audit) => audit.actionType === 'campaign.select-club',
      )
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        summary: 'Selected Ashdale as the managed club',
        seasonId: 'demo-season-1',
        payload: input,
      })
      const second = await selectManagedClub(database, {
        ...input,
        clubId: 'demo-club-01',
        expectedRevision: first.revision,
        auditEventId: 'audit-select-2',
        actionId: 'action-select-2',
      })
      expect(second).toMatchObject({
        ok: true,
        revision: first.revision + 1,
        value: { managedClubId: 'demo-club-01' },
      })
      audits = (await listAuditEvents(database, demoId)).filter(
        (audit) => audit.actionType === 'campaign.select-club',
      )
      expect(audits).toHaveLength(2)
      expect(audits.map((audit) => audit.summary)).toContain(
        'Selected Ashbridge as the managed club',
      )
    },
  )

  it(
    'rejects foreign and missing clubs without writes and checks revision first',
    { timeout: 20_000 },
    async () => {
      const database = getDatabase(databaseName)
      const seeded = await seed()
      await createCampaign(database, {
        ...harborInput,
        campaignId: 'campaign-b',
        clubId: 'club-b',
        seasonId: 'season-b',
        auditEventId: 'audit-b',
        actionId: 'action-b',
      })
      const input = {
        campaignId: 'demo',
        clubId: 'club-b',
        expectedRevision: seeded.revision,
        now,
        auditEventId: 'audit-invalid',
        actionId: 'action-invalid',
      }
      for (const clubId of ['club-b', 'missing-club']) {
        expect(await selectManagedClub(database, { ...input, clubId })).toEqual(
          {
            ok: false,
            code: 'VALIDATION',
            message: 'Club is not in this campaign.',
          },
        )
      }
      expect(
        await selectManagedClub(database, {
          ...input,
          expectedRevision: seeded.revision - 1,
        }),
      ).toMatchObject({ ok: false, code: 'CONFLICT' })
      expect(
        await selectManagedClub(database, { ...input, extra: true }),
      ).toMatchObject({ ok: false, code: 'VALIDATION' })
      expect(await getCampaign(database, demoId)).toEqual(seeded.value)
      expect(await listAuditEvents(database, demoId)).toHaveLength(2)
    },
  )

  it(
    'redirects an unconfirmed demo, reports stale selection, and keeps a successful choice on reopen',
    { timeout: 20_000 },
    async () => {
      const database = getDatabase(databaseName)
      const seeded = await seed()
      const firstRender = renderAt('/app/demo/command-center')
      expect(
        await screen.findByRole('heading', {
          name: 'Choose the club you manage',
        }),
      ).toBeInTheDocument()
      expect(firstRender.router.state.location.pathname).toBe(
        '/app/demo/choose-club',
      )
      expect(screen.queryByText(previewBanner)).toBeNull()
      expect(
        screen.queryByRole('heading', { name: 'Command Center' }),
      ).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Ashbridge' }),
      ).toBeInTheDocument()
      for (const league of [
        'Northwater Premier',
        'Redfen Championship',
        'Calderan League',
        'Ostmark Regional',
      ]) {
        expect(
          within(screen.getByRole('region', { name: league })).getAllByRole(
            'button',
          ),
        ).toHaveLength(18)
      }
      await renameCampaign(database, {
        campaignId: 'demo',
        name: 'Fictional demo',
        expectedRevision: seeded.revision,
        now,
        auditEventId: 'audit-other-tab',
        actionId: 'action-other-tab',
      })
      fireEvent.click(screen.getByRole('button', { name: 'Ashdale' }))
      expect(await screen.findByText(staleSave)).toBeInTheDocument()
      expect(firstRender.router.state.location.pathname).toBe(
        '/app/demo/choose-club',
      )
      expect(
        (await listAuditEvents(database, demoId)).filter(
          (audit) => audit.actionType === 'campaign.select-club',
        ),
      ).toHaveLength(0)
      firstRender.unmount()
      const secondRender = renderAt('/app/demo/choose-club')
      fireEvent.click(await screen.findByRole('button', { name: 'Ashdale' }))
      expect(
        await screen.findByRole('heading', { level: 2, name: 'Ashdale' }),
      ).toBeInTheDocument()
      expect(secondRender.router.state.location.pathname).toBe(
        '/app/demo/command-center',
      )
      secondRender.unmount()
      const reopened = renderAt('/app/demo/command-center')
      await screen.findByRole('heading', { level: 2, name: 'Ashdale' })
      expect(reopened.router.state.location.pathname).toBe(
        '/app/demo/command-center',
      )
      expect(
        screen.queryByRole('heading', { name: 'Choose the club you manage' }),
      ).toBeNull()
    },
  )

  it('keeps a null-seed user campaign on its command center', async () => {
    await createCampaign(getDatabase(databaseName), harborInput)
    const { router } = renderAt('/app/campaign-a/command-center')
    await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' })
    expect(router.state.location.pathname).toBe(
      '/app/campaign-a/command-center',
    )
    expect(
      screen.queryByRole('heading', { name: 'Choose the club you manage' }),
    ).toBeNull()
  })
})
