import type { TouchlineDatabase } from '../db'
import type { EntityId } from '../../domain/validation/schemas'
import { readCampaignContext } from './campaign-context'
import { getActiveSeason } from '../repositories/seasons'
import { getActiveConstitution } from '../repositories/constitutions'
import { listPlayersByClub } from '../repositories/players'
import { listPlayerSimulationStates } from '../repositories/simulation'
import { listRegistrations } from '../repositories/registrations'

export async function loadRegistrationScreen(
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
      database.players,
      database.playerSimulationStates,
      database.registrations,
    ],
    async () => {
      const context = await readCampaignContext(database, campaignId)
      if (context.status !== 'ready') return context
      const { campaign } = context
      const [season, constitution, players, profiles] = await Promise.all([
        getActiveSeason(database, campaign.id),
        getActiveConstitution(database, campaign.id),
        listPlayersByClub(database, campaign.id, campaign.managedClubId),
        listPlayerSimulationStates(database, campaign.id),
      ])
      const rule = constitution?.rules.find(
        (item) => item.id === 'REGISTRATION_QUOTA',
      )
      const registrations =
        season && rule?.id === 'REGISTRATION_QUOTA'
          ? await listRegistrations(
              database,
              campaign.id,
              season.id,
              rule.competitionKey,
            )
          : []
      const eligibility = new Map(
        profiles
          .filter((profile) =>
            players.some((player) => player.id === profile.playerId),
          )
          .map((profile) => [
            profile.playerId,
            {
              homegrownClub: profile.homegrownClub,
              homegrownNation: profile.homegrownNation,
            },
          ]),
      )
      return {
        ...context,
        season,
        constitution,
        players,
        registrations,
        eligibility,
      }
    },
  )
}
