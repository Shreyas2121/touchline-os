import type { TouchlineDatabase } from '../db'
import { getCampaign } from '../repositories/campaigns'
import { listAuditEvents } from '../repositories/audit-events'
import { awaitsClubChoice } from '../../domain/simulation/career'
import type { EntityId } from '../../domain/validation/schemas'

// Call inside the screen's read transaction so prerequisites and screen rows
// describe the same campaign revision.
export async function readCampaignContext(
  database: TouchlineDatabase,
  campaignId: EntityId,
) {
  const campaign = await getCampaign(database, campaignId)
  if (!campaign) return { status: 'missing' as const, missing: true as const }
  const audits = await listAuditEvents(database, campaign.id)
  if (awaitsClubChoice(campaign, audits))
    return {
      status: 'choose-club' as const,
      chooseClub: campaign.id,
      campaign,
      revision: campaign.revision,
    }
  return {
    status: 'ready' as const,
    campaign,
    revision: campaign.revision,
    audits,
  }
}
