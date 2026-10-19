import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  type EntityId,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { getLineup, removeLineup } from '../repositories/lineups'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const deleteLineupInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  lineupId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export function deleteLineup(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<{ id: EntityId }>> {
  const parsed = deleteLineupInputSchema.safeParse(input)
  if (!parsed.success)
    return Promise.resolve({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
  const data = parsed.data
  return runCommand(
    database,
    [database.lineups, database.campaigns, database.auditEvents],
    {
      kind: 'update',
      campaignId: data.campaignId,
      expectedRevision: data.expectedRevision,
    },
    async (revision) => {
      const lineup = await getLineup(database, data.campaignId, data.lineupId)
      if (!lineup) rejectCommand('NOT_FOUND', 'Lineup not found.')
      const campaign = await getCampaign(database, data.campaignId)
      if (!campaign) rejectCommand('NOT_FOUND', 'Campaign not found.')
      await removeLineup(database, data.campaignId, lineup.id)
      await updateCampaign(
        database,
        campaignSchema.parse({ ...campaign, updatedAt: data.now, revision }),
      )
      await database.auditEvents.add(
        auditEventSchema.parse({
          id: data.auditEventId,
          campaignId: data.campaignId,
          seasonId: lineup.seasonId,
          actionId: data.actionId,
          actionType: 'lineup.delete',
          createdAt: data.now,
          summary: `Deleted lineup ${lineup.name}`,
          payload: data,
        }),
      )
      return { id: lineup.id }
    },
  )
}
