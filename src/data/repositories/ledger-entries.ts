import {
  ledgerEntrySchema,
  type EntityId,
  type LedgerEntry,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function listLedgerEntries(
  database: TouchlineDatabase,
  campaignId: EntityId,
  seasonId: EntityId,
  clubId: EntityId,
): Promise<LedgerEntry[]> {
  const rows = await database.ledgerEntries
    .where('[campaignId+seasonId]')
    .equals([campaignId, seasonId])
    .toArray()
  return rows
    .map((row) => parseStored(ledgerEntrySchema, row))
    .filter((entry) => entry.clubId === clubId)
    .sort((left, right) => {
      if (left.effectiveOn !== right.effectiveOn)
        return left.effectiveOn < right.effectiveOn ? -1 : 1
      return left.id === right.id ? 0 : left.id < right.id ? -1 : 1
    })
}

export async function getLedgerEntry(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<LedgerEntry | undefined> {
  const row = await database.ledgerEntries.get(id)
  return !row || row.campaignId !== campaignId
    ? undefined
    : parseStored(ledgerEntrySchema, row)
}

export async function insertLedgerEntry(
  database: TouchlineDatabase,
  campaignId: EntityId,
  entry: LedgerEntry,
): Promise<void> {
  if (entry.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Ledger entry is not in this campaign.')
  await database.ledgerEntries.add(entry)
}
