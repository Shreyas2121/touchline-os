import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { harborInput } from './fixtures/campaign'
import { missingCampaignTitle, notFoundTitle } from '../app/copy'
import { renderAt } from './render'

afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests('touchline-os-test')
})
async function createDemo() {
  await createCampaign(getDatabase('touchline-os-test'), {
    ...harborInput,
    campaignId: 'demo',
  })
}

describe('routing', () => {
  it('does not render the workspace when the campaign id is missing', async () => {
    renderAt('/app')

    expect(
      await screen.findByRole('heading', { name: missingCampaignTitle }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Squad' })).toBeNull()
  })

  it('resolves a campaign url to the command center', async () => {
    await createDemo()
    renderAt('/app/demo')

    expect(
      await screen.findByRole('heading', { name: 'Command Center' }),
    ).toBeInTheDocument()
  })

  it('shows not found for an unknown section and an unknown path', async () => {
    await createDemo()
    const { unmount } = renderAt('/app/demo/not-a-section')
    expect(
      await screen.findByRole('heading', { name: notFoundTitle }),
    ).toBeInTheDocument()
    unmount()

    renderAt('/nope')
    expect(
      await screen.findByRole('heading', { name: notFoundTitle }),
    ).toBeInTheDocument()
  })

  it('shows a missing campaign without preview figures for an unknown id', async () => {
    renderAt('/app/does-not-exist/command-center')
    expect(
      await screen.findByRole('heading', { name: missingCampaignTitle }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Preview')).toBeNull()
    expect(screen.queryByText('Static preview — not save data')).toBeNull()
  })
})
