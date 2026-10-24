import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { readCampaignContext } from './campaign-context'
import { getClub, listClubs } from '../repositories/clubs'
import { getActiveSeason } from '../repositories/seasons'
import { listPlayers } from '../repositories/players'
import { listShortlist } from '../repositories/shortlist'
import { listContractsByClub } from '../repositories/contracts'
import { getActiveConstitution } from '../repositories/constitutions'
import { listLedgerEntries } from '../repositories/ledger-entries'
import { listOffers } from '../repositories/offers'
import { listTransfers } from '../repositories/transfers'

export async function loadTransfersScreen(
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
      database.shortlistItems,
      database.contracts,
      database.constitutions,
      database.ledgerEntries,
      database.offers,
      database.transfers,
    ],
    async () => {
      const context = await readCampaignContext(database, campaignId)
      if (context.status !== 'ready') return context
      const { campaign } = context
      const season = await getActiveSeason(database, campaign.id)
      if (!season) throw new Error('Missing active season')
      const [
        club,
        clubs,
        players,
        shortlist,
        contracts,
        constitution,
        entries,
        offers,
        transfers,
      ] = await Promise.all([
        getClub(database, campaign.id, campaign.managedClubId),
        listClubs(database, campaign.id),
        listPlayers(database, campaign.id),
        listShortlist(database, campaign.id),
        listContractsByClub(database, campaign.id, campaign.managedClubId),
        getActiveConstitution(database, campaign.id),
        listLedgerEntries(
          database,
          campaign.id,
          season.id,
          campaign.managedClubId,
        ),
        listOffers(database, campaign.id, season.id),
        listTransfers(database, campaign.id, season.id),
      ])
      return {
        ...context,
        club,
        clubs,
        season,
        players,
        shortlist,
        contracts,
        constitution,
        entries,
        offers,
        transfers,
      }
    },
  )
}
