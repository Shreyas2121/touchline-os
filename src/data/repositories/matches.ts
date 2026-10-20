import Dexie from 'dexie'
import {
  matchRecordSchema,
  type EntityId,
  type MatchRecord,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function listMatches(
  database: TouchlineDatabase,
  campaignId: EntityId,
  seasonId: EntityId,
): Promise<MatchRecord[]> {
  const rows = await database.matchRecords
    .where('[campaignId+seasonId]')
    .equals([campaignId, seasonId])
    .toArray()
  return rows
    .filter((row) => row.campaignId === campaignId && row.seasonId === seasonId)
    .map((row) => parseStored(matchRecordSchema, row))
    .sort((left, right) => {
      if (left.date !== right.date) return left.date < right.date ? 1 : -1
      return left.id < right.id ? 1 : left.id > right.id ? -1 : 0
    })
}

export async function insertMatch(
  database: TouchlineDatabase,
  campaignId: EntityId,
  match: MatchRecord,
): Promise<void> {
  if (match.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Match is not in this campaign.')
  try {
    await database.matchRecords.add(matchRecordSchema.parse(match))
  } catch (error) {
    if (error instanceof Dexie.ConstraintError)
      throw new PersistenceError(
        'DUPLICATE',
        'A row with this id already exists.',
      )
    throw error
  }
}
