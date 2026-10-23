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
import { staleSave } from '../app/copy'
import { createBrowserClient } from '../platform/browser-client'
import type { GameClient } from '../platform/game-client'
import type { CampaignSnapshot } from '../platform/generated/CampaignSnapshot'
import type { ScreenModel } from '../platform/generated/ScreenModel'
import type { TimePreview } from '../platform/generated/TimePreview'
import type { MatchdayPreview } from '../platform/generated/MatchdayPreview'
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
const july: TimePreview = {
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
  eventSeed: 11,
  reason: null,
}
const kickoff: TimePreview = {
  ...july,
  fromDate: '2026-09-01',
  sourceBoundaryKey: 'season:2026:league-kickoff',
  phase: 'league',
  allowed: false,
  targetBoundaryKey: null,
  targetDate: null,
  targetKind: null,
  nextEvent: null,
  eventSeed: null,
  reason: 'Use Sim Matchday to play the next league round.',
}
const matchday: MatchdayPreview = {
  campaignId: campaign.id,
  revision: campaign.revision,
  fromDate: '2026-09-01',
  sourceBoundaryKey: kickoff.sourceBoundaryKey,
  allowed: true,
  targetDate: '2026-09-01',
  round: 1,
  nextEvent: 'Home FC v Away FC',
  blocker: null,
  emergency: false,
  eventSeed: 123,
  fixtureCount: 1224,
  matchCount: 36,
  appearanceCount: 792,
}
function model(): ScreenModel {
  return {
    rows: structuredClone(snapshot.tables),
    revision: campaign.revision,
    totals: { players: 1 },
    page: 0,
    playerFacts: [],
    finance: null,
    activeConstitution: null,
    reports: [],
    labels: {},
  }
}
function client(preview: TimePreview = july): GameClient {
  return {
    ...createBrowserClient(),
    campaigns: vi.fn().mockResolvedValue({ campaigns: [], total: 0, page: 0 }),
    screen: vi.fn().mockResolvedValue(model()),
    previewTime: vi.fn().mockResolvedValue(preview),
    previewMarket: vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision,
      fromDate: preview.fromDate,
      sourceBoundaryKey: preview.sourceBoundaryKey,
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
    previewMatchday: vi.fn().mockResolvedValue(matchday),
    simMatchday: vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision + 1,
      replayed: false,
      receiptId: 'matchday-receipt',
      operationKey: 'season:season-1:matchday:2026-09-01',
      currentDate: '2026-09-08',
      phase: 'league',
      lastBoundaryKey: 'season:season-1:matchday:2026-09-01',
    }),
    advanceTime: vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision + 1,
      replayed: false,
      receiptId: 'receipt-1',
      operationKey: 'advance:season:deadline',
      currentDate: '2026-08-31',
      phase: 'preseason',
      lastBoundaryKey: 'season:2026:summer-deadline',
    }),
  }
}
function show(api: GameClient) {
  return render(
    <MemoryRouter initialEntries={[`/app/${campaign.id}/command-center`]}>
      <NativeRoutes client={api} />
    </MemoryRouter>,
  )
}

describe('native continue', () => {
  it('previews the next boundary and advances only after Continue', async () => {
    const api = client()
    const view = show(api)
    const calendar = await screen.findByRole('region', {
      name: 'Game calendar',
    })
    expect(await within(calendar).findByText('2026-07-01')).toBeInTheDocument()
    expect(
      within(calendar).getByText('Summer deadline on 2026-08-31'),
    ).toBeInTheDocument()
    expect(api.advanceTime).not.toHaveBeenCalled()
    view.unmount()
    show(api)
    expect(
      await screen.findByRole('button', { name: 'Continue' }),
    ).toBeEnabled()
    expect(api.advanceTime).not.toHaveBeenCalled()
    const reads = vi.mocked(api.screen).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(api.advanceTime).toHaveBeenCalledOnce())
    const request = vi.mocked(api.advanceTime).mock.calls[0]![0]
    expect(request).toMatchObject({
      campaignId: campaign.id,
      expectedRevision: campaign.revision,
      sourceDate: '2026-07-01',
      sourceBoundaryKey: null,
      targetBoundaryKey: 'season:2026:summer-deadline',
    })
    expect(request).not.toHaveProperty('targetDate')
    await waitFor(() =>
      expect(vi.mocked(api.screen).mock.calls.length).toBe(reads + 1),
    )
  })

  it('ignores a second click while the advance is pending', async () => {
    const api = client()
    let resolveAdvance: (value: unknown) => void = () => undefined
    api.advanceTime = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveAdvance = resolve
      }),
    )
    show(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Advancing the career…')).toBeInTheDocument()
    expect(api.advanceTime).toHaveBeenCalledOnce()
    resolveAdvance({
      campaignId: campaign.id,
      revision: campaign.revision + 1,
      replayed: false,
      receiptId: 'receipt-1',
      operationKey: 'advance:season:deadline',
      currentDate: '2026-08-31',
      phase: 'preseason',
      lastBoundaryKey: july.targetBoundaryKey,
    })
    await waitFor(() => expect(api.screen).toHaveBeenCalledTimes(2))
  })

  it('offers Sim Matchday at kickoff without simulating on load or relaunch', async () => {
    const api = client(kickoff)
    const view = show(api)
    expect(
      await screen.findByRole('button', { name: 'Sim Matchday' }),
    ).toBeEnabled()
    expect(
      screen.getByText('Home FC v Away FC on 2026-09-01'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Match simulation arrives in Phase 8.'),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(api.advanceTime).not.toHaveBeenCalled()
    expect(api.simMatchday).not.toHaveBeenCalled()
    view.unmount()
    show(api)
    await screen.findByRole('button', { name: 'Sim Matchday' })
    expect(api.simMatchday).not.toHaveBeenCalled()
  })

  it('shows the lineup remedy and does not simulate a blocker', async () => {
    const api = client(kickoff)
    api.previewMatchday = vi.fn().mockResolvedValue({
      ...matchday,
      allowed: false,
      blocker: 'Select a legal lineup in Tactics and check Registration.',
    })
    show(api)
    expect(
      await screen.findByText(
        'Select a legal lineup in Tactics and check Registration.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sim Matchday/ })).toBeNull()
    expect(api.simMatchday).not.toHaveBeenCalled()
  })

  it('confirms once, sends exact ID counts, and refreshes the persisted date', async () => {
    const api = client(kickoff)
    let resolve: (value: unknown) => void = () => undefined
    api.simMatchday = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    show(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Sim Matchday' }))
    expect(api.simMatchday).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', { name: 'Confirm Sim Matchday' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(confirm).toBeDisabled()
    expect(api.simMatchday).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Calculating and saving the matchday',
    )
    const req = vi.mocked(api.simMatchday).mock.calls[0]![0]
    expect(req).toMatchObject({
      campaignId: campaign.id,
      sourceDate: '2026-09-01',
      targetDate: '2026-09-01',
      expectedRevision: campaign.revision,
    })
    expect(req.fixtureIds).toHaveLength(1224)
    expect(req.matchIds).toHaveLength(36)
    expect(req.appearanceIds).toHaveLength(792)
    expect(
      new Set([...req.fixtureIds, ...req.matchIds, ...req.appearanceIds]).size,
    ).toBe(2052)
    expect(req).not.toHaveProperty('score')
    expect(req).not.toHaveProperty('timeline')
    vi.mocked(api.previewTime).mockResolvedValue({
      ...kickoff,
      fromDate: '2026-09-08',
      revision: campaign.revision + 1,
    })
    vi.mocked(api.previewMatchday).mockResolvedValue({
      ...matchday,
      fromDate: '2026-09-08',
      targetDate: '2026-09-08',
      round: 2,
      fixtureCount: 0,
    })
    resolve({})
    await waitFor(() => expect(api.screen).toHaveBeenCalledTimes(2))
    const calendar = screen.getByRole('region', { name: 'Game calendar' })
    expect(await within(calendar).findByText('2026-09-08')).toBeInTheDocument()
  })

  it('shows review copy without a simulate control', async () => {
    const api = client({ ...kickoff, phase: 'review' })
    api.previewMatchday = vi.fn().mockResolvedValue({
      ...matchday,
      allowed: false,
      blocker: 'Season rollover arrives in Phase 10.',
    })
    show(api)
    expect(
      await screen.findByText('Season rollover arrives in Phase 10.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Sim Matchday|Continue/ }),
    ).toBeNull()
    expect(api.simMatchday).not.toHaveBeenCalled()
  })

  it('shows the stale-save remedy and reloads without repeating the advance', async () => {
    const api = client()
    api.advanceTime = vi.fn().mockRejectedValue({
      code: 'CONFLICT',
      message: 'Campaign revision is stale.',
    })
    show(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(staleSave)
    const reads = vi.mocked(api.screen).mock.calls.length
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload saved campaign' }),
    )
    await waitFor(() =>
      expect(vi.mocked(api.screen).mock.calls.length).toBeGreaterThan(reads),
    )
    expect(api.advanceTime).toHaveBeenCalledOnce()
  })

  it('shows Run Market on July 1 and ignores a second click while it is saving', async () => {
    const api = client({
      ...july,
      allowed: false,
      targetBoundaryKey: null,
      targetDate: null,
      nextEvent: null,
      reason: null,
    })
    api.previewMarket = vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision,
      fromDate: '2026-07-01',
      sourceBoundaryKey: null,
      action: 'run',
      allowed: true,
      reason: null,
      negotiationCount: 2,
      offerCount: 1,
      transferCount: 1,
      contractCount: 1,
      ledgerCount: 2,
      registrationCount: 0,
    })
    let resolve: (value: unknown) => void = () => undefined
    api.runMarket = vi.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    show(api)
    const button = await screen.findByRole('button', { name: 'Run Market' })
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(api.runMarket).toHaveBeenCalledOnce()
    expect(button).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Calculating the transfer market.',
    )
    const request = vi.mocked(api.runMarket).mock.calls[0]![0]
    expect(request.negotiationIds).toHaveLength(2)
    expect(request.offerIds).toHaveLength(1)
    expect(request.ledgerIds).toHaveLength(2)
    resolve({})
  })

  it('runs the January market before Sim Matchday and closes the window before the next match', async () => {
    const api = client(kickoff)
    api.previewMarket = vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision,
      fromDate: '2027-01-05',
      sourceBoundaryKey: 'season:season-1:matchday:2026-12-29',
      action: 'run',
      allowed: true,
      reason: 'Run the transfer market before this matchday.',
      negotiationCount: 0,
      offerCount: 0,
      transferCount: 0,
      contractCount: 0,
      ledgerCount: 0,
      registrationCount: 0,
    })
    show(api)
    expect(
      await screen.findByText('Run the transfer market before this matchday.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run Market' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sim Matchday' })).toBeNull()
    api.previewMarket = vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision,
      fromDate: '2027-02-02',
      sourceBoundaryKey: 'season:season-1:matchday:2027-01-26',
      action: 'close',
      allowed: true,
      reason: 'Close the winter window before this matchday.',
      negotiationCount: 0,
      offerCount: 0,
      transferCount: 0,
      contractCount: 0,
      ledgerCount: 0,
      registrationCount: 0,
    })
    show(api)
    expect(
      await screen.findByText('Close the winter window before this matchday.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Close Window' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sim Matchday' })).toBeNull()
  })

  it('blocks Continue while a qualifying offer is open', async () => {
    const api = client({
      ...july,
      fromDate: '2026-08-31',
      allowed: false,
      targetBoundaryKey: null,
      targetDate: null,
      nextEvent: null,
      reason: 'Accept the qualifying offer before the window can close.',
    })
    api.previewMarket = vi.fn().mockResolvedValue({
      campaignId: campaign.id,
      revision: campaign.revision,
      fromDate: '2026-08-31',
      sourceBoundaryKey: 'season:2026:summer-deadline',
      action: 'none',
      allowed: false,
      reason: null,
      negotiationCount: 0,
      offerCount: 0,
      transferCount: 0,
      contractCount: 0,
      ledgerCount: 0,
      registrationCount: 0,
    })
    show(api)
    expect(
      await screen.findByText(
        'Accept the qualifying offer before the window can close.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })
})
