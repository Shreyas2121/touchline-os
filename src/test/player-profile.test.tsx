import {
  cleanup,
  fireEvent,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import * as correctionCommand from '../data/commands/update-player'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { playerSchema, entityIdSchema } from '../domain/validation/schemas'
import { invalidDateMessage } from '../domain/models/dates'
import { invalidMoneyMessage } from '../domain/models/money'
import { staleSave } from '../app/copy'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'
const databaseName = 'touchline-os-test'
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await deleteDatabaseForTests(databaseName)
})
async function setup(attributes: Record<string, number> = { passing: 70 }) {
  const database = getDatabase(databaseName)
  await createCampaign(database, harborInput)
  await database.players.add(
    playerSchema.parse({
      id: 'player-a',
      campaignId: 'campaign-a',
      clubId: 'club-a',
      name: 'Amina Cole',
      positionGroup: 'MID',
      positions: ['CM', 'CAM'],
      nationalityCode: null,
      birthDate: null,
      reportedAge: 21,
      ageReferenceSeasonOrdinal: 1,
      marketValueCents: 1050,
      attributes,
      potential: null,
      source: 'fictional',
      externalSourceId: null,
      isNewgen: false,
    }),
  )
  const rendered = renderAt('/app/campaign-a/squad')
  fireEvent.click(
    await screen.findByRole('button', { name: 'Select Amina Cole' }),
  )
  await screen.findByLabelText('Development notes')
  return { database, ...rendered }
}
function profile() {
  return within(screen.getByRole('region', { name: 'Selected player' }))
}
function change(label: string, value: string) {
  fireEvent.change(profile().getByLabelText(label, { exact: true }), {
    target: { value },
  })
}
function attribute(label: string) {
  return within(profile().getByLabelText('Attributes')).getByText(label)
    .nextElementSibling
}
describe('player profile', () => {
  it('shows identity, missing attributes and honest source and contract copy', async () => {
    await setup()
    expect(
      profile().getByRole('button', { name: 'Save contract' }),
    ).toBeInTheDocument()
    expect(
      profile().getByText(
        'Source stays Fictional. This correction is recorded in activity.',
      ),
    ).toBeInTheDocument()
    expect(profile().getByText('No birth date recorded.')).toBeInTheDocument()
    expect(attribute('Pace')).toHaveTextContent(/^Missing$/)
    expect(attribute('Passing')).toHaveTextContent(/^70$/)
    expect(
      profile().getByText('No individual history for this player.'),
    ).toBeInTheDocument()
    expect(profile().queryByRole('button', { name: 'Shortlist' })).toBeNull()
    expect(profile().queryByRole('button', { name: 'Compare' })).toBeNull()
    expect(profile().queryByText('Newgen', { exact: true })).toBeNull()
    for (const label of ['Wage', 'Minutes', 'Club', 'Source'])
      expect(profile().queryByLabelText(label)).toBeNull()
  })
  it('preserves zero attributes and persists a development note without submitting correction fields', async () => {
    const { database, unmount } = await setup({ pace: 0, passing: 70 })
    expect(attribute('Pace')).toHaveTextContent(/^0$/)
    change('Name', 'Unsaved correction')
    change('Pace', '80')
    change('Development notes', 'Hold the ball')
    change('Target role', ' Playmaker ')
    fireEvent.click(profile().getByRole('button', { name: 'Save note' }))
    expect(
      await screen.findByText('Development note saved.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(profile().getByLabelText('Development notes')).toHaveValue(
        'Hold the ball',
      ),
    )
    const player = await database.players.get(entityIdSchema.parse('player-a'))
    expect(player).toMatchObject({
      name: 'Amina Cole',
      attributes: { pace: 0, passing: 70 },
    })
    expect(await database.developmentPlans.count()).toBe(1)
    change('Development notes', 'Keep possession')
    fireEvent.click(profile().getByRole('button', { name: 'Save note' }))
    await waitFor(async () =>
      expect((await database.developmentPlans.toArray())[0].notes).toBe(
        'Keep possession',
      ),
    )
    expect(await database.developmentPlans.count()).toBe(1)
    unmount()
    renderAt('/app/campaign-a/squad')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select Amina Cole' }),
    )
    await waitFor(() =>
      expect(profile().getByLabelText('Development notes')).toHaveValue(
        'Keep possession',
      ),
    )
    expect(profile().getByLabelText('Target role')).toHaveValue('Playmaker')
    expect(attribute('Pace')).toHaveTextContent(/^0$/)
  })
  it('saves a correction, refreshes the row and profile, and keeps blank fields unknown', async () => {
    const { database, unmount } = await setup({ pace: 0 })
    change('Name', 'Amina Updated')
    change('Position', 'CB')
    change('Nationality', ' gb ')
    change('Market value', '')
    change('Pace', '')
    change('Potential', '')
    fireEvent.click(profile().getByRole('button', { name: 'Save player' }))
    expect(await screen.findByText('Player updated.')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Select Amina Updated' })
    expect(
      profile().getByRole('heading', { name: 'Amina Updated' }),
    ).toBeInTheDocument()
    expect(attribute('Pace')).toHaveTextContent(/^Missing$/)
    expect(
      await database.players.get(entityIdSchema.parse('player-a')),
    ).toMatchObject({
      name: 'Amina Updated',
      positions: ['CB'],
      positionGroup: 'DEF',
      nationalityCode: 'GB',
      birthDate: null,
      reportedAge: 21,
      marketValueCents: null,
      attributes: {},
      potential: null,
      source: 'fictional',
      clubId: 'club-a',
    })
    expect(
      await screen.findByText('Updated player Amina Updated'),
    ).toBeInTheDocument()
    // The next command must use the correction's new revision.
    await screen.findByLabelText('Development notes')
    change('Development notes', 'Follow up')
    fireEvent.click(profile().getByRole('button', { name: 'Save note' }))
    await screen.findByText('Development note saved.')
    unmount()
    renderAt('/app/campaign-a/squad')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select Amina Updated' }),
    )
    await waitFor(() =>
      expect(profile().getByLabelText('Development notes')).toHaveValue(
        'Follow up',
      ),
    )
  })
  it.each([
    ['Name', '', 'Enter a player name.'],
    [
      'Nationality',
      'GBR',
      'Enter a two-letter code or leave nationality blank.',
    ],
    ['Birth date', '2026-02-30', invalidDateMessage],
    ['Reported age', '100', 'Enter an age from 0 to 99, or leave it blank.'],
    ['Reported age', '1.5', 'Enter an age from 0 to 99, or leave it blank.'],
    ['Market value', '12.345', invalidMoneyMessage],
    ['Pace', '-1', 'Enter a rating from 0 to 100, or leave it blank.'],
    ['Potential', '101', 'Enter a rating from 0 to 100, or leave it blank.'],
  ])(
    'blocks an invalid %s before calling the command',
    async (label, value, message) => {
      await setup()
      const command = vi.spyOn(correctionCommand, 'updatePlayer')
      change(label, value)
      fireEvent.click(profile().getByRole('button', { name: 'Save player' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(command).not.toHaveBeenCalled()
    },
  )
  it('shows conflicts for either form and does not retry or overwrite newer data', async () => {
    const { database } = await setup()
    await database.campaigns.update(entityIdSchema.parse('campaign-a'), {
      revision: 2,
    })
    const command = vi.spyOn(correctionCommand, 'updatePlayer')
    change('Name', 'Stale correction')
    fireEvent.click(profile().getByRole('button', { name: 'Save player' }))
    await waitFor(() =>
      expect(
        within(
          profile().getByRole('form', { name: 'Player correction' }),
        ).getByRole('alert'),
      ).toHaveTextContent(staleSave),
    )
    expect(command).toHaveBeenCalledTimes(1)
    change('Development notes', 'Stale note')
    fireEvent.click(profile().getByRole('button', { name: 'Save note' }))
    await waitFor(() =>
      expect(
        within(
          profile().getByRole('form', { name: 'Development note' }),
        ).getByRole('alert'),
      ).toHaveTextContent(staleSave),
    )
    expect(
      await database.players.get(entityIdSchema.parse('player-a')),
    ).toMatchObject({ name: 'Amina Cole' })
    expect(await database.developmentPlans.count()).toBe(0)
    expect(await database.auditEvents.count()).toBe(1)
  })
  it('disables Save player during its command and can save zero ratings and cleared age', async () => {
    await setup()
    const original = correctionCommand.updatePlayer
    let release!: () => void
    vi.spyOn(correctionCommand, 'updatePlayer').mockImplementation(
      async (database, input) => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return original(database, input)
      },
    )
    change('Reported age', '')
    change('Pace', '0')
    change('Potential', '0')
    fireEvent.click(profile().getByRole('button', { name: 'Save player' }))
    expect(
      profile().getByRole('button', { name: 'Save player' }),
    ).toBeDisabled()
    release()
    await screen.findByText('Player updated.')
    expect(
      await getDatabase(databaseName).players.get(
        entityIdSchema.parse('player-a'),
      ),
    ).toMatchObject({
      reportedAge: null,
      ageReferenceSeasonOrdinal: null,
      attributes: { pace: 0 },
      potential: 0,
    })
  })
})
