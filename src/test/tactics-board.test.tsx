import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { addPlayer } from '../data/commands/add-player'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { entityIdSchema, playerSchema } from '../domain/validation/schemas'
import { lineupOnScreenOnly, previewBanner } from '../app/copy'
import { TacticsBoard } from '../features/tactics/TacticsBoard'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
afterEach(async () => {
  cleanup()
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
    expect(screen.getByText(lineupOnScreenOnly)).toBeInTheDocument()
    expect(screen.getByText(previewBanner)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save|delete/i })).toBeNull()
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
  it('refuses a thirteenth bench player and exposes unknown position fit', () => {
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
    render(<TacticsBoard players={players} />)
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
