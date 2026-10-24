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
import { PolicyPreview } from '../app/native/PolicyPreview'
import type { NativePreview } from '../platform/generated/NativePreview'
import { NativeRoutes } from '../app/native/NativeWorkspace'
import { createBrowserClient } from '../platform/browser-client'
import type { GameClient } from '../platform/game-client'
import type { ScreenModel } from '../platform/generated/ScreenModel'
import type { CampaignSnapshot } from '../platform/generated/CampaignSnapshot'
import source from '../../src-tauri/fixtures/standalone.json'
import { workspaceSections } from '../app/routes'

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
    revision: campaign.revision,
    rows: structuredClone(snapshot.tables),
    totals: { players: 121 },
    page: 0,
    playerFacts: snapshot.tables.players.map((p) => ({
      playerId: p.id,
      age: '27',
      availability: 'Available',
      homegrownClub: true,
      homegrownNation: true,
    })),
    finance: { capacity: '€123.45', wages: '€67.89', tiers: { key: '€67.89' } },
    activeConstitution: snapshot.tables.constitutions[0] ?? null,
    reports: [],
    labels: Object.fromEntries(
      snapshot.tables.players.map((p) => [p.id, p.name]),
    ),
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
    selectImport: vi.fn().mockResolvedValue(null),
    cancelImport: vi.fn().mockResolvedValue(undefined),
    backupDatabase: vi.fn().mockResolvedValue(false),
    exportCampaign: vi.fn().mockResolvedValue(false),
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
function show(api: GameClient, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <NativeRoutes client={api} />
    </MemoryRouter>,
  )
}
const summary = {
  campaign,
  sourceStorage: 'indexeddb' as const,
  sourceSchemaVersion: 2,
  token: 'digest',
  counts: { players: snapshot.tables.players.length, campaigns: 1 },
}

describe('native read and migration UI', () => {
  it('loads campaigns through GameClient and leaves native writes disabled', async () => {
    const api = client()
    show(api)
    expect(
      await screen.findByRole('link', { name: campaign.name }),
    ).toBeInTheDocument()
    expect(api.campaigns).toHaveBeenCalledWith(0)
    expect(screen.getByRole('button', { name: /Create career/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Import save' }))
    await waitFor(() => expect(api.selectImport).toHaveBeenCalledOnce())
    expect(
      screen.queryByRole('button', { name: 'Confirm import' }),
    ).not.toBeInTheDocument()
  })
  it('reviews mode, counts and collision policy before import, then reloads persisted state', async () => {
    const api = client()
    api.selectImport = vi.fn().mockResolvedValue(summary)
    api.confirmImport = vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision,
    })
    show(api)
    fireEvent.click(screen.getByRole('button', { name: 'Import save' }))
    expect(
      await screen.findByRole('heading', {
        name: `Review import: ${campaign.name}`,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/different save with the same campaign ID is refused/),
    ).toBeInTheDocument()
    expect(api.confirmImport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    expect(
      await screen.findByText('Save imported. Loaded the persisted campaign.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(api.screen).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: campaign.id,
          screen: 'command-center',
        }),
      ),
    )
    expect(api.confirmImport).toHaveBeenCalledWith('digest')
  })
  it('clears canceled review and presents collision and dialog errors without fake success', async () => {
    const api = client()
    api.selectImport = vi.fn().mockResolvedValue(summary)
    api.confirmImport = vi.fn().mockRejectedValue({
      code: 'VALIDATION',
      message: 'Different-content collision refused.',
    })
    show(api)
    fireEvent.click(screen.getByRole('button', { name: 'Import save' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel import' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Confirm import' }),
      ).toBeNull(),
    )
    expect(api.cancelImport).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Import save' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm import' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Different-content collision refused.',
    )
    expect(
      screen.queryByText('Save imported. Loaded the persisted campaign.'),
    ).toBeNull()
  })
  it('navigates every native screen and requests scoped pages and searches', async () => {
    const api = client()
    show(api, `/app/${campaign.id}/squad`)
    expect(
      await screen.findByRole('heading', { name: campaign.name }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save contract' })).toBeNull()
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search players' }),
      { target: { value: 'Ada' } },
    )
    await waitFor(() =>
      expect(api.screen).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 0, search: 'Ada' }),
      ),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() =>
      expect(api.screen).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 }),
      ),
    )
    for (const section of workspaceSections) {
      fireEvent.click(
        screen.getByRole('link', {
          name: section.id === 'matches' ? 'Fixtures & Results' : section.label,
        }),
      )
      expect(
        await screen.findByRole('heading', {
          name: section.id === 'matches' ? 'Fixtures & Results' : section.label,
          level: 1,
        }),
      ).toBeInTheDocument()
      await waitFor(() =>
        expect(api.screen).toHaveBeenLastCalledWith(
          expect.objectContaining({
            campaignId: campaign.id,
            screen: section.id,
          }),
        ),
      )
      if (section.id === 'tactics') {
        expect(
          within(
            screen.getByRole('region', { name: 'Saved tactics' }),
          ).getByText(snapshot.tables.players[0]!.name),
        ).toBeInTheDocument()
      }
    }
  })
  it('renders authoritative finance and submits preview inputs without calculating policy in React', async () => {
    const api = client()
    api.previewPolicy = vi.fn().mockResolvedValue({
      revision: campaign.revision,
      report: {
        label: 'Action',
        allowed: false,
        verdicts: [
          {
            code: 'AGE',
            message: 'Saved rule blocks this age.',
            remedy: 'Choose a younger player.',
          },
        ],
      },
      beforeCapacity: '€123.45',
      afterCapacity: '€23.45',
      beforeWages: '€67.89',
      afterWages: '€77.89',
    })
    show(api, `/app/${campaign.id}/finance`)
    expect(await screen.findByText('€123.45')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Fee (cents)'), {
      target: { value: '10000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview action' }))
    expect(
      await screen.findByText(/Saved rule blocks this age/),
    ).toBeInTheDocument()
    expect(api.previewPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: campaign.id,
        expectedRevision: campaign.revision,
        action: expect.objectContaining({ feeCents: 10000 }),
      }),
    )
    expect(
      screen.queryByRole('button', { name: 'Post prize income' }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Export campaign' }))
    await waitFor(() =>
      expect(api.exportCampaign).toHaveBeenCalledWith(campaign.id),
    )
    expect(screen.queryByText('Exported the saved campaign.')).toBeNull()
  })
  it('shows scoped query failures without exposing another campaign', async () => {
    const api = client()
    api.screen = vi.fn().mockRejectedValue({
      code: 'VALIDATION',
      message: 'This campaign was not found.',
    })
    show(api, '/app/missing/finance')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This campaign was not found.',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
  it('lists a compulsory incoming offer and keeps Reject unavailable', async () => {
    const api = client()
    api.transferBoard = vi.fn().mockResolvedValue({
      incoming: [
        {
          offerId: 'offer-1',
          negotiationId: 'negotiation-1',
          playerName: 'Ada Forward',
          bidderName: 'North Town',
          feeCents: 5000000,
          wageCents: 20000,
          squadTier: 'key',
          term: '2027-06-30',
          deadline: '2026-07-15',
          compulsory: 'Compulsory',
          rejectAllowed: false,
          ledgerCount: 2,
          needsRegistration: false,
        },
      ],
      outgoing: [
        {
          negotiationId: 'negotiation-2',
          playerName: 'Bea Midfielder',
          sellerName: 'South Town',
          feeCents: 1000,
          wageCents: 1000,
          squadTier: 'rotation',
          status: 'agreed',
          deadline: '2026-08-31',
          canWithdraw: true,
          canSettle: true,
          ledgerCount: 2,
          needsRegistration: true,
        },
      ],
      completed: [],
    })
    show(api, `/app/${campaign.id}/transfers`)
    expect(await screen.findByText('Compulsory')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Settle' })).toBeEnabled()
  })
})

function deferredPreview() {
  let resolve!: (result: NativePreview) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<NativePreview>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const allowedPreview: NativePreview = {
  revision: campaign.revision,
  report: { label: 'Action', allowed: true, verdicts: [] },
  beforeCapacity: '100',
  afterCapacity: '90',
  beforeWages: '10',
  afterWages: '20',
}
function submitPolicy() {
  fireEvent.click(screen.getByRole('button', { name: 'Preview action' }))
}
function editPolicy(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('native policy preview submitted inputs', () => {
  it.each([
    ['Fee (cents)', '10'],
    ['Weekly wage (cents)', '20'],
    ['Age (blank means unknown)', '25'],
    ['Tier', 'key'],
    ['Effective date', '2026-08-01'],
  ])('hides a result after editing %s', async (label, value) => {
    const api = client()
    api.previewPolicy = vi.fn().mockResolvedValue(allowedPreview)
    render(
      <PolicyPreview client={api} model={model()} campaignId={campaign.id} />,
    )
    submitPolicy()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Allowed by saved rules',
    )
    editPolicy(label, value)
    expect(screen.queryByRole('status')).toBeNull()
    submitPolicy()
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('ignores completion after an edit, including when the draft returns to the submitted values', async () => {
    const api = client(),
      pending = deferredPreview()
    api.previewPolicy = vi.fn().mockReturnValue(pending.promise)
    render(
      <PolicyPreview client={api} model={model()} campaignId={campaign.id} />,
    )
    submitPolicy()
    editPolicy('Fee (cents)', '10')
    editPolicy('Fee (cents)', '0')
    await act(async () => pending.resolve(allowedPreview))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Preview action' })).toBeEnabled()
  })

  it.each(['resolve', 'reject'] as const)(
    'ignores an older request that finishes with %s after a newer result',
    async (completion) => {
      const api = client(),
        first = deferredPreview(),
        second = deferredPreview()
      api.previewPolicy = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
      render(
        <PolicyPreview client={api} model={model()} campaignId={campaign.id} />,
      )
      submitPolicy()
      editPolicy('Fee (cents)', '10')
      submitPolicy()
      await act(async () =>
        second.resolve({ ...allowedPreview, afterCapacity: 'new result' }),
      )
      await act(async () => {
        if (completion === 'resolve')
          first.resolve({ ...allowedPreview, afterCapacity: 'obsolete result' })
        else first.reject({ code: 'VALIDATION', message: 'Obsolete error' })
      })
      expect(screen.getByRole('status')).toHaveTextContent('new result')
      expect(screen.queryByText(/obsolete result/)).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    },
  )

  it('hides success and ignores pending responses when the campaign or revision changes', async () => {
    const api = client(),
      pending = deferredPreview()
    api.previewPolicy = vi
      .fn()
      .mockResolvedValueOnce(allowedPreview)
      .mockReturnValueOnce(pending.promise)
    const props = { client: api, model: model(), campaignId: campaign.id }
    const view = render(<PolicyPreview {...props} />)
    submitPolicy()
    await screen.findByRole('status')
    view.rerender(
      <PolicyPreview
        {...props}
        model={{ ...props.model, revision: props.model.revision + 1 }}
      />,
    )
    expect(screen.queryByRole('status')).toBeNull()
    submitPolicy()
    view.rerender(<PolicyPreview {...props} campaignId="another-campaign" />)
    await act(async () => pending.resolve(allowedPreview))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('clears a previous success when a repeated preview fails', async () => {
    const api = client()
    api.previewPolicy = vi
      .fn()
      .mockResolvedValueOnce(allowedPreview)
      .mockRejectedValueOnce({ code: 'VALIDATION', message: 'Preview failed' })
    render(
      <PolicyPreview client={api} model={model()} campaignId={campaign.id} />,
    )
    submitPolicy()
    await screen.findByRole('status')
    submitPolicy()
    expect(await screen.findByRole('alert')).toHaveTextContent('Preview failed')
    expect(screen.queryByRole('status')).toBeNull()
  })
})

const pagedRoster = Array.from({ length: 51 }, (_, index) => ({
  ...snapshot.tables.players[0]!,
  id: 'paged-player-' + (index + 1),
  name: 'Paged player ' + (index + 1),
}))
function transferPage(page: number, players = pagedRoster): ScreenModel {
  const base = model()
  return {
    ...base,
    page,
    rows: { ...base.rows, players: players.slice(page * 50, page * 50 + 50) },
    totals: { players: players.length, offers: 9999 },
  }
}
function pagedTransferClient() {
  const api = client()
  api.screen = vi.fn<GameClient['screen']>(async (query) =>
    transferPage(query.page),
  )
  api.transferBoard = vi
    .fn()
    .mockResolvedValue({ incoming: [], outgoing: [], completed: [] })
  api.planning = vi.fn<GameClient['planning']>(
    async (_campaignId, playerId) => {
      const player = pagedRoster.find((p) => p.id === playerId)!
      return {
        player,
        revision: campaign.revision,
        shortlist: null,
        note: {
          id: 'note-' + playerId,
          campaignId: campaign.id,
          seasonId: campaign.activeSeasonId,
          playerId,
          targetRole: null,
          notes: 'Planning for ' + player.name,
          status: 'open',
        },
      }
    },
  )
  return api
}
function playerPager() {
  return within(
    screen.getByRole('navigation', { name: 'Player search pagination' }),
  )
}
function deferredScreen() {
  let resolve!: (value: ScreenModel) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<ScreenModel>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('native transfer player pagination', () => {
  it('loads planning for player 51 on the second page while preserving the transfer board', async () => {
    const api = pagedTransferClient()
    show(api, '/app/' + campaign.id + '/transfers')
    await screen.findByLabelText('Planning player')
    await screen.findByText('No incoming offers.')
    const board = screen.getByRole('region', { name: 'Transfer board' })
    expect(
      within(screen.getByLabelText('Planning player')).getAllByRole('option'),
    ).toHaveLength(50)
    expect(playerPager().getByText(/Page 1.*51 records/)).toBeInTheDocument()
    fireEvent.click(playerPager().getByRole('button', { name: 'Next page' }))
    await waitFor(() =>
      expect(api.screen).toHaveBeenLastCalledWith({
        campaignId: campaign.id,
        screen: 'transfers',
        page: 1,
        search: '',
        allPlayers: false,
      }),
    )
    expect(await screen.findByLabelText('Planning player')).toHaveValue(
      pagedRoster[50]!.id,
    )
    expect(
      within(screen.getByLabelText('Planning player')).getByRole('option', {
        name: 'Paged player 51',
      }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText('Development notes')).toHaveValue(
        'Planning for Paged player 51',
      ),
    )
    expect(api.planning).toHaveBeenLastCalledWith(
      campaign.id,
      pagedRoster[50]!.id,
    )
    expect(
      playerPager().getByRole('button', { name: 'Next page' }),
    ).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Transfer board' })).toBe(board)
    expect(api.transferBoard).toHaveBeenCalledOnce()
    expect(api.previewTime).toHaveBeenCalledOnce()
    fireEvent.click(
      playerPager().getByRole('button', { name: 'Previous page' }),
    )
    expect(await screen.findByLabelText('Planning player')).toHaveValue(
      pagedRoster[0]!.id,
    )
    expect(api.screen).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 0 }),
    )
  })

  it('resets player paging when either search text or the all-clubs filter changes', async () => {
    const api = pagedTransferClient()
    show(api, '/app/' + campaign.id + '/transfers')
    await screen.findByLabelText('Planning player')
    fireEvent.click(playerPager().getByRole('button', { name: 'Next page' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Planning player')).toHaveValue(
        pagedRoster[50]!.id,
      ),
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search players' }),
      { target: { value: 'Paged' } },
    )
    expect(await screen.findByLabelText('Planning player')).toHaveValue(
      pagedRoster[0]!.id,
    )
    expect(api.screen).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 0, search: 'Paged', allPlayers: false }),
    )
    fireEvent.click(playerPager().getByRole('button', { name: 'Next page' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Planning player')).toHaveValue(
        pagedRoster[50]!.id,
      ),
    )
    fireEvent.click(screen.getByLabelText('Search all clubs and free agents'))
    expect(await screen.findByLabelText('Planning player')).toHaveValue(
      pagedRoster[0]!.id,
    )
    expect(api.screen).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 0, search: 'Paged', allPlayers: true }),
    )
    expect(api.transferBoard).toHaveBeenCalledOnce()
  })

  it.each(['resolve', 'reject'] as const)(
    'ignores an obsolete page response that finishes with %s after a new search',
    async (completion) => {
      const api = pagedTransferClient(),
        oldPage = deferredScreen(),
        latest = deferredScreen()
      api.screen = vi.fn<GameClient['screen']>((query) => {
        if (query.search === 'latest') return latest.promise
        if (query.page === 1) return oldPage.promise
        return Promise.resolve(transferPage(0))
      })
      show(api, '/app/' + campaign.id + '/transfers')
      await screen.findByLabelText('Planning player')
      fireEvent.click(playerPager().getByRole('button', { name: 'Next page' }))
      expect(screen.getByText('Loading player search.')).toBeInTheDocument()
      expect(
        screen.getByRole('region', { name: 'Transfer board' }),
      ).toBeInTheDocument()
      fireEvent.change(
        screen.getByRole('searchbox', { name: 'Search players' }),
        { target: { value: 'latest' } },
      )
      await act(async () => latest.resolve(transferPage(0, [pagedRoster[10]!])))
      expect(screen.getByLabelText('Planning player')).toHaveValue(
        pagedRoster[10]!.id,
      )
      await act(async () => {
        if (completion === 'resolve') oldPage.resolve(transferPage(1))
        else
          oldPage.reject({ code: 'INTERNAL', message: 'Obsolete page failure' })
      })
      expect(screen.getByLabelText('Planning player')).toHaveValue(
        pagedRoster[10]!.id,
      )
      expect(
        screen.getByRole('searchbox', { name: 'Search players' }),
      ).toHaveValue('latest')
      expect(screen.queryByText('Obsolete page failure')).toBeNull()
      expect(playerPager().getByText(/Page 1.*1 records/)).toBeInTheDocument()
      expect(api.transferBoard).toHaveBeenCalledOnce()
    },
  )

  it('asks for a reload when a player page belongs to a different campaign revision', async () => {
    const api = pagedTransferClient()
    api.screen = vi.fn<GameClient['screen']>(async (query) => ({
      ...transferPage(query.page),
      revision: campaign.revision + (query.page === 1 ? 1 : 0),
    }))
    show(api, '/app/' + campaign.id + '/transfers')
    await screen.findByLabelText('Planning player')
    fireEvent.click(playerPager().getByRole('button', { name: 'Next page' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The campaign changed. Reload before editing player planning.',
    )
    expect(screen.queryByLabelText('Planning player')).toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Reload saved campaign (discard drafts)',
      }),
    ).toBeEnabled()
    expect(
      screen.getByRole('region', { name: 'Transfer board' }),
    ).toBeInTheDocument()
    expect(api.transferBoard).toHaveBeenCalledOnce()
  })
})
