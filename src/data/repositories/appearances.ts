import Dexie from 'dexie'
import {
  appearanceSchema,
  type Appearance,
  type EntityId,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function listAppearances(
  database: TouchlineDatabase,
  campaignId: EntityId,
  seasonId: EntityId,
): Promise<Appearance[]> {
  const rows = await database.appearances
    .where('[campaignId+seasonId]')
    .equals([campaignId, seasonId])
    .toArray()
  return rows
    .filter((row) => row.campaignId === campaignId && row.seasonId === seasonId)
    .map((row) => parseStored(appearanceSchema, row))
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
}

export async function insertAppearance(
  database: TouchlineDatabase,
  campaignId: EntityId,
  appearance: Appearance,
): Promise<void> {
  if (appearance.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Appearance is not in this campaign.')
  try {
    await database.appearances.add(appearanceSchema.parse(appearance))
  } catch (error) {
    if (error instanceof Dexie.ConstraintError)
      throw new PersistenceError(
        'DUPLICATE',
        'A row with this id already exists.',
      )
    throw error
  }
}
