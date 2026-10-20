import Dexie from 'dexie'
import {
  registrationSchema,
  type EntityId,
  type Registration,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function listRegistrations(
  database: TouchlineDatabase,
  campaignId: EntityId,
  seasonId: EntityId,
  competitionKey: string,
): Promise<Registration[]> {
  const rows = await database.registrations
    .where('[campaignId+seasonId+competitionKey+playerId]')
    .between(
      [campaignId, seasonId, competitionKey, Dexie.minKey],
      [campaignId, seasonId, competitionKey, Dexie.maxKey],
    )
    .toArray()
  return rows
    .map((row) => parseStored(registrationSchema, row))
    .sort((left, right) => (left.playerId < right.playerId ? -1 : 1))
}

export async function insertRegistration(
  database: TouchlineDatabase,
  campaignId: EntityId,
  registration: Registration,
): Promise<void> {
  if (registration.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Registration is not in this campaign.')
  await database.registrations.add(registrationSchema.parse(registration))
}

export async function updateRegistration(
  database: TouchlineDatabase,
  campaignId: EntityId,
  registration: Registration,
): Promise<void> {
  const stored = await database.registrations.get(registration.id)
  if (
    !stored ||
    stored.campaignId !== campaignId ||
    registration.campaignId !== campaignId
  )
    throw new PersistenceError('SCOPE', 'Registration is not in this campaign.')
  parseStored(registrationSchema, stored)
  const { id, ...changes } = registrationSchema.parse(registration)
  await database.registrations.update(id, changes)
}
