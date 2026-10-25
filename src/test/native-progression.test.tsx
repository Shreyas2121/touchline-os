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
import { NativeScreenTables } from '../app/native/NativeScreenTables'
import { staleSave } from '../app/copy'
import { createBrowserClient } from '../platform/browser-client'
import type { GameClient } from '../platform/game-client'
import type { CampaignSnapshot } from '../platform/generated/CampaignSnapshot'
import type { ScreenModel } from '../platform/generated/ScreenModel'
import type { TimePreview } from '../platform/generated/TimePreview'
import type { MatchdayPreview } from '../platform/generated/MatchdayPreview'
import type { LifecyclePreview } from '../platform/generated/LifecyclePreview'
import {
  NativeDevelopmentHistory,
  developmentHistoryEmpty,
} from '../app/native/NativeLifecycle'
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
    previewSeason: vi.fn().mockResolvedValue(lifecycle()),
    previewDevelopment: vi.fn().mockResolvedValue(
      lifecycle({
        attributes: [
          {
            playerId: 'young-player',
            name: 'Young Player',
            before: {
              pace: 50,
              finishing: 50,
              passing: 50,
              dribbling: 50,
              defending: 50,
              physical: 50,
            },
            after: {
              pace: 52,
              finishing: 50,
              passing: 50,
              dribbling: 50,
              defending: 50,
              physical: 50,
            },
            beforeValueCents: 100_000,
            afterValueCents: 120_000,
          },
        ],
      }),
    ),
    applyDevelopment: vi.fn().mockResolvedValue({}),
    settleSeason: vi.fn().mockResolvedValue({}),
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
function lifecycle(
  overrides: Partial<LifecyclePreview> = {},
): LifecyclePreview {
  return {
    hasDevelopmentHistory: false,
    allowed: true,
    reason: null,
    settlement: null,
    campaignId: campaign.id,
    seasonId: campaign.activeSeasonId,
    revision: campaign.revision,
    sourceDate: '2027-04-20',
    sourceBoundaryKey: 'round-34',
    inputFingerprint: 'native-lifecycle-test',
    closingLabel: '2026/27',
    idCounts: {
      players: 2,
      playerStates: 2,
      contracts: 2,
      registrations: 2,
      ledger: 77,
      fixtures: 1224,
      seasons: 1,
      settlements: 1,
      objectives: 6,
      snapshots: 1,
    },
    attributes: [],
    roster: [],
    clubs: [
      {
        clubId: campaign.managedClubId,
        developed: 1,
        renewed: 1,
        released: 0,
        retired: 0,
        intake: 2,
      },
    ],
    objectives: [
      {
        kind: 'league_title',
        targetPosition: 1,
        rewardCents: 50_000_000,
        outcome: 'missed',
      },
      {
        kind: 'top_half',
        targetPosition: 9,
        rewardCents: 20_000_000,
        outcome: 'met',
      },
      {
        kind: 'avoid_last',
        targetPosition: 17,
        rewardCents: 10_000_000,
        outcome: 'met',
      },
    ],
    managedPosition: 4,
    prizeCents: 150_000_000,
    objectiveBonusCents: 30_000_000,
    carryoverCents: 10_000_000,
    allocationCents: 500_000_000,
    ...overrides,
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

  it('opens the season review without a simulate control', async () => {
    const api = client({
      ...kickoff,
      phase: 'review',
      allowed: true,
      reason: null,
    })
    api.previewMatchday = vi.fn().mockResolvedValue({
      ...matchday,
      allowed: false,
      blocker: 'Finish every league fixture before the season can roll over.',
    })
    show(api)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review Season' }),
    )
    const review = await screen.findByRole('region', { name: 'Season review' })
    expect(await within(review).findByText(/Top half: Met/)).toBeInTheDocument()
    expect(within(review).getByText(/League title: Missed/)).toBeInTheDocument()
    expect(within(review).getByText('€1,500,000.00')).toBeInTheDocument()
    expect(
      within(review).getByRole('button', { name: 'Start Next Season' }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: /Sim Matchday|Continue/ }),
    ).toBeNull()
    expect(api.simMatchday).not.toHaveBeenCalled()
  })

  it('settles only after confirmation and ignores a second click while saving', async () => {
    const api = client({
      ...kickoff,
      phase: 'review',
      allowed: true,
      reason: null,
    })
    let resolve!: (value: unknown) => void
    api.settleSeason = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    show(api)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review Season' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Start Next Season' }),
    )
    expect(api.settleSeason).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', {
      name: 'Confirm Start Next Season',
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(
      await screen.findByText('Calculating the new season.'),
    ).toBeInTheDocument()
    expect(api.settleSeason).toHaveBeenCalledOnce()
    const input = vi.mocked(api.settleSeason).mock.calls[0]![0]
    expect(input.ids.fixtures).toHaveLength(1224)
    expect(input.ids.ledger).toHaveLength(77)
    expect(input).toMatchObject({
      inputFingerprint: 'native-lifecycle-test',
      expectedRevision: campaign.revision,
    })
    resolve({})
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Start Next Season' }),
      ).toBeNull(),
    )
  })
  it('hides the rollover controls for a qualifying offer', async () => {
    const reason =
      'Accept the qualifying offer before the season can roll over.'
    const api = client({ ...kickoff, phase: 'review', allowed: false, reason })
    api.previewSeason = vi
      .fn()
      .mockResolvedValue(lifecycle({ allowed: false, reason }))
    render(
      <MemoryRouter initialEntries={[`/app/${campaign.id}/seasons`]}>
        <NativeRoutes client={api} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(reason)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Start Next Season' }),
    ).toBeNull()
    expect(api.settleSeason).not.toHaveBeenCalled()
  })
  it('shows saved settlement amounts without a second confirmation', async () => {
    const p = lifecycle({
      allowed: false,
      settlement: {
        id: 'settlement-1',
        campaignId: campaign.id,
        seasonId: campaign.activeSeasonId,
        nextSeasonId: 'next-season',
        engineVersion: '1',
        settledOn: '2027-07-01',
        managedPosition: 4,
        prizeCents: 150_000_000,
        objectiveBonusCents: 30_000_000,
        carryoverCents: 10_000_000,
        allocationCents: 500_000_000,
        tableJson: '[]',
      },
    })
    const api = client()
    api.previewSeason = vi.fn().mockResolvedValue(p)
    render(
      <MemoryRouter initialEntries={[`/app/${campaign.id}/seasons`]}>
        <NativeRoutes client={api} />
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/Season settled on 2027-07-01/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Start Next Season' }),
    ).toBeNull()
  })
  it('previews development after a click and confirms the attribute row once', async () => {
    const api = client({
      ...kickoff,
      reason: 'Development is applied after the halfway matchday.',
    })
    let resolvePreview!: (p: LifecyclePreview) => void
    const preview = lifecycle({
      attributes: [
        {
          playerId: 'young-player',
          name: 'Young Player',
          before: { pace: 50 },
          after: { pace: 52 },
          beforeValueCents: 100_000,
          afterValueCents: 120_000,
        },
      ],
    })
    api.previewDevelopment = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolvePreview = r
      }),
    )
    let resolveApply!: (value: unknown) => void
    api.applyDevelopment = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolveApply = r
      }),
    )
    show(api)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Apply Development' }),
    )
    expect(
      await screen.findByText('Calculating player development.'),
    ).toBeInTheDocument()
    resolvePreview(preview)
    expect(await screen.findByText('Young Player')).toBeInTheDocument()
    expect(screen.getByText(/Pace 50 → 52/)).toBeInTheDocument()
    const confirm = screen.getByRole('button', {
      name: 'Confirm Apply Development',
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(api.applyDevelopment).toHaveBeenCalledOnce()
    expect(
      vi.mocked(api.applyDevelopment).mock.calls[0]![0].ids.snapshots,
    ).toHaveLength(1)
    resolveApply({})
    await waitFor(() => expect(api.screen).toHaveBeenCalledTimes(2))
  })
  it('shows the empty development history on the player profile', () => {
    const data = model()
    render(<NativeScreenTables model={data} screen="squad" />)
    fireEvent.click(
      screen.getByRole('button', { name: data.rows.players[0]!.name }),
    )
    expect(screen.getByText(developmentHistoryEmpty)).toBeInTheDocument()
  })
  it('lists the period, six rating pairs, and values in stored development history', () => {
    render(
      <NativeDevelopmentHistory
        campaignId={campaign.id}
        playerId="player-1"
        revision={1}
        fallback={[
          {
            id: 'snapshot-1',
            campaignId: campaign.id,
            seasonId: campaign.activeSeasonId,
            playerId: 'player-1',
            period: 'midseason',
            beforePace: 50,
            beforeFinishing: 50,
            beforePassing: 50,
            beforeDribbling: 50,
            beforeDefending: 50,
            beforePhysical: 50,
            afterPace: 52,
            afterFinishing: 50,
            afterPassing: 50,
            afterDribbling: 50,
            afterDefending: 50,
            afterPhysical: 50,
            beforeValueCents: 100_000,
            afterValueCents: 120_000,
            beforeStatus: 'active',
            afterStatus: 'active',
            points: 2,
            engineVersion: '1',
          },
        ]}
      />,
    )
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Midseason: Pace 50 → 52')
    expect(row).toHaveTextContent('Physical 50 → 50')
    expect(row).toHaveTextContent('€1,000.00 → €1,200.00')
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
    expect(
      screen.getByRole('button', { name: 'Run Market' }),
    ).toBeInTheDocument()
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
