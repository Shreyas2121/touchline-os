import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { readCampaignContext } from './campaign-context'
import { getActiveSeason } from '../repositories/seasons'
import { getActiveConstitution } from '../repositories/constitutions'

export async function loadConstitutionScreen(
  database: TouchlineDatabase,
  campaignId: EntityId,
) {
  return database.transaction(
    'r',
    [
      database.campaigns,
      database.auditEvents,
      database.seasons,
      database.constitutions,
    ],
    async () => {
      const context = await readCampaignContext(database, campaignId)
      if (context.status !== 'ready') return context
      const { campaign } = context
      const [season, constitution] = await Promise.all([
        getActiveSeason(database, campaign.id),
        getActiveConstitution(database, campaign.id),
      ])
      if (!season) throw new Error('Missing active season')
      return { ...context, season, constitution }
    },
  )
}
