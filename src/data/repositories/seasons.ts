import Dexie from 'dexie'
import {
  seasonSchema,
  type EntityId,
  type Season,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function getSeason(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<Season | undefined> {
  const row = await database.seasons.get(id)
  if (row === undefined || row.campaignId !== campaignId) return undefined
  return parseStored(seasonSchema, row)
}

export async function listSeasons(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<Season[]> {
  const rows = await database.seasons
    .where('campaignId')
    .equals(campaignId)
    .toArray()
  return rows.map((row) => parseStored(seasonSchema, row))
}

export async function getActiveSeason(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<Season | undefined> {
  const rows = await database.seasons
    .where('[campaignId+status]')
    .equals([campaignId, 'active'])
    .toArray()
  if (rows.length === 0) return undefined
  if (rows.length > 1) {
    throw new PersistenceError(
      'CORRUPT',
      'This campaign has more than one active season.',
    )
  }
  return parseStored(seasonSchema, rows[0])
}

export async function insertSeason(
  database: TouchlineDatabase,
  campaignId: EntityId,
  season: Season,
): Promise<void> {
  if (season.campaignId !== campaignId) {
    throw new PersistenceError(
      'SCOPE',
      'Row campaign does not match the scope.',
    )
  }
  if (season.status === 'active') {
    const activeCount = await database.seasons
      .where('[campaignId+status]')
      .equals([campaignId, 'active'])
      .count()
    if (activeCount > 0) {
      throw new PersistenceError(
        'SCOPE',
        'This campaign already has an active season.',
      )
    }
  }
  const ordinalCount = await database.seasons
    .where('[campaignId+ordinal]')
    .equals([campaignId, season.ordinal])
    .count()
  if (ordinalCount > 0) {
    throw new PersistenceError(
      'DUPLICATE',
      'This campaign already has that season ordinal.',
    )
  }
  try {
    await database.seasons.add(season)
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
