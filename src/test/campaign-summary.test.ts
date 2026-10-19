import { describe, expect, it } from 'vitest'
import {
  activityLines,
  squadAgeSummary,
  squadCount,
} from '../features/dashboard/campaign-summary'

describe('campaign summary', () => {
  it('formats a real empty squad and a populated squad', () => {
    expect(squadCount(0)).toBe('0')
    expect(squadCount(36)).toBe('36')
  })

  it.each([
    [[], 'Unknown'],
    [[null, null], 'Unknown'],
    [[24], '24 years'],
    [[30, 10], '10 years'],
    [[10, null, 30], '10 years · 1 unknown'],
    [[35, 24, 18], '24 years'],
    [[30, null, 24, null, 10], '24 years · 2 unknown'],
  ] as const)('summarizes reported ages %j as %s', (ages, expected) => {
    const original = [...ages]
    expect(squadAgeSummary(ages)).toBe(expected)
    expect(ages).toEqual(original)
  })

  it('keeps the first 20 activity summaries in their existing order', () => {
    const summaries = Array.from({ length: 21 }, (_, i) => `Summary ${21 - i}`)
    expect(activityLines(summaries)).toEqual(summaries.slice(0, 20))
    expect(activityLines([])).toEqual([])
    expect(activityLines(['Created campaign Harbor'])).toEqual([
      'Created campaign Harbor',
    ])
    expect(summaries).toHaveLength(21)
  })
})
