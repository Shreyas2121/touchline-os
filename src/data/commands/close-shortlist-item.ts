import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  shortlistItemSchema,
  type ShortlistItem,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { getPlayer } from '../repositories/players'
import {
  getShortlistItem,
  updateShortlistItem,
} from '../repositories/shortlist'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const closeShortlistItemInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  itemId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export function closeShortlistItem(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<ShortlistItem>> {
  const parsed = closeShortlistItemInputSchema.safeParse(input)
  if (!parsed.success)
    return Promise.resolve({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
  const data = parsed.data
  return runCommand(
    database,
    [
      database.shortlistItems,
      database.players,
      database.campaigns,
      database.auditEvents,
    ],
    {
      kind: 'update',
      campaignId: data.campaignId,
      expectedRevision: data.expectedRevision,
    },
    async (revision) => {
      const stored = await getShortlistItem(
        database,
        data.campaignId,
        data.itemId,
      )
      if (!stored) rejectCommand('NOT_FOUND', 'Shortlist entry not found.')
      const player = await getPlayer(database, data.campaignId, stored.playerId)
      if (!player) rejectCommand('NOT_FOUND', 'Player not found.')
      const item = shortlistItemSchema.parse({ ...stored, status: 'closed' })
      await updateShortlistItem(database, data.campaignId, item)
      const campaign = await getCampaign(database, data.campaignId)
      if (!campaign) rejectCommand('NOT_FOUND', 'Campaign not found.')
      await updateCampaign(
        database,
        campaignSchema.parse({ ...campaign, updatedAt: data.now, revision }),
      )
      await database.auditEvents.add(
        auditEventSchema.parse({
          id: data.auditEventId,
          campaignId: data.campaignId,
          seasonId: null,
          actionId: data.actionId,
          actionType: 'shortlist.close',
          createdAt: data.now,
          summary: `Closed shortlist entry for ${player.name}`,
          payload: data,
        }),
      )
      return item
    },
  )
}
