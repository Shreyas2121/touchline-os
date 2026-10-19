import Dexie from 'dexie'
import {
  campaignSchema,
  type Campaign,
  type EntityId,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function getCampaign(
  database: TouchlineDatabase,
  id: EntityId,
): Promise<Campaign | undefined> {
  const row = await database.campaigns.get(id)
  if (row === undefined) return undefined
  return parseStored(campaignSchema, row)
}

export async function listCampaigns(
  database: TouchlineDatabase,
): Promise<Campaign[]> {
  const rows = await database.campaigns.toArray()
  return rows.map((row) => parseStored(campaignSchema, row))
}

export async function insertCampaign(
  database: TouchlineDatabase,
  campaign: Campaign,
): Promise<void> {
  try {
    await database.campaigns.add(campaign)
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

export async function updateCampaign(
  database: TouchlineDatabase,
  campaign: Campaign,
): Promise<void> {
  const stored = await database.campaigns.get(campaign.id)
  if (stored === undefined) return
  parseStored(campaignSchema, stored)
  const { id, ...changes } = campaign
  await database.campaigns.update(id, changes)
}
