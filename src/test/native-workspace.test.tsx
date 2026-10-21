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
import type { ScreenModel } from '../platform/generated/ScreenModel'
import type { CampaignSnapshot } from '../platform/generated/CampaignSnapshot'
import source from '../../compatibility/snapshots/standalone-v2.json'
import { workspaceSections } from '../app/routes'

const snapshot = source as CampaignSnapshot
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
    chooseClubRequired: false,
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
    expect(await api.readCampaign().catch((e) => e.code)).toBe('UNAVAILABLE')
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
    expect(screen.getByRole('button', { name: 'Save contract' })).toBeDisabled()
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
      fireEvent.click(screen.getByRole('link', { name: section.label }))
      expect(
        await screen.findByRole('heading', { name: section.label, level: 1 }),
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
      screen.getByRole('button', { name: 'Post prize income' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Export campaign' }))
    await waitFor(() =>
      expect(api.exportCampaign).toHaveBeenCalledWith(campaign.id),
    )
    expect(screen.queryByText('Exported the saved campaign.')).toBeNull()
  })
  it('routes unchosen careers to native club reads and shows scoped query failures', async () => {
    const api = client()
    const legacy = model()
    legacy.rows.campaigns[0]!.mode = 'legacy'
    api.screen = vi
      .fn()
      .mockResolvedValue({ ...legacy, chooseClubRequired: true })
    const view = show(api, `/app/${campaign.id}/squad`)
    expect(
      await screen.findByRole('heading', { name: 'Choose club', level: 1 }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Select managed club' }),
    ).toBeEnabled()
    view.unmount()
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
})
