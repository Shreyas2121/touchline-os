import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

it('provides the DOM, UI matchers, matchMedia and IndexedDB for React tests', () => {
  expect(typeof window.matchMedia).toBe('function')
  expect(typeof indexedDB.open).toBe('function')
  render(<button>Environment check</button>)
  expect(
    screen.getByRole('button', { name: 'Environment check' }),
  ).toBeVisible()
})
