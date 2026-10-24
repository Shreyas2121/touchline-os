import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { readCampaignContext } from './campaign-context'
import { getClub } from '../repositories/clubs'
import { getActiveSeason } from '../repositories/seasons'
import { listPlayersByClub } from '../repositories/players'
import { listContractsByClub } from '../repositories/contracts'

export async function loadSquadScreen(
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
      database.contracts,
    ],
    async () => {
      const context = await readCampaignContext(database, campaignId)
      if (context.status !== 'ready') return context
      const { campaign } = context
      const [club, season, players, contracts] = await Promise.all([
        getClub(database, campaign.id, campaign.managedClubId),
        getActiveSeason(database, campaign.id),
        listPlayersByClub(database, campaign.id, campaign.managedClubId),
        listContractsByClub(database, campaign.id, campaign.managedClubId),
      ])
      return {
        ...context,
        club,
        season,
        players: club ? players : [],
        contracts,
        readOnly: campaign.mode === 'standalone',
      }
    },
  )
}
