import { describe, expect, it } from 'vitest'
import {
  formatMoneyEuros,
  formatMoneyUnknown,
  invalidMoneyMessage,
  moneyCentsSchema,
  parseMoneyCents,
} from '../domain/models/money'

function expectMoney(input: string, cents: number) {
  expect(parseMoneyCents(input)).toEqual({ ok: true, value: cents })
}

function expectMoneyFailure(input: string) {
  const result = parseMoneyCents(input)
  expect(result).toEqual({ ok: false, message: invalidMoneyMessage })
  expect(result).not.toHaveProperty('value')
}

describe('parseMoneyCents', () => {
  it('rejects empty text', () => {
    expectMoneyFailure('')
  })

  it('rejects blank text', () => {
    expectMoneyFailure('   ')
  })

  it('parses a euro sign and two decimals', () => {
    expectMoney('€10.50', 1050)
  })

  it('parses a euro sign with surrounding spaces', () => {
    expectMoney(' € 10.50 ', 1050)
  })

  it('parses whole euros as cents', () => {
    expectMoney('10', 1000)
  })

  it('parses one fractional digit as tens of cents', () => {
    expectMoney('10.5', 1050)
  })

  it('parses two fractional digits', () => {
    expectMoney('10.50', 1050)
  })

  it('parses zero', () => {
    expectMoney('0', 0)
  })

  it('parses one cent', () => {
    expectMoney('0.01', 1)
  })

  it('parses 1.15 as 115 cents', () => {
    expectMoney('1.15', 115)
  })

  it('parses 0.29 as 29 cents', () => {
    expectMoney('0.29', 29)
  })

  it('rejects a third decimal place', () => {
    expectMoneyFailure('10.555')
  })

  it('rejects a minus sign', () => {
    expectMoneyFailure('-1')
  })

  it('rejects grouping commas', () => {
    expectMoneyFailure('1,050.00')
  })

  it('rejects a trailing dot', () => {
    expectMoneyFailure('10.')
  })

  it('rejects a leading dot', () => {
    expectMoneyFailure('.50')
  })

  it('rejects a leading zero on a multi-digit whole part', () => {
    expectMoneyFailure('00.50')
  })

  it('rejects a trailing euro sign', () => {
    expectMoneyFailure('10€')
  })

  it('rejects a repeated euro sign', () => {
    expectMoneyFailure('€€10')
  })

  it('does not turn a failed parse into zero', () => {
    const result = parseMoneyCents('')
    expect(result.ok).toBe(false)
    expect(result).not.toMatchObject({ value: 0 })
  })
})

describe('formatMoneyEuros', () => {
  it('formats 1050 cents as €10.50', () => {
    const parsed = parseMoneyCents('10.50')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(formatMoneyEuros(parsed.value)).toBe('€10.50')
  })

  it('formats zero cents', () => {
    expect(formatMoneyEuros(moneyCentsSchema.parse(0))).toBe('€0.00')
  })

  it('groups thousands', () => {
    expect(formatMoneyEuros(moneyCentsSchema.parse(10_000_000))).toBe(
      '€100,000.00',
    )
  })
})

describe('formatMoneyUnknown', () => {
  it('formats null as Unknown', () => {
    expect(formatMoneyUnknown(null)).toBe('Unknown')
  })

  it('formats known cents like formatMoneyEuros', () => {
    const parsed = parseMoneyCents('10.50')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(formatMoneyUnknown(parsed.value)).toBe('€10.50')
  })
})
