import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  playerSchema,
  type Player,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { insertPlayer } from '../repositories/players'
import { runCommand, type RunCommandOptions } from '../transactions/run-command'

export const addPlayerInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  playerId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  clubId: playerSchema.shape.clubId,
  name: playerSchema.shape.name,
  positionGroup: playerSchema.shape.positionGroup,
  positions: playerSchema.shape.positions,
  nationalityCode: playerSchema.shape.nationalityCode,
  birthDate: playerSchema.shape.birthDate,
  reportedAge: playerSchema.shape.reportedAge,
  ageReferenceSeasonOrdinal: playerSchema.shape.ageReferenceSeasonOrdinal,
  marketValueCents: playerSchema.shape.marketValueCents,
  attributes: playerSchema.shape.attributes,
  potential: playerSchema.shape.potential,
  source: playerSchema.shape.source,
  externalSourceId: playerSchema.shape.externalSourceId,
  isNewgen: playerSchema.shape.isNewgen,
})

export type AddPlayerInput = z.infer<typeof addPlayerInputSchema>

const validationResult: CommandResult<never> = {
  ok: false,
  code: 'VALIDATION',
  message: 'Command input is not valid.',
}

export function addPlayer(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Player>> {
  const options = updateOptions(input)
  if (options === undefined) return Promise.resolve(validationResult)
  return runCommand(
    database,
    [
      database.players,
      database.clubs,
      database.campaigns,
      database.auditEvents,
    ],
    options,
    async (revision) => {
      const parsed = addPlayerInputSchema.parse(input)
      const player = playerSchema.parse({
        id: parsed.playerId,
        campaignId: parsed.campaignId,
        clubId: parsed.clubId,
        name: parsed.name,
        positionGroup: parsed.positionGroup,
        positions: parsed.positions,
        nationalityCode: parsed.nationalityCode,
        birthDate: parsed.birthDate,
        reportedAge: parsed.reportedAge,
        ageReferenceSeasonOrdinal: parsed.ageReferenceSeasonOrdinal,
        marketValueCents: parsed.marketValueCents,
        attributes: parsed.attributes,
        potential: parsed.potential,
        source: parsed.source,
        externalSourceId: parsed.externalSourceId,
        isNewgen: parsed.isNewgen,
      })
      const current = await getCampaign(database, parsed.campaignId)
      if (current === undefined) throw new Error('Campaign not found.')
      const campaign = campaignSchema.parse({
        ...current,
        updatedAt: parsed.now,
        revision,
      })
      const audit = auditEventSchema.parse({
        id: parsed.auditEventId,
        campaignId: parsed.campaignId,
        seasonId: null,
        actionId: parsed.actionId,
        actionType: 'player.add',
        createdAt: parsed.now,
        summary: `Added player ${parsed.name}`,
        payload: parsed,
      })
      await insertPlayer(database, parsed.campaignId, player)
      await updateCampaign(database, campaign)
      await database.auditEvents.add(audit)
      return player
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
