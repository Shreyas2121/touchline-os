import {
  contractSchema,
  type Contract,
  type EntityId,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'

export async function listContractsByClub(
  database: TouchlineDatabase,
  campaignId: EntityId,
  clubId: EntityId,
): Promise<Contract[]> {
  const rows = await database.contracts
    .where('[campaignId+clubId]')
    .equals([campaignId, clubId])
    .toArray()
  return rows.map((row) => parseStored(contractSchema, row))
}
