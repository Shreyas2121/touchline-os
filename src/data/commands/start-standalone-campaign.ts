import type { CommandResult } from '../../domain/commands/result'
import {
  CAREER_OPERATION_KEY,
  careerFingerprint,
  careerIdTaken,
  legacyDemoProtected,
  prepareStandaloneCareer,
  standaloneCareerInputSchema,
  type PreparedCareer,
} from '../../domain/simulation/career'
import type { Campaign } from '../../domain/validation/schemas'
import { FEATURED_CAMPAIGN_ID } from '../../domain/seed/generate-world'
import type { TouchlineDatabase } from '../db'
import { getCampaign } from '../repositories/campaigns'
import { getSimulationReceipt } from '../repositories/simulation'
import { rejectCommand, runCommand } from '../transactions/run-command'

export type CareerProgress = { stage: 'generate' | 'save' | 'ready' }

export type CareerWriteHook = {
  afterBulkWrites?: () => void
}

async function matchingCareer(
  database: TouchlineDatabase,
  campaignId: Campaign['id'],
  fingerprint: string,
): Promise<Campaign | undefined> {
  const existing = await getCampaign(database, campaignId)
  if (!existing || existing.mode !== 'standalone') return undefined
  const receipt = await getSimulationReceipt(
    database,
    campaignId,
    CAREER_OPERATION_KEY,
  )
  if (receipt?.inputFingerprint !== fingerprint) return undefined
  return existing
}

export async function startStandaloneCampaign(
  database: TouchlineDatabase,
  input: unknown,
  onProgress?: (progress: CareerProgress) => void,
  hooks?: CareerWriteHook,
): Promise<CommandResult<Campaign>> {
  const parsed = standaloneCareerInputSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    }
  const data = parsed.data
  if (data.campaignId === FEATURED_CAMPAIGN_ID)
    return { ok: false, code: 'VALIDATION', message: legacyDemoProtected }
  const fingerprint = careerFingerprint(data)
  const existing = await matchingCareer(database, data.campaignId, fingerprint)
  if (existing) {
    onProgress?.({ stage: 'ready' })
    return { ok: true, revision: existing.revision, value: existing }
  }
  if (await getCampaign(database, data.campaignId))
    return { ok: false, code: 'CONFLICT', message: careerIdTaken }
  onProgress?.({ stage: 'generate' })
  const prepared = prepareStandaloneCareer(data)
  if (!prepared.ok)
    return { ok: false, code: 'VALIDATION', message: prepared.message }
  onProgress?.({ stage: 'save' })
  const saved = await runCommand(
    database,
    [
      database.leagues,
      database.clubs,
      database.players,
      database.contracts,
      database.seasons,
      database.campaigns,
      database.constitutions,
      database.ledgerEntries,
      database.auditEvents,
      database.simulationStates,
      database.clubSimulationStates,
      database.playerSimulationStates,
      database.simulationReceipts,
    ],
    { kind: 'create' },
    (revision) => writeCareer(database, prepared.value, revision, hooks),
  )
  if (saved.ok) onProgress?.({ stage: 'ready' })
  return saved
}

async function writeCareer(
  database: TouchlineDatabase,
  prepared: PreparedCareer,
  revision: number,
  hooks: CareerWriteHook | undefined,
): Promise<Campaign> {
  const raced = await matchingCareer(
    database,
    prepared.campaign.id,
    prepared.fingerprint,
  )
  if (raced) return raced
  if (await getCampaign(database, prepared.campaign.id))
    rejectCommand('CONFLICT', careerIdTaken)
  const { world } = prepared
  const campaign = { ...prepared.campaign, revision }
  await database.seasons.add(prepared.season)
  await database.campaigns.add(campaign)
  await database.leagues.bulkAdd(world.leagues)
  await database.clubs.bulkAdd(world.clubs)
  await database.players.bulkAdd(world.players)
  await database.contracts.bulkAdd(world.contracts)
  await database.clubSimulationStates.bulkAdd(world.clubSimulationStates)
  await database.playerSimulationStates.bulkAdd(world.playerSimulationStates)
  hooks?.afterBulkWrites?.()
  await database.simulationStates.add(prepared.clock)
  await database.constitutions.add(prepared.constitution)
  await database.ledgerEntries.add(prepared.allocation)
  await database.simulationReceipts.add(prepared.receipt)
  await database.auditEvents.add(prepared.audit)
  return campaign
}
