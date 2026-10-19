import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import { positionGroupFor } from '../../domain/models/positions'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  playerSchema,
  type Player,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { getPlayer, updateStoredPlayer } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const updatePlayerInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  playerId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  name: playerSchema.shape.name,
  positions: playerSchema.shape.positions,
  nationalityCode: playerSchema.shape.nationalityCode,
  birthDate: playerSchema.shape.birthDate,
  reportedAge: playerSchema.shape.reportedAge,
  marketValueCents: playerSchema.shape.marketValueCents,
  attributes: playerSchema.shape.attributes,
  potential: playerSchema.shape.potential,
})
export function updatePlayer(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Player>> {
  const parsed = updatePlayerInputSchema.safeParse(input)
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
      database.campaigns,
      database.auditEvents,
    ],
    {
      kind: 'update',
      campaignId: data.campaignId,
      expectedRevision: data.expectedRevision,
    },
    async (revision) => {
      const stored = await getPlayer(database, data.campaignId, data.playerId)
      if (!stored) rejectCommand('NOT_FOUND', 'Player not found.')
      const season =
        data.reportedAge === null
          ? undefined
          : await getActiveSeason(database, data.campaignId)
      if (data.reportedAge !== null && !season)
        throw new PersistenceError(
          'SCOPE',
          'This campaign has no active season.',
        )
      const player = playerSchema.parse({
        ...stored,
        name: data.name,
        positions: data.positions,
        positionGroup: positionGroupFor(data.positions[0]),
        nationalityCode: data.nationalityCode,
        birthDate: data.birthDate,
        reportedAge: data.reportedAge,
        ageReferenceSeasonOrdinal:
          data.reportedAge === null ? null : season!.ordinal,
        marketValueCents: data.marketValueCents,
        attributes: data.attributes,
        potential: data.potential,
      })
      const campaign = await getCampaign(database, data.campaignId)
      if (!campaign) rejectCommand('NOT_FOUND', 'Campaign not found.')
      await updateStoredPlayer(database, data.campaignId, player)
      await updateCampaign(
        database,
        campaignSchema.parse({ ...campaign, updatedAt: data.now, revision }),
      )
      await database.auditEvents.add(
        auditEventSchema.parse({
          id: data.auditEventId,
          campaignId: data.campaignId,
          seasonId: season?.id ?? null,
          actionId: data.actionId,
          actionType: 'player.update',
          createdAt: data.now,
          summary: `Updated player ${data.name}`,
          payload: data,
        }),
      )
      return player
    },
  )
}
