import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { requireCampaignRevision } from './campaign-revision'
import { listLineups } from '../repositories/lineups'

export async function loadLineupsAtRevision(
  database: TouchlineDatabase,
  campaignId: EntityId,
  seasonId: EntityId,
  expectedRevision: number,
) {
  return database.transaction(
    'r',
    [database.campaigns, database.lineups],
    async () => {
      await requireCampaignRevision(database, campaignId, expectedRevision)
      return listLineups(database, campaignId, seasonId)
    },
  )
}
