import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { missingCampaignTitle, notFoundTitle } from '../app/copy'
import { renderAt } from './render'

describe('routing', () => {
  it('does not render the workspace when the campaign id is missing', () => {
    renderAt('/app')

    expect(
      screen.getByRole('heading', { name: missingCampaignTitle }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Squad' })).toBeNull()
  })

  it('resolves a campaign url to the command center', async () => {
    renderAt('/app/demo')

    expect(
      await screen.findByRole('heading', { name: 'Command Center' }),
    ).toBeInTheDocument()
  })

  it('shows not found for an unknown section and an unknown path', () => {
    const { unmount } = renderAt('/app/demo/not-a-section')
    expect(
      screen.getByRole('heading', { name: notFoundTitle }),
    ).toBeInTheDocument()
    unmount()

    renderAt('/nope')
    expect(
      screen.getByRole('heading', { name: notFoundTitle }),
    ).toBeInTheDocument()
  })
})
