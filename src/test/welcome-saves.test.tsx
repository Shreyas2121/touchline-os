import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  archiveHelp,
  databaseUnavailable,
  importPanel,
  staleSave,
} from '../app/copy'
import { DatabaseProvider } from '../app/providers/database'
import { createCampaign } from '../data/commands/create-campaign'
import { renameCampaign } from '../data/commands/rename-campaign'
import { setCampaignArchived } from '../data/commands/set-campaign-archived'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { entityIdSchema } from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await deleteDatabaseForTests('touchline-os-test')
})

async function openWelcome() {
  const result = renderAt('/')
  await screen.findByRole('heading', { name: 'Touchline OS' })
  return result
}

describe('saved campaigns on welcome', () => {
  it('requires all create fields and persists a campaign before opening its workspace', async () => {
    const { router } = await openWelcome()
    fireEvent.click(screen.getByRole('button', { name: 'Create new campaign' }))
    const save = screen.getByRole('button', { name: 'Save campaign' })
    expect(save).toBeDisabled()
    expect(screen.queryByText('Campaign saved')).toBeNull()
    expect(screen.getByLabelText('Campaign name')).toHaveFocus()
    fireEvent.change(screen.getByLabelText('Club name'), {
      target: { value: 'Harbor Athletic' },
    })
    fireEvent.change(screen.getByLabelText('Short name'), {
      target: { value: 'HAR' },
    })
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: '   ' },
    })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Harbor' },
    })
    fireEvent.click(save)
    await screen.findByRole('heading', { name: 'Command Center' })
    expect(screen.getByText('Harbor')).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(
      /^\/app\/[A-Za-z0-9-]+\/command-center$/,
    )
    expect(await getDatabase('touchline-os-test').campaigns.count()).toBe(1)
  })

  it('keeps import unavailable with no file input', async () => {
    await openWelcome()
    fireEvent.click(screen.getByRole('button', { name: 'Import backup' }))
    expect(screen.getByText(importPanel)).toBeInTheDocument()
    expect(document.querySelector('input[type=file]')).toBeNull()
  })

  it('offers restoration for an archived demo without navigating or seeding', async () => {
    const database = getDatabase('touchline-os-test')
    await createCampaign(database, { ...harborInput, campaignId: 'demo' })
    await setCampaignArchived(database, {
      campaignId: 'demo',
      expectedRevision: 1,
      archived: true,
      now: harborInput.now,
      auditEventId: 'audit-archive',
      actionId: 'action-archive',
    })
    const { router } = await openWelcome()
    const button = screen.getByRole('button', { name: 'Try fictional demo' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    expect(
      await screen.findByText('The fictional demo is archived.'),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Restore' }).length,
    ).toBeGreaterThan(0)
    expect(router.state.location.pathname).toBe('/')
    expect(await database.players.count()).toBe(0)
    expect(
      (await database.campaigns.get(entityIdSchema.parse('demo')))?.status,
    ).toBe('archived')
  })

  it('renames, confirms archive and restore, and requires an exact name to delete', async () => {
    const database = getDatabase('touchline-os-test')
    await createCampaign(database, harborInput)
    await openWelcome()
    await screen.findByRole('link', { name: 'Harbor' })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Harbor Town' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await screen.findByRole('link', { name: 'Harbor Town' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(screen.getByText(archiveHelp)).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      (await database.campaigns.get(entityIdSchema.parse('campaign-a')))
        ?.status,
    ).toBe('active')
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive campaign' }))
    const archived = await screen.findByRole('region', { name: 'Archived' })
    expect(screen.queryByRole('link', { name: 'Harbor Town' })).toBeNull()
    fireEvent.click(within(archived).getByRole('button', { name: 'Restore' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore campaign' }))
    await screen.findByRole('link', { name: 'Harbor Town' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const remove = screen.getByRole('button', { name: 'Delete campaign' })
    expect(remove).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type the campaign name'), {
      target: { value: 'Harbor' },
    })
    expect(remove).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type the campaign name'), {
      target: { value: 'Harbor Town' },
    })
    fireEvent.click(remove)
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Harbor Town' })).toBeNull(),
    )
    expect(await database.campaigns.count()).toBe(0)
  })

  it('shows stale-save copy and reloads without repeating a rejected rename', async () => {
    const database = getDatabase('touchline-os-test')
    await createCampaign(database, harborInput)
    await openWelcome()
    await screen.findByRole('link', { name: 'Harbor' })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    await renameCampaign(database, {
      campaignId: 'campaign-a',
      expectedRevision: 1,
      name: 'Other tab',
      now: harborInput.now,
      auditEventId: 'audit-other',
      actionId: 'action-other',
    })
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Rejected name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText(staleSave)).toBeInTheDocument()
    await screen.findByRole('link', { name: 'Other tab' })
    expect(await database.auditEvents.count()).toBe(2)
  })

  it('disables reset until the phrase matches and lets Cancel close without writing', async () => {
    const database = getDatabase('touchline-os-test')
    await createCampaign(database, { ...harborInput, campaignId: 'demo' })
    await openWelcome()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reset fictional demo' }),
    )
    const reset = screen.getByRole('button', {
      name: 'Reset demo',
    })
    expect(reset).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type the confirmation phrase'), {
      target: { value: 'Reset fictional demo' },
    })
    expect(reset).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await database.campaigns.count()).toBe(1)
    expect(await database.players.count()).toBe(0)
  })

  it('shows the unavailable message without mounting children when IndexedDB is absent', () => {
    vi.stubGlobal('indexedDB', undefined)
    render(
      <DatabaseProvider name="touchline-os-test">
        <p>Child content</p>
      </DatabaseProvider>,
    )
    expect(screen.getByText(databaseUnavailable)).toBeInTheDocument()
    expect(screen.queryByText('Child content')).toBeNull()
  })
})
