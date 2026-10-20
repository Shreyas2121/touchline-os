import { limits } from '../validation/limits'

const invalidXg =
  'Enter xG as a number from 0 to 20 with at most three decimal places.'

export function parseXgMilli(
  input: string,
): { ok: true; value: number | null } | { ok: false; message: string } {
  const text = input.trim()
  if (text === '') return { ok: true, value: null }
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(text)
  const wholeText = match?.[1]
  if (!wholeText) return { ok: false, message: invalidXg }
  const fractionText = match[2] ?? ''
  if (wholeText.length > 15) return { ok: false, message: invalidXg }
  const whole = Number(wholeText)
  const fraction =
    fractionText === ''
      ? 0
      : Number(fractionText) * 10 ** (3 - fractionText.length)
  const value = whole * 1000 + fraction
  if (
    !Number.isSafeInteger(whole) ||
    !Number.isSafeInteger(fraction) ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > limits.xgMilliMax
  )
    return { ok: false, message: invalidXg }
  return { ok: true, value }
}

export function formatXg(milli: number | null): string {
  if (milli === null) return ''
  const whole = Math.trunc(milli / 1000)
  const fraction = milli - whole * 1000
  return `${whole}.${String(fraction).padStart(3, '0')}`
}
