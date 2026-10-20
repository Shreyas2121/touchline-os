import type { EntityId } from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'

export async function deleteCampaignRows(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<void> {
  const tables = [
    database.seasons,
    database.leagues,
    database.clubs,
    database.players,
    database.contracts,
    database.constitutions,
    database.ledgerEntries,
    database.transfers,
    database.offers,
    database.lineups,
    database.registrations,
    database.matchRecords,
    database.appearances,
    database.shortlistItems,
    database.scoutingReports,
    database.developmentPlans,
    database.auditEvents,
    database.importReceipts,
    database.simulationStates,
    database.clubSimulationStates,
    database.playerSimulationStates,
    database.simulationReceipts,
  ]
  for (const table of tables)
    await table.where('campaignId').equals(campaignId).delete()
  await database.campaigns.delete(campaignId)
}
