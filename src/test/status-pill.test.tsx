import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusPill } from '../components/ui/StatusPill'

const tones = [
  ['blocked', 'Blocked'],
  ['warning', 'Warning'],
  ['informational', 'Informational'],
  ['passed', 'Passed'],
] as const

describe('StatusPill', () => {
  it.each(tones)('shows the word for %s', (tone, word) => {
    render(<StatusPill tone={tone} />)
    expect(screen.getByText(word)).toBeInTheDocument()
  })
})
