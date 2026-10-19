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
import { runCommand } from '../transactions/run-command'

const inputSchema = z.strictObject({
  campaignId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  archived: z.boolean(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export async function setCampaignArchived(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Campaign>> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    }
  const command = parsed.data
  const current = await getCampaign(database, command.campaignId)
  if (!current)
    return { ok: false, code: 'NOT_FOUND', message: 'Campaign not found.' }
  const status = command.archived ? 'archived' : 'active'
  if (current.status === status)
    return { ok: true, revision: current.revision, value: current }
  return runCommand(
    database,
    [database.campaigns, database.auditEvents],
    {
      kind: 'update',
      campaignId: command.campaignId,
      expectedRevision: command.expectedRevision,
    },
    async (revision) => {
      const stored = await getCampaign(database, command.campaignId)
      if (!stored) throw new Error('Campaign not found.')
      const updated = campaignSchema.parse({
        ...stored,
        status,
        updatedAt: command.now,
        revision,
      })
      await updateCampaign(database, updated)
      if (stored.status !== status) {
        await database.auditEvents.add(
          auditEventSchema.parse({
            id: command.auditEventId,
            campaignId: command.campaignId,
            seasonId: stored.activeSeasonId,
            actionId: command.actionId,
            actionType: command.archived
              ? 'campaign.archive'
              : 'campaign.restore',
            createdAt: command.now,
            summary: `${command.archived ? 'Archived' : 'Restored'} campaign ${stored.name}`,
            payload: command,
          }),
        )
      }
      return updated
    },
  )
}
