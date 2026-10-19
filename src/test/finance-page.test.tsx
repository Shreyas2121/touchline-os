import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  constitutionFailed,
  financeFailed,
  previewBanner,
  staleSave,
} from '../app/copy'
import { createCampaign } from '../data/commands/create-campaign'
import { saveConstitution } from '../data/commands/save-constitution'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import * as constitutionCommands from '../data/commands/save-constitution'
import * as ledgerCommands from '../data/commands/post-ledger-entry'
import { getActiveConstitution } from '../data/repositories/constitutions'
import {
  contractSchema,
  entityIdSchema,
  playerSchema,
} from '../domain/validation/schemas'
import { invalidMoneyMessage } from '../domain/models/money'
import { constitutionPreset } from '../domain/rules/presets'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
const id = entityIdSchema.parse
const database = () => getDatabase(databaseName)
const presetInput = {
  ...harborInput,
  preset: 'balanced',
  constitutionId: 'constitution-a',
  constitutionActionId: 'constitution-action',
  ledgerEntryId: 'opening',
}
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await deleteDatabaseForTests(databaseName)
})
function kpi(label: string) {
  return screen.getByText(label, { selector: 'p', exact: true })
    .nextElementSibling?.textContent
}
async function finance() {
  const rendered = renderAt('/app/campaign-a/finance')
  await screen.findByRole('table', { name: 'Wage pyramid' })
  return rendered
}
async function addContract(wage: number | null, tier: 'key' | null = 'key') {
  await database().contracts.add(
    contractSchema.parse({
      id: 'contract-a',
      campaignId: 'campaign-a',
      playerId: 'player-a',
      clubId: 'club-a',
      weeklyWageCents: wage,
      squadTier: tier,
      startsOn: null,
      expiresOn: null,
      status: 'active',
    }),
  )
}

describe('finance and constitution screens', () => {
  it('shows unknown capacity, known empty wages and no preview banner before adoption', async () => {
    await createCampaign(database(), harborInput)
    await finance()
    expect(kpi('Transfer capacity')).toBe('Unknown')
    expect(kpi('Weekly wages')).toBe('€0.00')
    expect(
      screen.getByText('No ledger entries for this season.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No active contracts are recorded.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(previewBanner)).toBeNull()
    expect(screen.getAllByText('Cap not set')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Preview action' })).toBeNull()
  })
  it('shows adopted allocation, all four tiers and a blocker for an over-cap contract while Squad wages remain unknown', async () => {
    await createCampaign(database(), presetInput)
    await addContract(4_600_000)
    await database().players.add(
      playerSchema.parse({
        id: 'player-a',
        campaignId: 'campaign-a',
        clubId: 'club-a',
        name: 'Amina Cole',
        positionGroup: 'MID',
        positions: ['CM'],
        nationalityCode: null,
        birthDate: null,
        reportedAge: 24,
        ageReferenceSeasonOrdinal: 1,
        marketValueCents: null,
        attributes: {},
        potential: null,
        source: 'fictional',
        externalSourceId: null,
        isNewgen: false,
      }),
    )
    const { unmount } = await finance()
    expect(kpi('Transfer capacity')).toBe('€5,000,000.00')
    const pyramid = screen.getByRole('table', { name: 'Wage pyramid' })
    const keyRow = within(pyramid).getByRole('row', { name: /Key/ })
    expect(within(keyRow).getByText('Blocked')).toBeInTheDocument()
    expect(within(keyRow).getByText('€46,000.00')).toBeInTheDocument()
    expect(within(keyRow).getByText('Cap €45,000.00')).toBeInTheDocument()
    expect(within(pyramid).getAllByRole('row')).toHaveLength(5)
    unmount()
    renderAt('/app/campaign-a/squad')
    const player = await screen.findByRole('button', {
      name: 'Select Amina Cole',
    })
    const row = player.closest('tr')!
    const cells = within(row).getAllByRole('cell')
    const headers = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent)
    const wageIndex = headers.findIndex((header) => /wage/i.test(header ?? ''))
    expect(wageIndex).toBeGreaterThanOrEqual(0)
    expect(cells[wageIndex]).toHaveTextContent(/^Unknown$/)
    expect(screen.queryByText('€46,000.00')).toBeNull()
  })
  it('blocks a null wage and leaves it Unknown, while disabled caps show no blocker', async () => {
    await createCampaign(database(), presetInput)
    await addContract(null)
    const { unmount } = await finance()
    const keyRow = within(
      screen.getByRole('table', { name: 'Wage pyramid' }),
    ).getByRole('row', { name: /Key/ })
    expect(within(keyRow).getByText('Unknown')).toBeInTheDocument()
    expect(within(keyRow).getByText('Blocked')).toBeInTheDocument()
    unmount()
    await saveConstitution(database(), {
      campaignId: 'campaign-a',
      constitutionId: 'custom',
      expectedRevision: 1,
      now: harborInput.now,
      auditEventId: 'audit-custom',
      actionId: 'action-custom',
      ledgerEntryId: 'unused',
      effectiveOn: '2026-10-19',
      rules: constitutionPreset('custom'),
    })
    await finance()
    expect(screen.queryByText('Blocked')).toBeNull()
    expect(screen.getAllByText('Cap not set')).toHaveLength(4)
    expect(kpi('Weekly wages')).toBe('Unknown')
  })
  it('posts prize income, cancels a reversal with Escape, and reverses it with a note', async () => {
    await createCampaign(database(), presetInput)
    await finance()
    fireEvent.change(screen.getByLabelText('Prize amount'), {
      target: { value: '1000000' },
    })
    fireEvent.change(screen.getByLabelText('Effective date'), {
      target: { value: '2026-10-19' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post prize income' }))
    expect(await screen.findByText('Posted prize income.')).toBeInTheDocument()
    await waitFor(() => expect(kpi('Transfer capacity')).toBe('€6,000,000.00'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Reverse Prize income' }),
    )
    fireEvent.keyDown(screen.getByLabelText('Reversal note'), { key: 'Escape' })
    expect(screen.queryByLabelText('Reversal note')).toBeNull()
    expect(await database().ledgerEntries.count()).toBe(2)
    fireEvent.click(
      screen.getByRole('button', { name: 'Reverse Prize income' }),
    )
    fireEvent.change(screen.getByLabelText('Reversal note'), {
      target: { value: 'Correction' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reverse entry' }))
    expect(
      await screen.findByText('Reversed ledger entry.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(kpi('Transfer capacity')).toBe('€5,000,000.00'))
    expect(
      screen.queryByRole('button', { name: 'Reverse Prize income' }),
    ).toBeNull()
    expect(await database().ledgerEntries.count()).toBe(3)
  })
  it('does not call the prize command for invalid money', async () => {
    await createCampaign(database(), presetInput)
    const post = vi.spyOn(ledgerCommands, 'postLedgerEntry')
    await finance()
    fireEvent.change(screen.getByLabelText('Prize amount'), {
      target: { value: '1.001' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post prize income' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      invalidMoneyMessage,
    )
    expect(post).not.toHaveBeenCalled()
  })
  it('adopts Balanced, reloads version 1, rejects invalid money, and saves a new version without changing the allocation', async () => {
    await createCampaign(database(), harborInput)
    const { unmount } = renderAt('/app/campaign-a/constitution')
    await screen.findByRole('heading', { name: 'Choose a constitution' })
    expect(screen.getByLabelText('Preset')).toHaveValue('balanced')
    expect(screen.queryByText(previewBanner)).toBeNull()
    expect(screen.queryByText('Rules are not active in this build.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save constitution' }))
    expect(
      await screen.findByText('Saved constitution version 1.'),
    ).toBeInTheDocument()
    unmount()
    renderAt('/app/campaign-a/constitution')
    await screen.findByText('Version 1')
    expect(
      screen.getByText(
        'Registration checks are saved here and are not enforced in this build.',
      ),
    ).toBeInTheDocument()
    const save = vi.spyOn(constitutionCommands, 'saveConstitution')
    fireEvent.change(screen.getByLabelText('Key cap'), {
      target: { value: 'invalid' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save constitution' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      invalidMoneyMessage,
    )
    expect(save).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Key cap'), {
      target: { value: '46000' },
    })
    fireEvent.change(screen.getByLabelText('Opening allocation'), {
      target: { value: '6000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save constitution' }))
    expect(
      await screen.findByText('Saved constitution version 2.'),
    ).toBeInTheDocument()
    expect(await database().ledgerEntries.count()).toBe(1)
    expect(
      (await getActiveConstitution(database(), id('campaign-a')))?.version,
    ).toBe(2)
    cleanup()
    await finance()
    expect(kpi('Transfer capacity')).toBe('€5,000,000.00')
    expect(
      screen.getByText(
        'Opening allocation does not match the constitution. Capacity uses the ledger.',
      ),
    ).toBeInTheDocument()
  })
  it('does not carry a constitution success message into another campaign', async () => {
    await createCampaign(database(), harborInput)
    await createCampaign(database(), {
      ...harborInput,
      campaignId: 'campaign-b',
      clubId: 'club-b',
      seasonId: 'season-b',
      auditEventId: 'audit-b',
      actionId: 'action-b',
    })
    const { router } = renderAt('/app/campaign-a/constitution')
    await screen.findByRole('heading', { name: 'Choose a constitution' })
    fireEvent.click(screen.getByRole('button', { name: 'Save constitution' }))
    await screen.findByText('Saved constitution version 1.')
    await act(async () => {
      await router.navigate('/app/campaign-b/constitution')
    })
    await screen.findByRole('heading', { name: 'Choose a constitution' })
    expect(screen.queryByText('Saved constitution version 1.')).toBeNull()
    expect(
      await getActiveConstitution(database(), id('campaign-b')),
    ).toBeUndefined()
  })

  it('maps stale constitution saves to the reload sentence and keeps the form', async () => {
    await createCampaign(database(), presetInput)
    renderAt('/app/campaign-a/constitution')
    await screen.findByText('Version 1')
    await database().campaigns.update(id('campaign-a'), { revision: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Save constitution' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(staleSave)
    expect(await database().constitutions.count()).toBe(1)
  })
  it.each([
    ['finance', financeFailed],
    ['constitution', constitutionFailed],
  ])(
    'shows the %s failure sentence without an active season',
    async (path, message) => {
      await createCampaign(database(), harborInput)
      await database().seasons.delete(id('season-a'))
      renderAt(`/app/campaign-a/${path}`)
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    },
  )
  it('keeps the preview banner on Transfers', async () => {
    await createCampaign(database(), harborInput)
    renderAt('/app/campaign-a/transfers')
    expect(await screen.findByText(previewBanner)).toBeInTheDocument()
  })
})
