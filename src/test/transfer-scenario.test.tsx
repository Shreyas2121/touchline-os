import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { previewBanner } from '../app/copy'
import { createCampaign } from '../data/commands/create-campaign'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { previewOutgoingSale } from '../domain/finance/preview'
import { entityIdSchema, playerSchema } from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
const database = () => getDatabase(databaseName)

afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests(databaseName)
})

describe('outgoing sale preview', () => {
  const snapshot = { revision: 4, remainingCapacityCents: 500_000_000 }
  const input = {
    feeCents: 1_000_000_000,
    salesReinvestmentPct: 70,
    snapshot,
    wages: { knownCents: 0, unknownCount: 0 },
    activeWageCents: null,
  }

  it('credits 70 percent of the fee and does not block the sale', () => {
    expect(previewOutgoingSale(input)).toMatchObject({
      afterCapacity: '€12,000,000.00',
      report: { allowed: true, verdicts: [], snapshotRevision: 4 },
    })
  })

  it('keeps capacity unknown when the snapshot has no remaining figure', () => {
    expect(
      previewOutgoingSale({
        ...input,
        snapshot: { ...snapshot, remainingCapacityCents: null },
      }).afterCapacity,
    ).toBe('Unknown')
  })

  it('keeps wages unknown without an active wage and subtracts a known wage', () => {
    expect(previewOutgoingSale(input).afterWages).toBe('Unknown')
    expect(
      previewOutgoingSale({
        ...input,
        wages: { knownCents: 5_000_000, unknownCount: 0 },
        activeWageCents: 1_000_000,
      }).afterWages,
    ).toBe('€40,000.00')
  })
})

async function addPlayer(name: string, birthDate: string | null) {
  await database().players.add(
    playerSchema.parse({
      id: 'player-a',
      campaignId: 'campaign-a',
      clubId: 'club-a',
      name,
      positionGroup: 'MID',
      positions: ['CM'],
      nationalityCode: null,
      birthDate,
      reportedAge: null,
      ageReferenceSeasonOrdinal: null,
      marketValueCents: null,
      attributes: {},
      potential: null,
      source: 'fictional',
      externalSourceId: null,
      isNewgen: false,
    }),
  )
}

describe('transfer scenario screen', () => {
  it('shortlists a searched player and keeps that player at the same club', async () => {
    await createCampaign(database(), harborInput)
    await addPlayer('Ada Moss', null)
    const { router } = renderAt('/app/campaign-a/transfers')
    const search = await screen.findByLabelText('Player search')
    fireEvent.change(search, { target: { value: 'a' } })
    expect(
      screen.getByText('Search the player pool to plan a move.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add to shortlist' }),
    ).toBeNull()
    fireEvent.change(search, { target: { value: 'ad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to shortlist' }))
    expect(
      await screen.findByRole('button', { name: 'On the shortlist' }),
    ).toBeDisabled()
    await act(async () => {
      await router.navigate('/app/campaign-a/squad')
    })
    await screen.findByRole('heading', { name: 'Squad' })
    await act(async () => {
      await router.navigate('/app/campaign-a/transfers')
    })
    fireEvent.change(await screen.findByLabelText('Player search'), {
      target: { value: 'ad' },
    })
    expect(
      await screen.findByRole('button', { name: 'On the shortlist' }),
    ).toBeInTheDocument()
    expect(
      (await database().players.get(entityIdSchema.parse('player-a')))?.clubId,
    ).toBe('club-a')
  })

  it('blocks an incoming fee above capacity and does not record it', async () => {
    await createCampaign(database(), {
      ...harborInput,
      preset: 'balanced',
      constitutionId: 'constitution-a',
      constitutionActionId: 'constitution-action',
      ledgerEntryId: 'opening',
    })
    await addPlayer('Nia Costa', '2002-01-01')
    const ledger = await database().ledgerEntries.count()
    renderAt('/app/campaign-a/transfers')
    fireEvent.change(await screen.findByLabelText('Player search'), {
      target: { value: 'ni' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add to shortlist' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Preview scenario' }),
    )
    const scenario = screen.getByRole('region', { name: 'Scenario' })
    fireEvent.change(within(scenario).getByLabelText('Fee'), {
      target: { value: '6000000' },
    })
    fireEvent.change(within(scenario).getByLabelText('Weekly wage'), {
      target: { value: '10000' },
    })
    fireEvent.change(within(scenario).getByLabelText('Tier'), {
      target: { value: 'rotation' },
    })
    fireEvent.click(
      within(scenario).getByRole('button', { name: 'Preview scenario' }),
    )
    expect(await screen.findByText('Blocked')).toBeInTheDocument()
    expect(
      screen.getByText('The fee is above the remaining transfer capacity.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Preview only — no changes recorded.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Record this transfer' }),
    ).toBeDisabled()
    expect(await database().ledgerEntries.count()).toBe(ledger)
  })

  it('shows the preview banner on Scouting and hides it on Registration', async () => {
    await createCampaign(database(), harborInput)
    const { router } = renderAt('/app/campaign-a/registration')
    await screen.findByRole('heading', { name: 'Registration' })
    expect(screen.queryByText(previewBanner)).toBeNull()
    await act(async () => {
      await router.navigate('/app/campaign-a/transfers')
    })
    await screen.findByRole('heading', { name: 'Transfers' })
    expect(screen.queryByText(previewBanner)).toBeNull()
    await act(async () => {
      await router.navigate('/app/campaign-a/scouting')
    })
    await screen.findByRole('heading', { name: 'Scouting' })
    expect(screen.getByText(previewBanner)).toBeInTheDocument()
  })
})
