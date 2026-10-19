import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { addPlayer } from '../data/commands/add-player'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import {
  entityIdSchema,
  playerSchema,
  lineupSchema,
} from '../domain/validation/schemas'
import { lineupDiscardWarning, previewBanner } from '../app/copy'
import { DatabaseProvider } from '../app/providers/database'
import * as saveCommand from '../data/commands/save-lineup'
import * as deleteCommand from '../data/commands/delete-lineup'
import { staleSave, lineupRosterMismatch } from '../app/copy'
import { TacticsBoard } from '../features/tactics/TacticsBoard'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await deleteDatabaseForTests(databaseName)
})
async function setup() {
  const database = getDatabase(databaseName)
  await createCampaign(database, harborInput)
  for (const [index, name, positionGroup, position] of [
    [0, 'Ada Keeper', 'GK', 'GK'],
    [1, 'Zara Forward', 'FWD', 'ST'],
  ] as const) {
    expect(
      await addPlayer(database, {
        campaignId: 'campaign-a',
        playerId: `player-${index}`,
        expectedRevision: index + 1,
        now: harborInput.now,
        auditEventId: `audit-player-${index}`,
        actionId: `action-player-${index}`,
        clubId: 'club-a',
        name,
        positionGroup,
        positions: [position],
        nationalityCode: null,
        birthDate: null,
        reportedAge: null,
        ageReferenceSeasonOrdinal: null,
        marketValueCents: 1050,
        attributes: {},
        potential: null,
        source: 'fictional',
        externalSourceId: null,
        isNewgen: false,
      }),
    ).toMatchObject({ ok: true })
  }
  return database
}
function roster() {
  return within(screen.getByRole('list', { name: 'Roster' }))
}
function slots() {
  return within(screen.getByRole('group', { name: 'Pitch slots' }))
}
function hold(name: string) {
  fireEvent.click(roster().getByRole('button', { name }))
}
function clickSlot(label: string) {
  fireEvent.click(
    slots().getByRole('button', { name: new RegExp(`^${label},`) }),
  )
}

describe('tactical planning board', () => {
  it('places, moves and drops a hold with Escape without saving or showing money', async () => {
    const database = await setup()
    const { container } = renderAt('/app/campaign-a/tactics')
    await screen.findByRole('list', { name: 'Roster' })
    expect(
      roster()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Ada Keeper', 'Zara Forward'])
    expect(screen.getByLabelText('Formation')).toHaveValue('4-3-3')
    expect(screen.getByText(lineupDiscardWarning)).toBeInTheDocument()
    expect(screen.queryByText(previewBanner)).toBeNull()
    expect(screen.getByRole('button', { name: 'Save lineup' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Delete lineup' })).toBeNull()
    hold('Ada Keeper')
    expect(screen.getByText('Holding Ada Keeper')).toHaveAttribute(
      'aria-live',
      'polite',
    )
    clickSlot('GK')
    expect(screen.queryByText('Holding Ada Keeper')).toBeNull()
    expect(
      slots().getByRole('button', { name: 'GK, Ada Keeper, Position fit' }),
    ).toBeInTheDocument()
    hold('Ada Keeper')
    clickSlot('ST')
    expect(
      slots().getByRole('button', { name: 'GK, empty' }),
    ).toBeInTheDocument()
    expect(
      slots().getByRole('button', {
        name: 'ST, Ada Keeper, Different position',
      }),
    ).toBeInTheDocument()
    hold('Zara Forward')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Holding Zara Forward')).toBeNull()
    expect(
      slots().getByRole('button', {
        name: 'ST, Ada Keeper, Different position',
      }),
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain('€')
    expect(await database.lineups.toArray()).toEqual([])
  })
  it('unassigns an occupied slot and clears a slot without picking its occupant up', async () => {
    const database = await setup()
    renderAt('/app/campaign-a/tactics')
    await screen.findByRole('list', { name: 'Roster' })
    hold('Ada Keeper')
    clickSlot('ST')
    hold('Zara Forward')
    clickSlot('ST')
    expect(
      slots().getByRole('button', { name: 'ST, Zara Forward, Position fit' }),
    ).toBeInTheDocument()
    expect(slots().queryByRole('button', { name: /Ada Keeper/ })).toBeNull()
    expect(
      within(screen.getByRole('list', { name: 'Bench' })).queryAllByRole(
        'listitem',
      ),
    ).toEqual([])
    clickSlot('GK')
    expect(screen.getByRole('button', { name: 'Clear slot' })).toBeDisabled()
    clickSlot('ST')
    expect(screen.queryByText(/^Holding /)).toBeNull()
    expect(
      slots().getByRole('button', { name: 'ST, Zara Forward, Position fit' }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
    expect(
      slots().getByRole('button', { name: 'ST, empty' }),
    ).toBeInTheDocument()
    expect(await database.lineups.count()).toBe(0)
  })
  it('benches players only once, keeps the bench on formation changes, and clears starters', async () => {
    await setup()
    renderAt('/app/campaign-a/tactics')
    await screen.findByRole('list', { name: 'Roster' })
    hold('Ada Keeper')
    clickSlot('GK')
    hold('Ada Keeper')
    fireEvent.click(screen.getByRole('button', { name: 'Send to bench' }))
    expect(
      slots().getByRole('button', { name: 'GK, empty' }),
    ).toBeInTheDocument()
    hold('Ada Keeper')
    fireEvent.click(screen.getByRole('button', { name: 'Send to bench' }))
    const bench = within(screen.getByRole('list', { name: 'Bench' }))
    expect(bench.getAllByRole('listitem')).toHaveLength(1)
    hold('Zara Forward')
    clickSlot('ST')
    fireEvent.change(screen.getByLabelText('Formation'), {
      target: { value: '4-4-2' },
    })
    expect(screen.getByText('Starting slots were cleared.')).toBeInTheDocument()
    expect(bench.getByText('Ada Keeper')).toBeInTheDocument()
    expect(slots().getAllByRole('button', { name: /, empty$/ })).toHaveLength(
      11,
    )
    expect(slots().queryByRole('button', { name: /^ST,/ })).toBeNull()
    expect(
      slots().getByRole('button', { name: 'RST, empty' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to bench' })).toBeDisabled()
  })
  it('refuses a thirteenth bench player and exposes unknown position fit', async () => {
    const players = Array.from({ length: 13 }, (_, index) =>
      playerSchema.parse({
        id: `player-${index}`,
        campaignId: 'campaign-a',
        clubId: 'club-a',
        name: `Player ${index + 1}`,
        positionGroup: 'UNKNOWN',
        positions: ['UNKNOWN'],
        nationalityCode: null,
        birthDate: null,
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
    render(
      <DatabaseProvider name={databaseName}>
        <TacticsBoard
          players={players}
          campaignId={entityIdSchema.parse('campaign-a')}
          initialRevision={0}
        />
      </DatabaseProvider>,
    )
    await screen.findByRole('list', { name: 'Roster' })
    hold('Player 13')
    clickSlot('GK')
    expect(
      slots().getByRole('button', { name: 'GK, Player 13, Unknown position' }),
    ).toBeInTheDocument()
    for (let index = 1; index <= 12; index++) {
      hold(`Player ${index}`)
      fireEvent.click(screen.getByRole('button', { name: 'Send to bench' }))
    }
    hold('Player 13')
    fireEvent.click(screen.getByRole('button', { name: 'Send to bench' }))
    expect(screen.getByRole('status')).toHaveTextContent('The bench is full.')
    expect(screen.queryByText('Holding Player 13')).toBeNull()
    expect(
      slots().getByRole('button', { name: 'GK, Player 13, Unknown position' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Bench' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(12)
    hold('Player 1')
    clickSlot('ST')
    expect(
      within(screen.getByRole('list', { name: 'Bench' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(11)
  })
  it('loads only the managed club roster and resets its state across campaigns and remounts', async () => {
    const database = await setup()
    await createCampaign(database, {
      ...harborInput,
      campaignId: 'campaign-b',
      clubId: 'club-b',
      seasonId: 'season-b',
      auditEventId: 'audit-b',
      actionId: 'action-b',
    })
    const player = (await database.players.get(
      entityIdSchema.parse('player-0'),
    ))!
    await database.players.add({
      ...player,
      id: entityIdSchema.parse('foreign'),
      campaignId: entityIdSchema.parse('campaign-b'),
      clubId: entityIdSchema.parse('club-b'),
      name: 'Foreign player',
    })
    await database.players.add({
      ...player,
      id: entityIdSchema.parse('free'),
      clubId: null,
      name: 'Free agent',
    })
    const { router, unmount } = renderAt('/app/campaign-a/tactics')
    await screen.findByRole('list', { name: 'Roster' })
    expect(
      roster().queryByRole('button', { name: 'Foreign player' }),
    ).toBeNull()
    expect(roster().queryByRole('button', { name: 'Free agent' })).toBeNull()
    hold('Ada Keeper')
    clickSlot('GK')
    await router.navigate('/app/campaign-b/tactics')
    await screen.findByRole('button', { name: 'Foreign player' })
    expect(slots().getAllByRole('button', { name: /, empty$/ })).toHaveLength(
      11,
    )
    expect(roster().queryByRole('button', { name: 'Ada Keeper' })).toBeNull()
    unmount()
    renderAt('/app/campaign-a/tactics')
    await screen.findByRole('button', { name: 'Ada Keeper' })
    expect(slots().getAllByRole('button', { name: /, empty$/ })).toHaveLength(
      11,
    )
    expect(await database.lineups.toArray()).toEqual([])
  })
})

describe('saved lineup controls', () => {
  function setName(name: string) {
    fireEvent.change(screen.getByLabelText('Lineup name'), {
      target: { value: name },
    })
  }
  async function saveNamed(name: string) {
    setName(name)
    fireEvent.click(screen.getByRole('button', { name: 'Save lineup' }))
    await screen.findByText(`Saved lineup ${name}.`)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save lineup' })).toBeEnabled(),
    )
  }
  function chooseSaved(name: string) {
    const option = screen.getByRole('option', { name }) as HTMLOptionElement
    fireEvent.change(screen.getByLabelText('Saved lineups'), {
      target: { value: option.value },
    })
  }
  it('persists two lineups, discards changes on switching, and deletes only the confirmed lineup', async () => {
    const database = await setup()
    const { unmount } = renderAt('/app/campaign-a/tactics')
    await screen.findByRole('list', { name: 'Roster' })
    hold('Ada Keeper')
    clickSlot('GK')
    await saveNamed('League XI')
    fireEvent.click(screen.getByRole('button', { name: 'New lineup' }))
    expect(slots().getAllByRole('button', { name: /, empty$/ })).toHaveLength(
      11,
    )
    expect(screen.queryByRole('button', { name: 'Delete lineup' })).toBeNull()
    hold('Zara Forward')
    clickSlot('ST')
    await saveNamed('Cup Rotation')
    expect(await database.lineups.count()).toBe(2)
    setName('Unsaved name')
    fireEvent.change(screen.getByLabelText('Formation'), {
      target: { value: '4-4-2' },
    })
    chooseSaved('League XI')
    expect(screen.getByLabelText('Lineup name')).toHaveValue('League XI')
    expect(screen.getByLabelText('Formation')).toHaveValue('4-3-3')
    expect(
      slots().getByRole('button', { name: 'GK, Ada Keeper, Position fit' }),
    ).toBeInTheDocument()
    chooseSaved('Cup Rotation')
    expect(
      slots().getByRole('button', { name: 'ST, Zara Forward, Position fit' }),
    ).toBeInTheDocument()
    const deletion = vi.spyOn(deleteCommand, 'deleteLineup')
    fireEvent.click(screen.getByRole('button', { name: 'Delete lineup' }))
    expect(
      screen.getByRole('region', { name: 'Delete lineup' }),
    ).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Delete lineup' })).toBeNull()
    expect(deletion).not.toHaveBeenCalled()
    expect(await database.lineups.count()).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Delete lineup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Cup Rotation' }))
    await screen.findByText('Deleted lineup Cup Rotation.')
    expect(screen.queryByRole('option', { name: 'Cup Rotation' })).toBeNull()
    expect(screen.getByLabelText('Lineup name')).toHaveValue('League XI')
    expect(await database.lineups.count()).toBe(1)
    unmount()
    renderAt('/app/campaign-a/tactics')
    await screen.findByRole('list', { name: 'Roster' })
    expect(screen.getByLabelText('Lineup name')).toHaveValue('League XI')
    expect(
      slots().getByRole('button', { name: 'GK, Ada Keeper, Position fit' }),
    ).toBeInTheDocument()
  })
  it('loads the newest lineup and disables saving an invalid stored roster', async () => {
    const database = await setup()
    await database.lineups.add(
      lineupSchema.parse({
        id: 'invalid',
        campaignId: 'campaign-a',
        seasonId: 'season-a',
        name: 'Invalid stored lineup',
        formation: '4-3-3',
        starters: [
          { playerId: 'player-0', slot: 'gk', role: null },
          { playerId: 'player-0', slot: 'st', role: null },
        ],
        benchPlayerIds: [],
        updatedAt: harborInput.now,
      }),
    )
    renderAt('/app/campaign-a/tactics')
    await screen.findByRole('list', { name: 'Roster' })
    expect(screen.getByLabelText('Lineup name')).toHaveValue(
      'Invalid stored lineup',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(lineupRosterMismatch)
    expect(screen.getByRole('button', { name: 'Save lineup' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Formation'), {
      target: { value: '4-4-2' },
    })
    await saveNamed('Corrected XI')
    expect(await database.lineups.count()).toBe(1)
    expect(
      await database.lineups.get(entityIdSchema.parse('invalid')),
    ).toMatchObject({ name: 'Corrected XI', starters: [] })
  })
  it('disables controls during save and reuses the same new id after a failed attempt', async () => {
    const database = await setup()
    renderAt('/app/campaign-a/tactics')
    await screen.findByRole('list', { name: 'Roster' })
    let release!: () => void
    const save = vi.spyOn(saveCommand, 'saveLineup').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: false,
              code: 'ABORTED',
              message: 'Command did not finish.',
            })
        }),
    )
    setName('League XI')
    fireEvent.click(screen.getByRole('button', { name: 'Save lineup' }))
    expect(screen.getByRole('button', { name: 'Save lineup' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'New lineup' })).toBeDisabled()
    release()
    await screen.findByRole('alert')
    expect(save).toHaveBeenCalledTimes(1)
    expect(await database.lineups.count()).toBe(0)
    await saveNamed('League XI')
    expect(save).toHaveBeenCalledTimes(2)
    const firstInput = save.mock.calls[0][1] as { lineupId: string }
    const nextInput = save.mock.calls[1][1] as { lineupId: string }
    expect(nextInput.lineupId).toBe(firstInput.lineupId)
    expect(await database.lineups.count()).toBe(1)
  })
  it('shows stale-save failures for save and delete without retrying either command', async () => {
    const database = await setup()
    await database.lineups.add(
      lineupSchema.parse({
        id: 'saved',
        campaignId: 'campaign-a',
        seasonId: 'season-a',
        name: 'League XI',
        formation: '4-3-3',
        starters: [],
        benchPlayerIds: [],
        updatedAt: harborInput.now,
      }),
    )
    renderAt('/app/campaign-a/tactics')
    await screen.findByRole('list', { name: 'Roster' })
    await database.campaigns.update(entityIdSchema.parse('campaign-a'), {
      revision: 4,
    })
    const save = vi.spyOn(saveCommand, 'saveLineup')
    const deletion = vi.spyOn(deleteCommand, 'deleteLineup')
    setName('Stale change')
    fireEvent.click(screen.getByRole('button', { name: 'Save lineup' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(staleSave)
    expect(save).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Delete lineup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete League XI' }))
    await waitFor(() => expect(deletion).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(staleSave),
    )
    expect(
      await database.lineups.get(entityIdSchema.parse('saved')),
    ).toMatchObject({ name: 'League XI' })
    expect(await database.lineups.count()).toBe(1)
  })
})
