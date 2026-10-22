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
import source from '../../src-tauri/fixtures/standalone.json'

const snapshot = source as CampaignSnapshot
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
  reason: 'Match simulation arrives in Phase 8.',
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

  it('stops at kickoff with the Phase 8 message and does not submit', async () => {
    const api = client(kickoff)
    show(api)
    expect(
      await screen.findByText('Match simulation arrives in Phase 8.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(api.advanceTime).not.toHaveBeenCalled()
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
})
