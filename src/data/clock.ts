import { timestampUtcSchema, type TimestampUtc } from '../domain/models/dates'

export function systemClock(): TimestampUtc {
  return timestampUtcSchema.parse(new Date().toISOString())
}
