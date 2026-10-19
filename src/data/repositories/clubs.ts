import Dexie from 'dexie'
import {
  clubSchema,
  type Club,
  type EntityId,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function getClub(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<Club | undefined> {
  const row = await database.clubs.get(id)
  if (row === undefined || row.campaignId !== campaignId) return undefined
  return parseStored(clubSchema, row)
}

export async function listClubs(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<Club[]> {
  const rows = await database.clubs
    .where('campaignId')
    .equals(campaignId)
    .toArray()
  return rows.map((row) => parseStored(clubSchema, row))
}

export async function insertClub(
  database: TouchlineDatabase,
  campaignId: EntityId,
  club: Club,
): Promise<void> {
  if (club.campaignId !== campaignId) {
    throw new PersistenceError(
      'SCOPE',
      'Row campaign does not match the scope.',
    )
  }
  if (club.leagueId !== null) {
    const league = await database.leagues.get(club.leagueId)
    if (league === undefined || league.campaignId !== campaignId) {
      throw new PersistenceError('SCOPE', 'League is not in this campaign.')
    }
  }
  try {
    await database.clubs.add(club)
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
