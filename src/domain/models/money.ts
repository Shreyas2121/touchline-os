import { z } from 'zod'
import { limits } from '../validation/limits'
import type { ParseResult } from '../validation/result'

export const invalidMoneyMessage =
  'Enter a non-negative euro amount with at most two decimal places.'

export const moneyCentsSchema = z
  .number()
  .int()
  .nonnegative()
  .brand('MoneyCents')

export type MoneyCents = z.infer<typeof moneyCentsSchema>

const moneyPattern = new RegExp(
  `^(0|[1-9]\\d{0,${limits.moneyWholeDigitsMax - 1}})(\\.\\d{1,2})?$`,
)

export function parseMoneyCents(input: string): ParseResult<MoneyCents> {
  let text = input.trim()
  if (text.startsWith('€')) {
    text = text.slice(1).trim()
  }
  if (!moneyPattern.test(text)) {
    return { ok: false, message: invalidMoneyMessage }
  }

  const [whole = '', fraction = ''] = text.split('.')
  const wholeCents = Number(whole) * 100
  const fractionCents =
    fraction.length === 1 ? Number(fraction) * 10 : Number(fraction)
  const cents = wholeCents + fractionCents
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, message: invalidMoneyMessage }
  }

  return { ok: true, value: moneyCentsSchema.parse(cents) }
}

function groupFromRight(digits: string): string {
  const groups: string[] = []
  for (let end = digits.length; end > 0; end -= 3) {
    const start = Math.max(0, end - 3)
    groups.push(digits.slice(start, end))
  }
  return groups.reverse().join(',')
}

export function formatMoneyEuros(cents: MoneyCents): string {
  const whole = Math.trunc(cents / 100)
  const fraction = cents % 100
  return `€${groupFromRight(String(whole))}.${String(fraction).padStart(2, '0')}`
}

export function formatMoneyUnknown(cents: MoneyCents | null): string {
  if (cents === null) return 'Unknown'
  return formatMoneyEuros(cents)
}
