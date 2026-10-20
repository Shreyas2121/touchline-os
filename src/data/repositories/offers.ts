import {
  offerSchema,
  type EntityId,
  type Offer,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function listOffers(
  database: TouchlineDatabase,
  campaignId: EntityId,
  seasonId: EntityId,
): Promise<Offer[]> {
  const rows = await database.offers
    .where('[campaignId+seasonId]')
    .equals([campaignId, seasonId])
    .toArray()
  return rows
    .map((row) => parseStored(offerSchema, row))
    .sort((left, right) => {
      if (left.receivedOn !== right.receivedOn)
        return left.receivedOn < right.receivedOn ? -1 : 1
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
}

export async function getOffer(
  database: TouchlineDatabase,
  campaignId: EntityId,
  id: EntityId,
): Promise<Offer | undefined> {
  const row = await database.offers.get(id)
  if (!row || row.campaignId !== campaignId) return undefined
  return parseStored(offerSchema, row)
}

export async function insertOffer(
  database: TouchlineDatabase,
  campaignId: EntityId,
  offer: Offer,
): Promise<void> {
  if (offer.campaignId !== campaignId)
    throw new PersistenceError('SCOPE', 'Offer is not in this campaign.')
  await database.offers.add(offerSchema.parse(offer))
}

export async function updateOffer(
  database: TouchlineDatabase,
  campaignId: EntityId,
  offer: Offer,
): Promise<void> {
  const stored = await database.offers.get(offer.id)
  if (
    !stored ||
    stored.campaignId !== campaignId ||
    offer.campaignId !== campaignId
  )
    throw new PersistenceError('SCOPE', 'Offer is not in this campaign.')
  parseStored(offerSchema, stored)
  const { id, ...changes } = offerSchema.parse(offer)
  await database.offers.update(id, changes)
}
