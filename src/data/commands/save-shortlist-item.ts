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
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { getPlayer } from '../repositories/players'
import {
  getShortlistByPlayer,
  insertShortlistItem,
  updateShortlistItem,
} from '../repositories/shortlist'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const saveShortlistItemInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  itemId: entityIdSchema,
  playerId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  priority: shortlistItemSchema.shape.priority,
  notes: z.string().trim().min(1).max(4_000).nullable(),
  status: shortlistItemSchema.shape.status,
})

export function saveShortlistItem(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<ShortlistItem>> {
  const parsed = saveShortlistItemInputSchema.safeParse(input)
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
      const player = await getPlayer(database, data.campaignId, data.playerId)
      if (!player) rejectCommand('NOT_FOUND', 'Player not found.')
      const existing = await getShortlistByPlayer(
        database,
        data.campaignId,
        data.playerId,
      )
      if (existing && existing.id !== data.itemId)
        throw new PersistenceError(
          'SCOPE',
          'This player is already on the shortlist.',
        )
      const item = shortlistItemSchema.parse({
        id: data.itemId,
        campaignId: data.campaignId,
        playerId: data.playerId,
        priority: data.priority,
        status: data.status,
        notes: data.notes,
        addedAt: existing?.addedAt ?? data.now,
      })
      if (existing) await updateShortlistItem(database, data.campaignId, item)
      else await insertShortlistItem(database, data.campaignId, item)
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
          actionType: 'shortlist.save',
          createdAt: data.now,
          summary: `Shortlisted ${player.name}`,
          payload: data,
        }),
      )
      return item
    },
  )
}
