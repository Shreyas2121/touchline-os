import { expect, it } from 'vitest'

it('runs pure tests without browser or storage globals', () => {
  expect(typeof window).toBe('undefined')
  expect(typeof document).toBe('undefined')
  expect(typeof indexedDB).toBe('undefined')
  expect(typeof localStorage).toBe('undefined')
})
