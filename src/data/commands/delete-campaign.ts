import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import { entityIdSchema, type EntityId } from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { deleteCampaignRows } from '../repositories/delete-campaign-rows'
import { runCommand } from '../transactions/run-command'

const inputSchema = z.strictObject({
  campaignId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export function deleteCampaign(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<{ id: EntityId }>> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    return Promise.resolve({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
  const command = parsed.data
  return runCommand(
    database,
    database.tables,
    {
      kind: 'update',
      campaignId: command.campaignId,
      expectedRevision: command.expectedRevision,
    },
    async () => {
      await deleteCampaignRows(database, command.campaignId)
      return { id: command.campaignId }
    },
  )
}
