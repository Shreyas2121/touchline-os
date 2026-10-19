import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { harborInput } from './fixtures/campaign'
import { previewBanner } from '../app/copy'
import { workspaceSections } from '../app/routes'
import { renderAt } from './render'

afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests('touchline-os-test')
})

describe('shell nav', () => {
  it('lists every section and the preview banner', async () => {
    await createCampaign(getDatabase('touchline-os-test'), {
      ...harborInput,
      campaignId: 'demo',
    })
    renderAt('/app/demo/finance')
    await screen.findByRole('heading', { name: 'Finance' })

    for (const section of workspaceSections) {
      expect(
        screen.getByRole('link', { name: section.label }),
      ).toBeInTheDocument()
    }

    expect(screen.getByText(previewBanner)).toBeInTheDocument()
  })
})
