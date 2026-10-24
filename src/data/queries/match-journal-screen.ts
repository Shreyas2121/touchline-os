import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { readCampaignContext } from './campaign-context'
import { getActiveSeason } from '../repositories/seasons'
import { listPlayersByClub } from '../repositories/players'
import { listLineups } from '../repositories/lineups'
import { listMatches } from '../repositories/matches'

export async function loadMatchJournalScreen(
  database: TouchlineDatabase,
  campaignId: EntityId,
) {
  return database.transaction(
    'r',
    [
      database.campaigns,
      database.auditEvents,
      database.seasons,
      database.players,
      database.lineups,
      database.matchRecords,
    ],
    async () => {
      const context = await readCampaignContext(database, campaignId)
      if (context.status !== 'ready') return context
      const { campaign } = context
      const season = await getActiveSeason(database, campaign.id)
      const [players, lineups, matches] = await Promise.all([
        listPlayersByClub(database, campaign.id, campaign.managedClubId),
        season
          ? listLineups(database, campaign.id, season.id)
          : Promise.resolve([]),
        season
          ? listMatches(database, campaign.id, season.id)
          : Promise.resolve([]),
      ])
      return {
        ...context,
        season,
        players,
        lineups,
        matches,
        standalone: campaign.mode === 'standalone',
      }
    },
  )
}
