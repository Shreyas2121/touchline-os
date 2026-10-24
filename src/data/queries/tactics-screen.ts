import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { readCampaignContext } from './campaign-context'
import { getClub } from '../repositories/clubs'
import { getActiveSeason } from '../repositories/seasons'
import { listPlayersByClub } from '../repositories/players'
import { listLineups } from '../repositories/lineups'

export async function loadTacticsScreen(
  database: TouchlineDatabase,
  campaignId: EntityId,
) {
  return database.transaction(
    'r',
    [
      database.campaigns,
      database.auditEvents,
      database.clubs,
      database.seasons,
      database.players,
      database.lineups,
    ],
    async () => {
      const context = await readCampaignContext(database, campaignId)
      if (context.status !== 'ready') return context
      const { campaign } = context
      const [club, season, players] = await Promise.all([
        getClub(database, campaign.id, campaign.managedClubId),
        getActiveSeason(database, campaign.id),
        listPlayersByClub(database, campaign.id, campaign.managedClubId),
      ])
      const lineups = season
        ? await listLineups(database, campaign.id, season.id)
        : []
      return { ...context, club, season, players: club ? players : [], lineups }
    },
  )
}
