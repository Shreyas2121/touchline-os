import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { disclaimer, importPanel } from '../app/copy'
import { cleanup } from '@testing-library/react'
import { deleteDatabaseForTests } from '../data/db'
import { renderAt } from './render'

afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests('touchline-os-test')
})
describe('welcome', () => {
  it('shows the disclaimer and the demo button', async () => {
    renderAt('/')

    expect(
      await screen.findByRole('heading', { name: 'Touchline OS' }),
    ).toBeInTheDocument()
    expect(screen.getByText(disclaimer)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try fictional demo' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Start year')).toHaveValue(2026)
    expect(screen.getByRole('radio', { name: 'Challenge' })).toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Open playable demo' }),
    ).toBeInTheDocument()
  })

  it('offers creation and explains that import is unavailable', async () => {
    renderAt('/')
    await screen.findByRole('heading', { name: 'Touchline OS' })

    fireEvent.click(screen.getByRole('button', { name: 'Create new campaign' }))
    expect(screen.getByRole('button', { name: 'Save campaign' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Import backup' }))
    expect(screen.getByText(importPanel)).toBeInTheDocument()
    expect(screen.queryByText('Campaign saved')).toBeNull()
  })
})
