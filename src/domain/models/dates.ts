import { z } from 'zod'
import { limits } from '../validation/limits'
import type { ParseResult } from '../validation/result'

export const invalidDateMessage = 'Enter a real date as YYYY-MM-DD.'
export const invalidTimestampMessage =
  'Enter a UTC timestamp as YYYY-MM-DDTHH:mm:ss.sssZ.'
export const invertedAgeMessage = 'Birth date is after the as-of date.'
export const estimatedAgeMessage = 'Estimated age is out of range.'

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

type DateParts = { year: number; month: number; day: number }

function isLeapYear(year: number): boolean {
  if (year % 400 === 0) return true
  if (year % 100 === 0) return false
  return year % 4 === 0
}

function daysInMonth(year: number, month: number): number | undefined {
  const length = monthLengths[month - 1]
  if (length === undefined) return undefined
  if (month === 2 && isLeapYear(year)) return 29
  return length
}

function readDateParts(value: string): DateParts | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match?.[1] || !match[2] || !match[3]) return undefined
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

function isRealDateOnly(value: string): boolean {
  const parts = readDateParts(value)
  if (!parts) return false
  if (parts.year < limits.yearMin || parts.year > limits.yearMax) return false
  const length = daysInMonth(parts.year, parts.month)
  if (length === undefined) return false
  return parts.day >= 1 && parts.day <= length
}

export const dateOnlySchema = z
  .string()
  .refine(isRealDateOnly)
  .brand('DateOnly')

export type DateOnly = z.infer<typeof dateOnlySchema>

const timestampPattern =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/

function isRealTimestamp(value: string): boolean {
  const match = timestampPattern.exec(value)
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return false
  if (!isRealDateOnly(match[1])) return false
  const hour = Number(match[2])
  const minute = Number(match[3])
  const second = Number(match[4])
  return hour <= 23 && minute <= 59 && second <= 59
}

export const timestampUtcSchema = z
  .string()
  .refine(isRealTimestamp)
  .brand('TimestampUtc')

export type TimestampUtc = z.infer<typeof timestampUtcSchema>

export function parseDateOnly(input: string): ParseResult<DateOnly> {
  const parsed = dateOnlySchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: invalidDateMessage }
  return { ok: true, value: parsed.data }
}

export function parseTimestampUtc(input: string): ParseResult<TimestampUtc> {
  const parsed = timestampUtcSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: invalidTimestampMessage }
  return { ok: true, value: parsed.data }
}

function compareDates(left: DateParts, right: DateParts): number {
  if (left.year !== right.year) return left.year - right.year
  if (left.month !== right.month) return left.month - right.month
  return left.day - right.day
}

export function ageInWholeYears(birthDate: DateOnly, asOf: DateOnly): number {
  const birth = readDateParts(birthDate)
  const asOfParts = readDateParts(asOf)
  if (!birth || !asOfParts || compareDates(asOfParts, birth) < 0) {
    throw new RangeError(invertedAgeMessage)
  }
  let age = asOfParts.year - birth.year
  const birthdayNotReached =
    asOfParts.month < birth.month ||
    (asOfParts.month === birth.month && asOfParts.day < birth.day)
  if (birthdayNotReached) age -= 1
  return age
}

export function estimateAge(
  reportedAge: number,
  referenceSeasonOrdinal: number,
  seasonOrdinal: number,
): number {
  const age = reportedAge + (seasonOrdinal - referenceSeasonOrdinal)
  const reportedIsValid =
    Number.isInteger(reportedAge) &&
    reportedAge >= 0 &&
    reportedAge <= limits.ageMax
  const ordinalsAreValid =
    Number.isInteger(referenceSeasonOrdinal) &&
    referenceSeasonOrdinal >= 1 &&
    Number.isInteger(seasonOrdinal) &&
    seasonOrdinal >= 1 &&
    seasonOrdinal >= referenceSeasonOrdinal
  const ageIsValid = Number.isInteger(age) && age >= 0 && age <= limits.ageMax
  if (!reportedIsValid || !ordinalsAreValid || !ageIsValid) {
    throw new RangeError(estimatedAgeMessage)
  }
  return age
}
