import { describe, expect, it } from 'vitest'
import {
  ageInWholeYears,
  estimateAge,
  estimatedAgeMessage,
  invalidDateMessage,
  invalidTimestampMessage,
  invertedAgeMessage,
  parseDateOnly,
  parseTimestampUtc,
  type DateOnly,
} from '../domain/models/dates'

function mustDate(input: string): DateOnly {
  const parsed = parseDateOnly(input)
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.value
}

describe('parseDateOnly', () => {
  it('parses a real calendar day', () => {
    expect(parseDateOnly('2026-10-19')).toMatchObject({ ok: true })
  })

  it('rejects 31 February', () => {
    expect(parseDateOnly('2026-02-31')).toEqual({
      ok: false,
      message: invalidDateMessage,
    })
  })

  it('rejects a non-leap 29 February', () => {
    expect(parseDateOnly('2026-02-29')).toEqual({
      ok: false,
      message: invalidDateMessage,
    })
  })

  it('rejects a year before 1900', () => {
    expect(parseDateOnly('1899-01-01')).toEqual({
      ok: false,
      message: invalidDateMessage,
    })
  })

  it('rejects a timestamp', () => {
    expect(parseDateOnly('2026-10-19T00:00:00.000Z')).toEqual({
      ok: false,
      message: invalidDateMessage,
    })
  })

  it('accepts a leap day', () => {
    expect(parseDateOnly('2024-02-29')).toMatchObject({ ok: true })
  })
})

describe('parseTimestampUtc', () => {
  it('parses a UTC timestamp with milliseconds', () => {
    expect(parseTimestampUtc('2026-10-19T00:00:00.000Z')).toMatchObject({
      ok: true,
    })
  })

  it('rejects a timestamp without milliseconds', () => {
    expect(parseTimestampUtc('2026-10-19T00:00:00Z')).toEqual({
      ok: false,
      message: invalidTimestampMessage,
    })
  })

  it('rejects a timestamp on an impossible day', () => {
    expect(parseTimestampUtc('2026-02-31T00:00:00.000Z')).toEqual({
      ok: false,
      message: invalidTimestampMessage,
    })
  })
})

describe('ageInWholeYears', () => {
  it('is 25 the day before the birthday', () => {
    expect(
      ageInWholeYears(mustDate('2000-10-20'), mustDate('2026-10-19')),
    ).toBe(25)
  })

  it('is 26 on the birthday', () => {
    expect(
      ageInWholeYears(mustDate('2000-10-19'), mustDate('2026-10-19')),
    ).toBe(26)
  })

  it('rejects a birth date after the as-of date', () => {
    const birth = mustDate('2026-10-20')
    const asOf = mustDate('2026-10-19')
    expect(() => ageInWholeYears(birth, asOf)).toThrow(RangeError)
    expect(() => ageInWholeYears(birth, asOf)).toThrow(invertedAgeMessage)
  })
})

describe('estimateAge', () => {
  it('adds the season gap to the reported age', () => {
    expect(estimateAge(18, 1, 3)).toBe(20)
  })

  it('rejects a season before the reference season', () => {
    expect(() => estimateAge(18, 3, 1)).toThrow(RangeError)
    expect(() => estimateAge(18, 3, 1)).toThrow(estimatedAgeMessage)
  })
})
