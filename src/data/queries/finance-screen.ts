import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { readCampaignContext } from './campaign-context'
import { getClub } from '../repositories/clubs'
import { getActiveSeason } from '../repositories/seasons'
import { getActiveConstitution } from '../repositories/constitutions'
import { listContractsByClub } from '../repositories/contracts'
import { listLedgerEntries } from '../repositories/ledger-entries'

export async function loadFinanceScreen(
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
      database.constitutions,
      database.contracts,
      database.ledgerEntries,
    ],
    async () => {
      const context = await readCampaignContext(database, campaignId)
      if (context.status !== 'ready') return context
      const { campaign } = context
      const season = await getActiveSeason(database, campaign.id)
      if (!season) throw new Error('Missing active season')
      const [club, constitution, contracts, entries] = await Promise.all([
        getClub(database, campaign.id, campaign.managedClubId),
        getActiveConstitution(database, campaign.id),
        listContractsByClub(database, campaign.id, campaign.managedClubId),
        listLedgerEntries(
          database,
          campaign.id,
          season.id,
          campaign.managedClubId,
        ),
      ])
      return { ...context, club, season, constitution, contracts, entries }
    },
  )
}
