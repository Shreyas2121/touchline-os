import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { NativeRoutes } from '../app/native/NativeWorkspace'
import { PlanningEditor } from '../app/native/NativeEditors'
import { createBrowserClient } from '../platform/browser-client'
import type { GameClient } from '../platform/game-client'
import type { CampaignSnapshot } from '../platform/generated/CampaignSnapshot'
import type { ScreenModel } from '../platform/generated/ScreenModel'
import source from '../../src-tauri/fixtures/standalone.json'

const snapshot = {
  ...source,
  sourceSchemaVersion: 3,
  tables: {
    ...source.tables,
    fixtures: [],
    simulatedMatches: [],
    simulatedAppearances: [],
    negotiations: [],
  },
} as unknown as CampaignSnapshot
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
    previewMarket: vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision,
      fromDate: '2026-07-01',
      sourceBoundaryKey: null,
      action: 'none',
      allowed: false,
      reason: null,
      negotiationCount: 0,
      offerCount: 0,
      transferCount: 0,
      contractCount: 0,
      ledgerCount: 0,
      registrationCount: 0,
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
  it('resets unsaved editor drafts when navigating to a different screen', async () => {
    const api = client()
    show(api, 'scouting')
    await screen.findByLabelText('Development notes')
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Unsaved campaign' },
    })
    fireEvent.change(screen.getByLabelText('Development notes'), {
      target: { value: 'Unsaved note' },
    })
    fireEvent.click(screen.getByRole('link', { name: 'Transfers' }))
    expect(await screen.findByLabelText('Development notes')).not.toHaveValue(
      'Unsaved note',
    )
    expect(screen.getByLabelText('Campaign name')).toHaveValue(campaign.name)
    expect(api.manage).not.toHaveBeenCalled()
  })

  it('discards drafts and replay identity on an explicit saved-campaign reload', async () => {
    const api = client()
    let saved = model()
    api.screen = vi.fn(async () => saved)
    api.planning = vi.fn(async () => ({
      player: saved.rows.players[0]!,
      revision: saved.revision,
      note: saved.rows.developmentPlans[0] ?? null,
      shortlist: saved.rows.shortlistItems[0] ?? null,
    }))
    api.manage = vi.fn().mockRejectedValue({
      code: 'CONFLICT',
      message: 'Reload the changed campaign.',
    })
    show(api, 'scouting')
    await screen.findByLabelText('Development notes')
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Unsaved campaign' },
    })
    fireEvent.change(screen.getByLabelText('Development notes'), {
      target: { value: 'Unsaved note' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rename campaign' }))
    await screen.findByText('Reload the changed campaign.')
    saved = model()
    saved.revision += 1
    saved.rows.campaigns[0]!.revision = saved.revision
    saved.rows.campaigns[0]!.name = 'Persisted newer campaign'
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reload saved campaign (discard drafts)',
      }),
    )
    await screen.findByLabelText('Development notes')
    expect(screen.getByLabelText('Development notes')).not.toHaveValue(
      'Unsaved note',
    )
    expect(screen.getByLabelText('Campaign name')).toHaveValue(
      'Persisted newer campaign',
    )
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'New draft' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rename campaign' }))
    await waitFor(() => expect(api.manage).toHaveBeenCalledTimes(2))
    const [first, second] = vi.mocked(api.manage).mock.calls
    expect(second![0].actionId).not.toBe(first![0].actionId)
    expect(second![0].expectedRevision).toBe(saved.revision)
  })

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
  it('rejects invalid constitution numbers before invoking management and preserves null age exemptions', async () => {
    const api = client()
    const sandbox = model()
    sandbox.rows.campaigns[0]!.rulesMode = 'sandbox'
    api.screen = vi.fn().mockResolvedValue(sandbox)
    show(api, 'constitution')
    await screen.findByRole('heading', { name: campaign.name })
    const button = screen.getByRole('button', { name: 'Save constitution' })
    const form = button.closest('form')!
    const allocation = screen.getByLabelText('initial Allocation Cents')
    for (const value of ['', '1.5', '-1']) {
      fireEvent.change(allocation, { target: { value } })
      fireEvent.submit(form)
      expect(screen.getByRole('alert')).toHaveTextContent(
        'enter a whole number',
      )
      expect(api.manage).not.toHaveBeenCalled()
    }
    fireEvent.change(allocation, { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('age Exemption Under'), {
      target: { value: '' },
    })
    fireEvent.submit(form)
    await waitFor(() => expect(api.manage).toHaveBeenCalledOnce())
    expect(api.manage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          constitution: expect.objectContaining({
            rules: expect.arrayContaining([
              expect.objectContaining({
                id: 'REGISTRATION_QUOTA',
                ageExemptionUnder: null,
              }),
              expect.objectContaining({
                id: 'SELL_TO_BUY',
                initialAllocationCents: 0,
              }),
            ]),
          }),
        }),
      }),
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

describe('native planning editor read identity', () => {
  function props(api: GameClient, saved = model()) {
    return {
      client: api,
      model: saved,
      send: vi.fn(),
      stableId: (key: string) => key,
      stamp: '2026-10-24T00:00:00.000Z',
      onReload: vi.fn(),
    }
  }
  it('preserves a draft across an unrelated parent render at the same revision', async () => {
    const api = client(),
      initial = props(api)
    const view = render(<PlanningEditor {...initial} />)
    const notes = await screen.findByLabelText('Development notes')
    fireEvent.change(notes, { target: { value: 'Keep this draft' } })
    view.rerender(
      <PlanningEditor
        {...initial}
        model={{ ...initial.model, labels: { player: 'Updated label' } }}
      />,
    )
    expect(screen.getByLabelText('Development notes')).toBe(notes)
    expect(notes).toHaveValue('Keep this draft')
    expect(api.planning).toHaveBeenCalledOnce()
  })

  it('hides old planning on revision change and ignores a late older response', async () => {
    const api = client()
    let resolve!: (value: Awaited<ReturnType<GameClient['planning']>>) => void
    const old = new Promise<Awaited<ReturnType<GameClient['planning']>>>(
      (done) => {
        resolve = done
      },
    )
    const initial = props(api)
    const note = initial.model.rows.developmentPlans[0]!
    const latest = {
      player: initial.model.rows.players[0]!,
      revision: initial.model.revision + 1,
      note: { ...note, notes: 'New saved revision' },
      shortlist: null,
    }
    api.planning = vi
      .fn()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce(latest)
    const view = render(<PlanningEditor {...initial} />)
    await waitFor(() => expect(api.planning).toHaveBeenCalledOnce())
    view.rerender(
      <PlanningEditor
        {...initial}
        model={{ ...initial.model, revision: latest.revision }}
      />,
    )
    expect(screen.queryByLabelText('Development notes')).toBeNull()
    expect(await screen.findByLabelText('Development notes')).toHaveValue(
      'New saved revision',
    )
    await act(async () =>
      resolve({
        ...latest,
        revision: initial.model.revision,
        note: { ...note, notes: 'Obsolete response' },
      }),
    )
    expect(screen.getByLabelText('Development notes')).toHaveValue(
      'New saved revision',
    )
  })
})
