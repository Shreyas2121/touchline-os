import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { seedDemoCampaign } from '../data/commands/seed-demo'
import { selectManagedClub } from '../data/commands/select-managed-club'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import {
  auditEventSchema,
  entityIdSchema,
  playerSchema,
} from '../domain/validation/schemas'
import { previewBanner } from '../app/copy'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
const campaignId = entityIdSchema.parse('campaign-a')

afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests(databaseName)
})

function kpi(label: string): string | null | undefined {
  return screen.getByText(label, { selector: 'p', exact: true })
    .nextElementSibling?.textContent
}

describe('command center', () => {
  it('shows a real empty squad, unknown figures and the saved create event', async () => {
    await createCampaign(getDatabase(databaseName), harborInput)
    const { container } = renderAt('/app/campaign-a/command-center')
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' }),
    ).toBeInTheDocument()
    expect(kpi('Squad')).toBe('0')
    expect(kpi('Squad age')).toBe('Unknown')
    for (const label of ['Transfer capacity', 'Weekly wages', 'Registration'])
      expect(kpi(label)).toBe('Unknown')
    expect(
      within(screen.getByRole('list', { name: 'Activity' })).getByText(
        'Created campaign Harbor',
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(
      /€|Preview|Static preview|Blocked|Warning|Informational|Passed/,
    )
  })

  it(
    'shows club 01 and its squad from the featured world while Squad stays a preview',
    { timeout: 20_000 },
    async () => {
      const seeded = await seedDemoCampaign(
        getDatabase(databaseName),
        {
          campaignId: 'demo',
          seed: 'touchline-demo-v1',
          generatorVersion: '1',
          now: harborInput.now,
          reason: 'create',
          createAuditEventId: 'demo-audit-create',
          createActionId: 'demo-action-create',
          seedAuditEventId: 'demo-audit-seed',
          seedActionId: 'demo-action-seed',
        },
        () => {},
      )
      expect(seeded.ok).toBe(true)
      if (!seeded.ok) throw new Error(seeded.message)
      expect(
        (
          await selectManagedClub(getDatabase(databaseName), {
            campaignId: 'demo',
            clubId: 'demo-club-01',
            expectedRevision: seeded.revision,
            now: harborInput.now,
            auditEventId: 'audit-select',
            actionId: 'action-select',
          })
        ).ok,
      ).toBe(true)
      const { container, unmount } = renderAt('/app/demo/command-center')
      expect(
        await screen.findByRole('heading', { level: 2, name: 'Ashbridge' }),
      ).toBeInTheDocument()
      expect(kpi('Squad')).toBe('36')
      expect(kpi('Squad age')).toMatch(/^\d+ years$/)
      expect(screen.getAllByText('Unknown', { exact: true })).toHaveLength(3)
      expect(container.textContent).not.toMatch(/€|Preview|Static preview/)
      unmount()
      renderAt('/app/demo/squad')
      expect(await screen.findByText(previewBanner)).toBeInTheDocument()
    },
  )

  it('counts only managed-club players and limits activity to the newest 20 summaries', async () => {
    const database = getDatabase(databaseName)
    await createCampaign(database, harborInput)
    await createCampaign(database, {
      ...harborInput,
      campaignId: 'campaign-b',
      clubId: 'club-b',
      seasonId: 'season-b',
      auditEventId: 'audit-b',
      actionId: 'action-b',
      name: 'Other campaign',
    })
    for (const [index, age] of [30, null, 24, null, 10].entries()) {
      await database.players.add(
        playerSchema.parse({
          id: `player-${index}`,
          campaignId,
          clubId: 'club-a',
          name: `Player ${index}`,
          positionGroup: 'MID',
          positions: ['CM'],
          nationalityCode: null,
          birthDate: null,
          reportedAge: age,
          ageReferenceSeasonOrdinal: age === null ? null : 1,
          marketValueCents: null,
          attributes: {},
          potential: null,
          source: 'fictional',
          externalSourceId: null,
          isNewgen: false,
        }),
      )
    }
    for (const [id, owner, club] of [
      ['free', 'campaign-a', null],
      ['other', 'campaign-b', 'club-b'],
    ] as const) {
      await database.players.add(
        playerSchema.parse({
          id,
          campaignId: owner,
          clubId: club,
          name: 'Outside squad',
          positionGroup: 'GK',
          positions: ['GK'],
          nationalityCode: null,
          birthDate: null,
          reportedAge: 99,
          ageReferenceSeasonOrdinal: 1,
          marketValueCents: null,
          attributes: {},
          potential: null,
          source: 'fictional',
          externalSourceId: null,
          isNewgen: false,
        }),
      )
    }
    for (let i = 1; i <= 21; i += 1) {
      await database.auditEvents.add(
        auditEventSchema.parse({
          id: `audit-summary-${i}`,
          campaignId,
          seasonId: null,
          actionId: `action-summary-${i}`,
          actionType: 'campaign.rename',
          createdAt: `2026-10-19T00:00:${String(i).padStart(2, '0')}.000Z`,
          summary: `Saved summary ${i}`,
          payload: {},
        }),
      )
    }
    renderAt('/app/campaign-a/command-center')
    await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' })
    expect(kpi('Squad')).toBe('5')
    expect(kpi('Squad age')).toBe('24 years · 2 unknown')
    const lines = within(
      screen.getByRole('list', { name: 'Activity' }),
    ).getAllByRole('listitem')
    expect(lines.map((line) => line.textContent)).toEqual(
      Array.from({ length: 20 }, (_, i) => `Saved summary ${21 - i}`),
    )
    expect(screen.queryByText('Other campaign')).toBeNull()
    expect(screen.queryByText('Outside squad')).toBeNull()
  })

  it('uses Unknown and a zero squad when the managed club is missing', async () => {
    const database = getDatabase(databaseName)
    await createCampaign(database, harborInput)
    await database.clubs.delete(entityIdSchema.parse('club-a'))
    renderAt('/app/campaign-a/command-center')
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Unknown' }),
    ).toBeInTheDocument()
    expect(kpi('Squad')).toBe('0')
    expect(kpi('Squad age')).toBe('Unknown')
  })
})
