import {
  constitutionSchema,
  type Constitution,
  type EntityId,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function listConstitutions(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<Constitution[]> {
  const rows = await database.constitutions
    .where('campaignId')
    .equals(campaignId)
    .toArray()
  return rows
    .map((row) => parseStored(constitutionSchema, row))
    .sort((left, right) => left.version - right.version)
}

export async function getActiveConstitution(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<Constitution | undefined> {
  return (await listConstitutions(database, campaignId)).at(-1)
}

export async function insertConstitution(
  database: TouchlineDatabase,
  campaignId: EntityId,
  constitution: Constitution,
): Promise<void> {
  if (constitution.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Constitution is not in this campaign.')
  await database.constitutions.add(constitution)
}
