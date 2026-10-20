import {
  contractSchema,
  type Contract,
  type EntityId,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

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

export async function listContractsByPlayer(
  database: TouchlineDatabase,
  campaignId: EntityId,
  playerId: EntityId,
): Promise<Contract[]> {
  const rows = await database.contracts
    .where('[campaignId+playerId]')
    .equals([campaignId, playerId])
    .toArray()
  return rows.map((row) => parseStored(contractSchema, row))
}

export async function insertContract(
  database: TouchlineDatabase,
  campaignId: EntityId,
  contract: Contract,
): Promise<void> {
  if (contract.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Contract is not in this campaign.')
  await database.contracts.add(contractSchema.parse(contract))
}

export async function updateContract(
  database: TouchlineDatabase,
  campaignId: EntityId,
  contract: Contract,
): Promise<void> {
  const stored = await database.contracts.get(contract.id)
  if (
    !stored ||
    stored.campaignId !== campaignId ||
    contract.campaignId !== campaignId
  )
    throw new PersistenceError('SCOPE', 'Contract is not in this campaign.')
  parseStored(contractSchema, stored)
  const { id, ...changes } = contractSchema.parse(contract)
  await database.contracts.update(id, changes)
}
