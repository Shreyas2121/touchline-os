import {
  lineupSchema,
  type EntityId,
  type Lineup,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function listLineups(
  database: TouchlineDatabase,
  campaignId: EntityId,
  seasonId: EntityId,
): Promise<Lineup[]> {
  const rows = await database.lineups
    .where('[campaignId+seasonId]')
    .equals([campaignId, seasonId])
    .toArray()
  return rows
    .map((row) => parseStored(lineupSchema, row))
    .sort((left, right) => {
      if (left.updatedAt !== right.updatedAt)
        return left.updatedAt < right.updatedAt ? 1 : -1
      return left.id === right.id ? 0 : left.id < right.id ? 1 : -1
    })
}

export async function getLineup(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<Lineup | undefined> {
  const row = await database.lineups.get(id)
  return !row || row.campaignId !== campaignId
    ? undefined
    : parseStored(lineupSchema, row)
}

export async function insertLineup(
  database: TouchlineDatabase,
  campaignId: EntityId,
  lineup: Lineup,
): Promise<void> {
  if (lineup.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Lineup is not in this campaign.')
  await database.lineups.add(lineup)
}

export async function updateLineup(
  database: TouchlineDatabase,
  campaignId: EntityId,
  lineup: Lineup,
): Promise<void> {
  const stored = await getLineup(database, campaignId, lineup.id)
  if (!stored || lineup.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Lineup is not in this campaign.')
  const { id, ...changes } = lineup
  await database.lineups.update(id, changes)
}

export async function removeLineup(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<void> {
  if (!(await getLineup(database, campaignId, id)))
    throw new PersistenceError('SCOPE', 'Lineup is not in this campaign.')
  await database.lineups.delete(id)
}
