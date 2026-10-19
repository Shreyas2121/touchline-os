import Dexie from 'dexie'
import {
  leagueSchema,
  type EntityId,
  type League,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function getLeague(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<League | undefined> {
  const row = await database.leagues.get(id)
  if (row === undefined || row.campaignId !== campaignId) return undefined
  return parseStored(leagueSchema, row)
}

export async function listLeagues(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<League[]> {
  const rows = await database.leagues
    .where('campaignId')
    .equals(campaignId)
    .toArray()
  return rows.map((row) => parseStored(leagueSchema, row))
}

export async function insertLeague(
  database: TouchlineDatabase,
  campaignId: EntityId,
  league: League,
): Promise<void> {
  if (league.campaignId !== campaignId) {
    throw new PersistenceError(
      'SCOPE',
      'Row campaign does not match the scope.',
    )
  }
  try {
    await database.leagues.add(league)
  } catch (error) {
    if (error instanceof Dexie.ConstraintError) {
      throw new PersistenceError(
        'DUPLICATE',
        'A row with this id already exists.',
      )
    }
    throw error
  }
}
