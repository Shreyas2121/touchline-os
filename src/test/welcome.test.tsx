import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createPanel, disclaimer, importPanel } from '../app/copy'
import { renderAt } from './render'

describe('welcome', () => {
  it('shows the disclaimer and the demo link', () => {
    renderAt('/')

    expect(
      screen.getByRole('heading', { name: 'Touchline OS' }),
    ).toBeInTheDocument()
    expect(screen.getByText(disclaimer)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Try fictional demo' }),
    ).toHaveAttribute('href', '/app/demo/command-center')
  })

  it('explains that create and import are unavailable', () => {
    renderAt('/')

    fireEvent.click(screen.getByRole('button', { name: 'Create new campaign' }))
    expect(screen.getByText(createPanel)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import backup' }))
    expect(screen.getByText(importPanel)).toBeInTheDocument()
    expect(screen.queryByText('Campaign saved')).toBeNull()
  })
})
