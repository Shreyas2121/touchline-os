import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  auditEventSchema,
  campaignSchema,
  developmentPlanSchema,
  entityIdSchema,
  type DevelopmentPlan,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import {
  getDevelopmentPlan,
  insertDevelopmentPlan,
  updateDevelopmentPlan,
} from '../repositories/development-plans'
import { getPlayer } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const saveDevelopmentNoteInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  playerId: entityIdSchema,
  seasonId: entityIdSchema,
  planId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  notes: z.string().max(4000),
  targetRole: z.string().trim().min(1).max(40).nullable(),
})
export function saveDevelopmentNote(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<DevelopmentPlan>> {
  const parsed = saveDevelopmentNoteInputSchema.safeParse(input)
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
      database.players,
      database.seasons,
      database.developmentPlans,
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
      const season = await getActiveSeason(database, data.campaignId)
      if (!season || season.id !== data.seasonId)
        throw new PersistenceError('SCOPE', 'Season is not the active season.')
      const stored = await getDevelopmentPlan(
        database,
        data.campaignId,
        data.playerId,
        data.seasonId,
      )
      const plan = developmentPlanSchema.parse({
        id: stored?.id ?? data.planId,
        campaignId: data.campaignId,
        playerId: data.playerId,
        seasonId: data.seasonId,
        notes: data.notes,
        targetRole: data.targetRole,
        status: 'open',
      })
      if (stored) await updateDevelopmentPlan(database, data.campaignId, plan)
      else await insertDevelopmentPlan(database, data.campaignId, plan)
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
          seasonId: season.id,
          actionId: data.actionId,
          actionType: 'player.note',
          createdAt: data.now,
          summary: `Noted development for ${player.name}`,
          payload: data,
        }),
      )
      return plan
    },
  )
}
