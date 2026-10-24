import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { readCampaignContext } from './campaign-context'
import { getClub } from '../repositories/clubs'
import { listPlayersByClub } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { getActiveConstitution } from '../repositories/constitutions'
import { listContractsByClub } from '../repositories/contracts'
import { listLedgerEntries } from '../repositories/ledger-entries'
import { listOffers } from '../repositories/offers'
import { listRegistrations } from '../repositories/registrations'
import { getSimulationState } from '../repositories/simulation'

export async function loadCommandCenterScreen(
  database: TouchlineDatabase,
  campaignId: EntityId,
) {
  return database.transaction(
    'r',
    [
      database.campaigns,
      database.auditEvents,
      database.clubs,
      database.players,
      database.seasons,
      database.constitutions,
      database.contracts,
      database.ledgerEntries,
      database.offers,
      database.registrations,
      database.simulationStates,
    ],
    async () => {
      const context = await readCampaignContext(database, campaignId)
      if (context.status !== 'ready') return context
      const { campaign } = context
      const season = await getActiveSeason(database, campaign.id)
      const [club, players, constitution, contracts, entries, offers, clock] =
        await Promise.all([
          getClub(database, campaign.id, campaign.managedClubId),
          listPlayersByClub(database, campaign.id, campaign.managedClubId),
          getActiveConstitution(database, campaign.id),
          listContractsByClub(database, campaign.id, campaign.managedClubId),
          season
            ? listLedgerEntries(
                database,
                campaign.id,
                season.id,
                campaign.managedClubId,
              )
            : Promise.resolve([]),
          season
            ? listOffers(database, campaign.id, season.id)
            : Promise.resolve([]),
          campaign.mode === 'standalone'
            ? getSimulationState(database, campaign.id)
            : Promise.resolve(undefined),
        ])
      const rule = constitution?.rules.find(
        (item) => item.id === 'REGISTRATION_QUOTA',
      )
      const registrations =
        season && rule?.enabled
          ? await listRegistrations(
              database,
              campaign.id,
              season.id,
              rule.competitionKey,
            )
          : []
      return {
        ...context,
        season,
        club,
        players,
        constitution,
        contracts,
        entries,
        offers,
        registrations,
        clock,
      }
    },
  )
}
