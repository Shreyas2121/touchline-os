import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  type Campaign,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { runCommand, type RunCommandOptions } from '../transactions/run-command'

export const renameCampaignInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  name: campaignSchema.shape.name,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export type RenameCampaignInput = z.infer<typeof renameCampaignInputSchema>

const validationResult: CommandResult<never> = {
  ok: false,
  code: 'VALIDATION',
  message: 'Command input is not valid.',
}

export function renameCampaign(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Campaign>> {
  const options = updateOptions(input)
  if (options === undefined) return Promise.resolve(validationResult)
  return runCommand(
    database,
    [database.campaigns, database.auditEvents],
    options,
    async (revision) => {
      const parsed = renameCampaignInputSchema.parse(input)
      const current = await getCampaign(database, parsed.campaignId)
      if (current === undefined) throw new Error('Campaign not found.')
      const campaign = campaignSchema.parse({
        ...current,
        name: parsed.name,
        updatedAt: parsed.now,
        revision,
      })
      const audit = auditEventSchema.parse({
        id: parsed.auditEventId,
        campaignId: parsed.campaignId,
        seasonId: null,
        actionId: parsed.actionId,
        actionType: 'campaign.rename',
        createdAt: parsed.now,
        summary: `Renamed campaign to ${parsed.name}`,
        payload: parsed,
      })
      await updateCampaign(database, campaign)
      await database.auditEvents.add(audit)
      return campaign
    },
  )
}

function updateOptions(input: unknown): RunCommandOptions | undefined {
  const parsed = z
    .object({
      campaignId: entityIdSchema,
      expectedRevision: z.number(),
    })
    .safeParse(input)
  if (!parsed.success) return undefined
  return {
    kind: 'update',
    campaignId: parsed.data.campaignId,
    expectedRevision: parsed.data.expectedRevision,
  }
}
