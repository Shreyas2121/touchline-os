import Dexie from 'dexie'
import {
  playerSchema,
  type EntityId,
  type Player,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function getPlayer(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<Player | undefined> {
  const row = await database.players.get(id)
  if (row === undefined || row.campaignId !== campaignId) return undefined
  return parseStored(playerSchema, row)
}

export async function listPlayers(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<Player[]> {
  const rows = await database.players
    .where('campaignId')
    .equals(campaignId)
    .toArray()
  return rows.map((row) => parseStored(playerSchema, row))
}

export async function listPlayersByClub(
  database: TouchlineDatabase,
  campaignId: EntityId,
  clubId: EntityId,
): Promise<Player[]> {
  const rows = await database.players
    .where('[campaignId+clubId]')
    .equals([campaignId, clubId])
    .toArray()
  return rows.map((row) => parseStored(playerSchema, row))
}

export async function insertPlayer(
  database: TouchlineDatabase,
  campaignId: EntityId,
  player: Player,
): Promise<void> {
  if (player.campaignId !== campaignId) {
    throw new PersistenceError(
      'SCOPE',
      'Row campaign does not match the scope.',
    )
  }
  if (player.clubId !== null) {
    const club = await database.clubs.get(player.clubId)
    if (club === undefined || club.campaignId !== campaignId) {
      throw new PersistenceError('SCOPE', 'Club is not in this campaign.')
    }
  }
  try {
    await database.players.add(player)
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
