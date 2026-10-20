import {
  shortlistItemSchema,
  type EntityId,
  type ShortlistItem,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function listShortlist(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<ShortlistItem[]> {
  const rows = await database.shortlistItems
    .where('campaignId')
    .equals(campaignId)
    .toArray()
  return rows
    .map((row) => parseStored(shortlistItemSchema, row))
    .sort((left, right) => {
      if (left.priority !== right.priority)
        return left.priority - right.priority
      return left.playerId.localeCompare(right.playerId, 'en')
    })
}

export async function getShortlistItem(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<ShortlistItem | undefined> {
  const row = await database.shortlistItems.get(id)
  if (row === undefined || row.campaignId !== campaignId) return undefined
  return parseStored(shortlistItemSchema, row)
}

export async function getShortlistByPlayer(
  database: TouchlineDatabase,
  campaignId: EntityId,
  playerId: EntityId,
): Promise<ShortlistItem | undefined> {
  const row = await database.shortlistItems
    .where('[campaignId+playerId]')
    .equals([campaignId, playerId])
    .first()
  return row === undefined ? undefined : parseStored(shortlistItemSchema, row)
}

export async function insertShortlistItem(
  database: TouchlineDatabase,
  campaignId: EntityId,
  item: ShortlistItem,
): Promise<void> {
  if (item.campaignId !== campaignId)
    throw new PersistenceError(
      'SCOPE',
      'Shortlist item is not in this campaign.',
    )
  await database.shortlistItems.add(item)
}

export async function updateShortlistItem(
  database: TouchlineDatabase,
  campaignId: EntityId,
  item: ShortlistItem,
): Promise<void> {
  const stored = await database.shortlistItems.get(item.id)
  if (
    !stored ||
    stored.campaignId !== campaignId ||
    item.campaignId !== campaignId
  )
    throw new PersistenceError(
      'SCOPE',
      'Shortlist item is not in this campaign.',
    )
  parseStored(shortlistItemSchema, stored)
  const { id, ...changes } = item
  await database.shortlistItems.update(id, changes)
}
