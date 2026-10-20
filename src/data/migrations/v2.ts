import type { Transaction } from 'dexie'
import { schemaV1 } from './v1'

export const schemaV2 = {
  ...schemaV1,
  simulationStates: 'id, &campaignId',
  clubSimulationStates:
    'id, campaignId, &[campaignId+clubId], &[campaignId+simulationKey]',
  playerSimulationStates:
    'id, campaignId, &[campaignId+playerId], &[campaignId+simulationKey]',
  simulationReceipts: 'id, campaignId, &[campaignId+operationKey]',
} as const

export async function upgradeLegacyCampaigns(
  transaction: Transaction,
): Promise<void> {
  await transaction.table('campaigns').toCollection().modify({
    mode: 'legacy',
    rulesMode: 'sandbox',
  })
}
