import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { getCampaign } from '../repositories/campaigns'

// Dependent views may only attach records to a parent snapshot at this revision.
export async function requireCampaignRevision(
  database: TouchlineDatabase,
  campaignId: EntityId,
  expectedRevision: number,
) {
  const campaign = await getCampaign(database, campaignId)
  if (!campaign || campaign.revision !== expectedRevision)
    throw new Error(
      'The campaign changed. Reload to read a consistent snapshot.',
    )
  return campaign
}
