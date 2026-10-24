import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { careerRefreshFailed, saveFailed } from '../app/copy'
import * as careerCommands from '../data/commands/start-standalone-campaign'
import * as campaigns from '../data/repositories/campaigns'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await deleteDatabaseForTests(databaseName)
})

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('career completion refresh', () => {
  it.each(['new career', 'playable demo'])(
    'retries only the refresh after saving a %s',
    async (kind) => {
      const list = vi.spyOn(campaigns, 'listCampaigns')
      const create = vi.spyOn(careerCommands, 'startStandaloneCampaign')
      const unhandled = vi.fn()
      window.addEventListener('unhandledrejection', unhandled)
      try {
        const { router } = renderAt('/')
        await waitFor(() =>
          expect(
            screen.getByRole('button', { name: 'Try fictional demo' }),
          ).toBeEnabled(),
        )
        list.mockRejectedValueOnce(new Error('List unavailable'))
        if (kind === 'new career') {
          fill('Career name', 'Refresh test career')
          fill('Seed', 'refresh-test')
          fireEvent.click(screen.getByRole('button', { name: 'List clubs' }))
          const club = await screen.findByRole('combobox', { name: 'Club' })
          await waitFor(() => expect(club).toBeEnabled())
          const option = screen
            .getAllByRole('option')
            .find(
              (item) =>
                item.parentElement === club && item.getAttribute('value'),
            )
          expect(option).toBeDefined()
          fill('Club', option!.getAttribute('value')!)
          fireEvent.click(screen.getByRole('button', { name: 'Start career' }))
        } else {
          fireEvent.click(
            screen.getByRole('button', { name: 'Open playable demo' }),
          )
        }
        // Persisting a complete world can exceed the default one-second wait
        // when this integration test runs alongside the rest of the suite.
        expect(
          await screen.findByRole('alert', {}, { timeout: 10_000 }),
        ).toHaveTextContent(careerRefreshFailed)
        expect(screen.queryByText(saveFailed)).toBeNull()
        expect(router.state.location.pathname).toBe('/')
        const database = getDatabase(databaseName)
        const saved = await database.campaigns.toArray()
        expect(saved).toHaveLength(1)
        expect(create).toHaveBeenCalledTimes(1)
        expect(
          screen.getByRole('link', { name: 'Open saved career' }),
        ).toHaveAttribute('href', `/app/${saved[0]!.id}/command-center`)
        expect(
          screen.getByRole('button', { name: 'Start career' }),
        ).toBeDisabled()
        expect(
          screen.getByRole('button', { name: 'Open playable demo' }),
        ).toBeDisabled()
        // Even a second failed refresh must not run creation again.
        list.mockRejectedValueOnce(new Error('Still unavailable'))
        fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }))
        expect(await screen.findByRole('alert')).toHaveTextContent(
          careerRefreshFailed,
        )
        expect(create).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }))
        await waitFor(() =>
          expect(router.state.location.pathname).toBe(
            `/app/${saved[0]!.id}/command-center`,
          ),
        )
        expect(create).toHaveBeenCalledTimes(1)
        expect(await database.campaigns.count()).toBe(1)
        expect(unhandled).not.toHaveBeenCalled()
      } finally {
        window.removeEventListener('unhandledrejection', unhandled)
      }
    },
    20_000,
  )

  it('keeps a creation failure distinct from a refresh failure', async () => {
    const list = vi.spyOn(campaigns, 'listCampaigns')
    vi.spyOn(careerCommands, 'startStandaloneCampaign').mockRejectedValueOnce(
      new Error('Write failed'),
    )
    renderAt('/')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Try fictional demo' }),
      ).toBeEnabled(),
    )
    const reads = list.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Open playable demo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(saveFailed)
    expect(screen.queryByRole('button', { name: 'Retry refresh' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open saved career' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Open playable demo' }),
    ).toBeEnabled()
    expect(list).toHaveBeenCalledTimes(reads)
    expect(await getDatabase(databaseName).campaigns.count()).toBe(0)
  })
})
