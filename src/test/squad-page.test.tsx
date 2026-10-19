import {
  cleanup,
  fireEvent,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { addPlayer } from '../data/commands/add-player'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { entityIdSchema } from '../domain/validation/schemas'
import * as playerRepository from '../data/repositories/players'
import {
  previewBanner,
  noRecords,
  squadFailed,
  loadingSquad,
} from '../app/copy'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'
const databaseName = 'touchline-os-test'
const otherInput = {
  ...harborInput,
  campaignId: 'campaign-b',
  clubId: 'club-b',
  seasonId: 'season-b',
  auditEventId: 'audit-b',
  actionId: 'action-b',
  name: 'Other campaign',
}
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await deleteDatabaseForTests(databaseName)
})
async function add(
  id: string,
  name: string,
  campaignId: string,
  clubId: string | null,
  expectedRevision: number,
  value: number | null = null,
) {
  const result = await addPlayer(getDatabase(databaseName), {
    campaignId,
    playerId: id,
    expectedRevision: expectedRevision + 1,
    now: harborInput.now,
    auditEventId: `audit-${id}`,
    actionId: `action-${id}`,
    clubId,
    name,
    positionGroup: 'MID',
    positions: ['CM'],
    nationalityCode: null,
    birthDate: null,
    reportedAge: 21,
    ageReferenceSeasonOrdinal: 1,
    marketValueCents: value,
    attributes: {},
    potential: null,
    source: 'user-entered',
    externalSourceId: null,
    isNewgen: false,
  })
  expect(result.ok).toBe(true)
}
async function setup() {
  const database = getDatabase(databaseName)
  await createCampaign(database, harborInput)
  await createCampaign(database, otherInput)
  await add('ash', 'Ashbridge', 'campaign-a', 'club-a', 0, 1050)
  await add('wind', 'Windgate', 'campaign-a', 'club-a', 1)
  await add('free', 'Free agent', 'campaign-a', null, 2)
  await add('other', 'Other player', 'campaign-b', 'club-b', 0)
  return database
}
describe('squad page', () => {
  it('shows only the managed roster, honest unknowns, and player selection', async () => {
    await setup()
    renderAt('/app/campaign-a/squad')
    const ash = await screen.findByRole('button', { name: 'Select Ashbridge' })
    expect(
      screen.getByRole('button', { name: 'Select Windgate' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Other player')).toBeNull()
    expect(screen.queryByText('Free agent')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Selected player' })).toBeNull()
    const cells = within(ash.closest('tr')!).getAllByRole('cell')
    for (const index of [3, 5, 6, 7])
      expect(cells[index]).toHaveTextContent(/^Unknown$/)
    expect(cells[4]).toHaveTextContent('€10.50')
    const wind = screen.getByRole('button', { name: 'Select Windgate' })
    expect(
      within(wind.closest('tr')!).getAllByRole('cell')[4],
    ).toHaveTextContent(/^Unknown$/)
    fireEvent.click(ash)
    expect(ash).toHaveAttribute('aria-pressed', 'true')
    expect(wind).toHaveAttribute('aria-pressed', 'false')
    expect(
      within(screen.getByRole('region', { name: 'Selected player' })).getByText(
        'Contracts are not recorded in this build.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(previewBanner)).toBeNull()
    expect(screen.queryByText(noRecords)).toBeNull()
  })
  it('searches, filters and sorts with accessible header state', async () => {
    await setup()
    renderAt('/app/campaign-a/squad')
    await screen.findByRole('button', { name: 'Select Ashbridge' })
    const names = () =>
      within(screen.getByRole('table', { name: 'Squad' }))
        .queryAllByRole('button', { name: /^Select / })
        .map((button) => button.textContent)
    expect(names()).toEqual(['Ashbridge', 'Windgate'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort by name' }))
    expect(names()).toEqual(['Windgate', 'Ashbridge'])
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Sort by value' }))
      expect(names()).toEqual(['Ashbridge', 'Windgate'])
    }
    fireEvent.change(screen.getByLabelText('Search players'), {
      target: { value: ' ASH ' },
    })
    expect(names()).toEqual(['Ashbridge'])
    fireEvent.change(screen.getByLabelText('Position group'), {
      target: { value: 'GK' },
    })
    expect(
      screen.getByText('No players match this search.'),
    ).toBeInTheDocument()
  })
  it('shows an empty squad for a new club', async () => {
    await createCampaign(getDatabase(databaseName), otherInput)
    renderAt('/app/campaign-b/squad')
    expect(
      await screen.findByText('No players at this club.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(previewBanner)).toBeNull()
  })
  it('shows unknown ages without an active season and empties a missing club', async () => {
    const database = await setup()
    await database.seasons.delete(entityIdSchema.parse('season-a'))
    const { unmount } = renderAt('/app/campaign-a/squad')
    const ash = await screen.findByRole('button', { name: 'Select Ashbridge' })
    expect(
      within(ash.closest('tr')!).getAllByRole('cell')[2],
    ).toHaveTextContent(/^Unknown$/)
    unmount()
    await database.clubs.delete(entityIdSchema.parse('club-a'))
    renderAt('/app/campaign-a/squad')
    expect(
      await screen.findByText('No players at this club.'),
    ).toBeInTheDocument()
  })
  it('resets browser controls and selection when changing campaigns', async () => {
    await setup()
    const { router } = renderAt('/app/campaign-a/squad')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select Ashbridge' }),
    )
    fireEvent.change(screen.getByLabelText('Search players'), {
      target: { value: 'ash' },
    })
    fireEvent.change(screen.getByLabelText('Position group'), {
      target: { value: 'MID' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sort by age' }))
    await router.navigate('/app/campaign-b/squad')
    await screen.findByRole('button', { name: 'Select Other player' })
    expect(screen.getByLabelText('Search players')).toHaveValue('')
    expect(screen.getByLabelText('Position group')).toHaveValue('all')
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    expect(screen.queryByRole('region', { name: 'Selected player' })).toBeNull()
  })
  it('redirects a seeded campaign without a club choice before loading players', async () => {
    await createCampaign(getDatabase(databaseName), {
      ...harborInput,
      seed: 'squad-test',
      generatorVersion: '1',
    })
    const read = vi.spyOn(playerRepository, 'listPlayersByClub')
    const { router } = renderAt('/app/campaign-a/squad')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/app/campaign-a/choose-club',
      ),
    )
    expect(read).not.toHaveBeenCalled()
  })
  it('shows loading while the squad read is pending and an alert on failure', async () => {
    await createCampaign(getDatabase(databaseName), harborInput)
    let fail!: (error: Error) => void
    vi.spyOn(playerRepository, 'listPlayersByClub').mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject
        }),
    )
    renderAt('/app/campaign-a/squad')
    expect(await screen.findByText(loadingSquad)).toBeInTheDocument()
    await waitFor(() => expect(fail).toBeDefined())
    expect(screen.queryByText('No players at this club.')).toBeNull()
    fail(new Error('Read failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent(squadFailed)
  })
})
