import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  FEATURED_CAMPAIGN_ID,
  FEATURED_SEED,
  GENERATOR_VERSION,
} from '../../domain/seed/generate-world'
import { entityIdSchema, type Campaign } from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { getCampaign } from '../repositories/campaigns'
import { deleteCampaign } from './delete-campaign'
import { seedDemoCampaign, type SeedProgress } from './seed-demo'

const inputSchema = z.strictObject({
  campaignId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  createAuditEventId: entityIdSchema,
  createActionId: entityIdSchema,
  seedAuditEventId: entityIdSchema,
  seedActionId: entityIdSchema,
})

export async function resetDemoCampaign(
  database: TouchlineDatabase,
  input: unknown,
  onProgress: (progress: SeedProgress) => void,
): Promise<CommandResult<Campaign>> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    }
  const command = parsed.data
  if (command.campaignId !== FEATURED_CAMPAIGN_ID)
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Only the fictional demo can be reset.',
    }
  if (await getCampaign(database, command.campaignId)) {
    const deleted = await deleteCampaign(database, {
      campaignId: command.campaignId,
      expectedRevision: command.expectedRevision,
      now: command.now,
      auditEventId: command.seedAuditEventId,
      actionId: command.seedActionId,
    })
    if (!deleted.ok) return deleted
  }
  const { expectedRevision, ...seedInput } = command
  void expectedRevision
  return seedDemoCampaign(
    database,
    {
      ...seedInput,
      seed: FEATURED_SEED,
      generatorVersion: GENERATOR_VERSION,
      reason: 'reset',
    },
    onProgress,
  )
}
