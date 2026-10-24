import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { requireCampaignRevision } from './campaign-revision'
import { getDevelopmentPlan } from '../repositories/development-plans'
import { listAuditEvents } from '../repositories/audit-events'
import { listContractsByPlayer } from '../repositories/contracts'
import { listShortlist } from '../repositories/shortlist'

export async function loadPlayerProfile(
  database: TouchlineDatabase,
  campaignId: EntityId,
  playerId: EntityId,
  seasonId: EntityId | undefined,
  expectedRevision: number,
) {
  return database.transaction(
    'r',
    [
      database.campaigns,
      database.developmentPlans,
      database.auditEvents,
      database.contracts,
      database.shortlistItems,
    ],
    async () => {
      const campaign = await requireCampaignRevision(
        database,
        campaignId,
        expectedRevision,
      )
      const [plan, audits, shortlist, contracts] = await Promise.all([
        seasonId
          ? getDevelopmentPlan(database, campaignId, playerId, seasonId)
          : Promise.resolve(undefined),
        listAuditEvents(database, campaignId),
        listShortlist(database, campaignId),
        listContractsByPlayer(database, campaignId, playerId),
      ])
      return {
        revision: campaign.revision,
        plan,
        contracts,
        shortlist: shortlist.find((item) => item.playerId === playerId),
        history: audits
          .filter((audit) => audit.payload.playerId === playerId)
          .slice(0, 20),
      }
    },
  )
}
