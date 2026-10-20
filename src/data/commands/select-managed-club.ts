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
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { getClub } from '../repositories/clubs'
import { rejectStandaloneWrite } from './guards'
import { runCommand } from '../transactions/run-command'

const inputSchema = z.strictObject({
  campaignId: entityIdSchema,
  clubId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export function selectManagedClub(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Campaign>> {
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
    [database.campaigns, database.clubs, database.auditEvents],
    {
      kind: 'update',
      campaignId: command.campaignId,
      expectedRevision: command.expectedRevision,
    },
    async (revision) => {
      const club = await getClub(database, command.campaignId, command.clubId)
      if (!club)
        throw new PersistenceError('SCOPE', 'Club is not in this campaign.')
      const current = await getCampaign(database, command.campaignId)
      if (!current) throw new Error('Campaign not found.')
      rejectStandaloneWrite(current, 'club')
      const campaign = campaignSchema.parse({
        ...current,
        managedClubId: club.id,
        updatedAt: command.now,
        revision,
      })
      await updateCampaign(database, campaign)
      await database.auditEvents.add(
        auditEventSchema.parse({
          id: command.auditEventId,
          campaignId: command.campaignId,
          seasonId: current.activeSeasonId,
          actionId: command.actionId,
          actionType: 'campaign.select-club',
          createdAt: command.now,
          summary: `Selected ${club.name} as the managed club`,
          payload: command,
        }),
      )
      return campaign
    },
  )
}
