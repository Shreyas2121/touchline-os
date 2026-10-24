import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { getCampaign } from '../repositories/campaigns'
import { listLeagues } from '../repositories/leagues'
import { listClubs } from '../repositories/clubs'

export async function loadClubChoiceScreen(
  database: TouchlineDatabase,
  campaignId: EntityId,
) {
  return database.transaction(
    'r',
    [database.campaigns, database.leagues, database.clubs],
    async () => {
      const [campaign, leagues, clubs] = await Promise.all([
        getCampaign(database, campaignId),
        listLeagues(database, campaignId),
        listClubs(database, campaignId),
      ])
      return {
        id: campaignId,
        campaign,
        revision: campaign?.revision,
        leagues: [...leagues].sort(
          (a, b) => (a.tier ?? Infinity) - (b.tier ?? Infinity),
        ),
        clubs,
      }
    },
  )
}
