import {
  transferSchema,
  type EntityId,
  type Transfer,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function listTransfers(
  database: TouchlineDatabase,
  campaignId: EntityId,
  seasonId: EntityId,
): Promise<Transfer[]> {
  const rows = await database.transfers
    .where('[campaignId+seasonId]')
    .equals([campaignId, seasonId])
    .toArray()
  return rows
    .map((row) => parseStored(transferSchema, row))
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
}

export async function insertTransfer(
  database: TouchlineDatabase,
  campaignId: EntityId,
  transfer: Transfer,
): Promise<void> {
  if (transfer.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Transfer is not in this campaign.')
  await database.transfers.add(transferSchema.parse(transfer))
}
