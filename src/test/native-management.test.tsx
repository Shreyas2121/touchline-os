import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { NativeRoutes } from '../app/native/NativeWorkspace'
import { createBrowserClient } from '../platform/browser-client'
import type { GameClient } from '../platform/game-client'
import type { CampaignSnapshot } from '../platform/generated/CampaignSnapshot'
import type { ScreenModel } from '../platform/generated/ScreenModel'
import source from '../../compatibility/snapshots/standalone-v2.json'

const snapshot = source as CampaignSnapshot
const campaign = snapshot.tables.campaigns[0]!
function model(): ScreenModel {
  return {
    rows: structuredClone(snapshot.tables),
    revision: campaign.revision,
    totals: { players: 1, registrations: 1 },
    page: 0,
    playerFacts: [],
    finance: { capacity: '€500.00', wages: 'Unknown', tiers: {} },
    activeConstitution: snapshot.tables.constitutions[0] ?? null,
    reports: [],
    chooseClubRequired: false,
    labels: {},
  }
}
function client(): GameClient {
  return {
    ...createBrowserClient(),
    campaigns: vi
      .fn()
      .mockResolvedValue({ campaigns: [campaign], total: 1, page: 0 }),
    screen: vi.fn().mockResolvedValue(model()),
    planning: vi.fn().mockResolvedValue({
      player: snapshot.tables.players[0]!,
      revision: campaign.revision,
      note: snapshot.tables.developmentPlans[0] ?? null,
      shortlist: snapshot.tables.shortlistItems[0] ?? null,
    }),
    previewCreation: vi.fn().mockResolvedValue({
      clubs: snapshot.tables.clubs,
      leagues: snapshot.tables.leagues,
    }),
    createCareer: vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: 0,
      replayed: false,
      deleted: false,
    }),
    manage: vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision + 1,
      replayed: false,
      deleted: false,
    }),
    previewTime: vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision,
      fromDate: '2026-07-01',
      sourceBoundaryKey: null,
      phase: 'preseason',
      allowed: true,
      targetBoundaryKey: 'season:2026:summer-deadline',
      targetDate: '2026-08-31',
      targetKind: 'summer-deadline',
      nextEvent: 'Summer deadline',
      eventSeed: 1,
      reason: null,
    }),
    advanceTime: vi.fn(),
  }
}
function show(api: GameClient, section?: string) {
  return render(
    <MemoryRouter
      initialEntries={[section ? `/app/${campaign.id}/${section}` : '/']}
    >
      <NativeRoutes client={api} />
    </MemoryRouter>,
  )
}

describe('native management forms', () => {
  it('offers standalone demo creation with its reserved identity and seed', async () => {
    const api = client()
    show(api)
    fireEvent.click(screen.getByRole('button', { name: 'Create career' }))
    fireEvent.change(screen.getByLabelText('Campaign type'), {
      target: { value: 'standalone-demo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview clubs' }))
    await screen.findByLabelText('Managed club')
    fireEvent.click(screen.getByRole('button', { name: 'Start campaign' }))
    await waitFor(() =>
      expect(api.createCareer).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'standalone-demo',
          career: expect.objectContaining({
            campaignId: 'native-standalone-demo',
            seed: 'native-standalone-demo-v2',
          }),
        }),
      ),
    )
  })
  it('keeps every historical route read-only while allowing confirmed deletion', async () => {
    const api = client()
    const historical = model()
    historical.rows.campaigns[0]!.mode = 'legacy'
    historical.rows.campaigns[0]!.rulesMode = 'sandbox'
    historical.rows.campaigns[0]!.id = 'native-legacy-demo'
    api.screen = vi
      .fn()
      .mockResolvedValue({ ...historical, chooseClubRequired: true })
    show(api, 'squad')
    await screen.findByText(/This historical manual save is read-only/)
    for (const label of [
      'Tactics',
      'Registration',
      'Scouting',
      'Constitution',
      'Transfers',
      'Finance',
      'Match Journal',
    ]) {
      fireEvent.click(screen.getByRole('link', { name: label }))
      await screen.findByRole('heading', { name: label, level: 1 })
      expect(
        screen.queryByRole('button', {
          name: /^(Save|Add player|Rename campaign|Archive campaign|Reset this demo|Record|Post prize)/,
        }),
      ).toBeNull()
      expect(screen.queryByLabelText('Campaign name')).toBeNull()
    }
    fireEvent.click(screen.getByRole('link', { name: 'Command Center' }))
    await screen.findByRole('heading', { name: 'Command Center', level: 1 })
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(api.previewTime).not.toHaveBeenCalled()
    expect(api.advanceTime).not.toHaveBeenCalled()
    expect(api.planning).not.toHaveBeenCalled()
    expect(api.manage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }))
    expect(api.manage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await waitFor(() =>
      expect(api.manage).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: 'native-legacy-demo',
          action: { type: 'delete' },
        }),
      ),
    )
  })
  it('loads bounded roster pages before editing and preserves a saved player beyond the first page', async () => {
    const api = client()
    const base = model()
    const roster = Array.from({ length: 51 }, (_, i) => ({
      ...snapshot.tables.players[0]!,
      id: `ui-player-${i}`,
      name: `Roster player ${i}`,
    }))
    base.rows.players = roster.slice(0, 50)
    base.rows.lineups[0]!.starters = [
      { slot: 'CM', playerId: roster[50]!.id, role: null },
    ]
    base.totals = { players: 51, lineups: 1 }
    base.playerFacts = []
    api.screen = vi.fn().mockImplementation(async (query) =>
      query.screen === 'squad'
        ? {
            ...base,
            rows: {
              ...base.rows,
              players: roster.slice(query.page * 50, query.page * 50 + 50),
            },
            page: query.page,
          }
        : base,
    )
    show(api, 'tactics')
    await screen.findByRole('heading', { name: campaign.name })
    fireEvent.change(screen.getByLabelText('Lineup to edit'), {
      target: { value: base.rows.lineups[0]!.id },
    })
    expect(screen.getByRole('button', { name: 'Save lineup' })).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Load complete lineup roster' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save lineup' })).toBeEnabled(),
    )
    expect(screen.getByLabelText('CM player')).toHaveValue(roster[50]!.id)
    fireEvent.click(screen.getByRole('button', { name: 'Save lineup' }))
    await waitFor(() =>
      expect(api.manage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'save-lineup',
            lineup: expect.objectContaining({
              starters: [
                expect.objectContaining({
                  playerId: roster[50]!.id,
                  slot: 'cm',
                }),
              ],
            }),
          }),
        }),
      ),
    )
  })
  it('previews native clubs and creates an explicitly seeded Sandbox career', async () => {
    const api = client()
    show(api)
    fireEvent.click(screen.getByRole('button', { name: 'Create career' }))
    expect(
      within(screen.getByLabelText('Campaign type'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Standalone career', 'Standalone demo'])
    expect(screen.queryByText(/Customize the selected club/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Career name'), {
      target: { value: 'My Sandbox' },
    })
    fireEvent.change(screen.getByLabelText('World seed'), {
      target: { value: 'explicit-native-seed' },
    })
    fireEvent.change(screen.getByLabelText('Rules mode'), {
      target: { value: 'sandbox' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview clubs' }))
    expect(await screen.findByLabelText('Managed club')).toBeInTheDocument()
    expect(api.previewCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'career',
        career: expect.objectContaining({
          seed: 'explicit-native-seed',
          rulesMode: 'sandbox',
          name: 'My Sandbox',
          startYear: 2026,
        }),
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start campaign' }))
    expect(
      await screen.findByRole('heading', { name: campaign.name }),
    ).toBeInTheDocument()
    expect(api.createCareer).toHaveBeenCalledWith(
      expect.objectContaining({
        resetRevision: null,
        career: expect.objectContaining({
          clubKey: 'club:01',
          actionId: expect.any(String),
          auditEventId: expect.any(String),
        }),
      }),
    )
  })
  it('reuses the logical action on retry and refreshes the persisted revision after rename', async () => {
    const api = client()
    let saved = model()
    api.screen = vi.fn().mockImplementation(async () => saved)
    api.manage = vi
      .fn()
      .mockRejectedValueOnce({
        code: 'INTERNAL',
        message: 'Response lost. Retry this action.',
      })
      .mockImplementation(async () => {
        saved = model()
        saved.revision++
        saved.rows.campaigns[0]!.revision = saved.revision
        saved.rows.campaigns[0]!.name = 'Renamed career'
        return {
          campaignId: campaign.id,
          revision: saved.revision,
          replayed: true,
          deleted: false,
        }
      })
    show(api, 'command-center')
    await screen.findByRole('heading', { name: campaign.name })
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Renamed career' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rename campaign' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Response lost')
    fireEvent.click(screen.getByRole('button', { name: 'Rename campaign' }))
    expect(
      await screen.findByRole('heading', { name: 'Renamed career' }),
    ).toBeInTheDocument()
    const calls = vi.mocked(api.manage).mock.calls
    expect(calls[0]![0].actionId).toBe(calls[1]![0].actionId)
    expect(calls[0]![0].expectedRevision).toBe(campaign.revision)
    expect(await screen.findByText(/revision 3/)).toBeInTheDocument()
  })
  it('saves a planning note and shortlist without submitting ownership or attribute changes', async () => {
    const api = client()
    show(api, 'scouting')
    await screen.findByRole('heading', { name: campaign.name })
    fireEvent.change(await screen.findByLabelText('Development notes'), {
      target: { value: 'Work on first touch' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save development note' }),
    )
    await waitFor(() =>
      expect(api.manage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'save-note',
            plan: expect.objectContaining({
              notes: 'Work on first touch',
              playerId: snapshot.tables.players[0]!.id,
            }),
          }),
        }),
      ),
    )
    await screen.findByText('Saved native campaign change.')
    fireEvent.change(await screen.findByLabelText('Shortlist notes'), {
      target: { value: 'Scout next month' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save shortlist item' }))
    await waitFor(() =>
      expect(api.manage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'save-shortlist',
            item: expect.objectContaining({ notes: 'Scout next month' }),
          }),
        }),
      ),
    )
  })
  it('requires explicit registration confirmation and submits selected players to Rust', async () => {
    const api = client()
    show(api, 'registration')
    await screen.findByRole('heading', { name: campaign.name })
    const region = screen.getByRole('group', { name: 'league squad' })
    const confirm = screen.getByLabelText(
      'I confirm this replaces the saved registration for the managed club.',
    )
    expect(confirm).toBeRequired()
    fireEvent.click(
      within(region).getByRole('button', { name: 'Select first 20 players' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save registration' }))
    expect(api.manage).not.toHaveBeenCalled()
    fireEvent.click(confirm)
    fireEvent.click(screen.getByRole('button', { name: 'Save registration' }))
    await waitFor(() =>
      expect(api.manage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'save-registration',
            competitionKey: 'league',
            players: [
              expect.objectContaining({
                playerId: snapshot.tables.players[0]!.id,
                status: 'registered',
              }),
            ],
          }),
        }),
      ),
    )
  })
  it('locks Challenge board controls while Sandbox edits only submit a new constitution', async () => {
    const api = client()
    const view = show(api, 'constitution')
    await screen.findByRole('heading', { name: campaign.name })
    expect(
      screen.getByRole('button', { name: 'Save constitution' }),
    ).toBeDisabled()
    view.unmount()
    const sandbox = model()
    sandbox.rows.campaigns[0]!.rulesMode = 'sandbox'
    api.screen = vi.fn().mockResolvedValue(sandbox)
    show(api, 'constitution')
    await screen.findByRole('heading', { name: campaign.name })
    fireEvent.change(screen.getByLabelText('initial Allocation Cents'), {
      target: { value: '99900000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save constitution' }))
    await waitFor(() =>
      expect(api.manage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'save-constitution',
            constitution: expect.objectContaining({
              rules: expect.arrayContaining([
                expect.objectContaining({
                  id: 'SELL_TO_BUY',
                  initialAllocationCents: 99900000,
                }),
              ]),
            }),
          }),
        }),
      ),
    )
    expect(vi.mocked(api.manage).mock.calls[0]![0].action).not.toHaveProperty(
      'ledgerEntries',
    )
  })
  it('waits for deletion confirmation and preserves a canceled action', async () => {
    const api = client()
    show(api, 'command-center')
    await screen.findByRole('heading', { name: campaign.name })
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }))
    expect(api.manage).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel campaign action' }),
    )
    expect(api.manage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await waitFor(() =>
      expect(api.manage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: { type: 'delete' },
          expectedRevision: campaign.revision,
        }),
      ),
    )
  })
})
