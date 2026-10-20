import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import {
  appearanceSchema,
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  matchRecordSchema,
} from '../../domain/validation/schemas'
import { limits } from '../../domain/validation/limits'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { insertAppearance } from '../repositories/appearances'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { insertMatch } from '../repositories/matches'
import { listPlayersByClub } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { rejectStandaloneWrite } from './guards'
import { rejectCommand, runCommand } from '../transactions/run-command'

const appearanceInputSchema = z.strictObject({
  appearanceId: entityIdSchema,
  playerId: entityIdSchema,
  minutes: appearanceSchema.shape.minutes,
  started: appearanceSchema.shape.started,
  goals: appearanceSchema.shape.goals,
  assists: appearanceSchema.shape.assists,
})

export const recordMatchInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  seasonId: entityIdSchema,
  matchId: entityIdSchema,
  date: dateOnlySchema,
  opponent: matchRecordSchema.shape.opponent,
  homeAway: matchRecordSchema.shape.homeAway,
  goalsFor: matchRecordSchema.shape.goalsFor,
  goalsAgainst: matchRecordSchema.shape.goalsAgainst,
  competition: z
    .string()
    .trim()
    .min(1)
    .max(limits.competitionKeyMax)
    .nullable(),
  notes: z.string().trim().min(1).max(limits.noteMax).nullable(),
  xgFor: matchRecordSchema.shape.xgFor,
  xgAgainst: matchRecordSchema.shape.xgAgainst,
  appearances: z.array(appearanceInputSchema),
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export function recordMatch(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<{ matchId: string }>> {
  const parsed = recordMatchInputSchema.safeParse(input)
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
      database.campaigns,
      database.seasons,
      database.players,
      database.matchRecords,
      database.appearances,
      database.auditEvents,
    ],
    {
      kind: 'update',
      campaignId: data.campaignId,
      expectedRevision: data.expectedRevision,
    },
    async (revision) => {
      const campaign = await getCampaign(database, data.campaignId)
      if (!campaign) rejectCommand('NOT_FOUND', 'Campaign not found.')
      rejectStandaloneWrite(campaign, 'match')
      const season = await getActiveSeason(database, campaign.id)
      if (!season || season.id !== data.seasonId)
        throw new PersistenceError('SCOPE', 'Season is not the active season.')
      const seen = new Set<string>()
      for (const appearance of data.appearances) {
        if (seen.has(appearance.playerId))
          throw new PersistenceError(
            'SCOPE',
            'This match lists a player twice.',
          )
        seen.add(appearance.playerId)
      }
      const squad = await listPlayersByClub(
        database,
        campaign.id,
        campaign.managedClubId,
      )
      const managed = new Set(squad.map((player) => player.id))
      for (const appearance of data.appearances) {
        if (!managed.has(appearance.playerId))
          throw new PersistenceError(
            'SCOPE',
            'That player is not at the managed club.',
          )
      }
      const match = matchRecordSchema.parse({
        id: data.matchId,
        campaignId: data.campaignId,
        seasonId: season.id,
        date: data.date,
        opponent: data.opponent,
        homeAway: data.homeAway,
        goalsFor: data.goalsFor,
        goalsAgainst: data.goalsAgainst,
        competition: data.competition,
        notes: data.notes,
        xgFor: data.xgFor,
        xgAgainst: data.xgAgainst,
      })
      await insertMatch(database, campaign.id, match)
      for (const appearance of data.appearances) {
        await insertAppearance(
          database,
          campaign.id,
          appearanceSchema.parse({
            id: appearance.appearanceId,
            campaignId: data.campaignId,
            seasonId: season.id,
            matchId: data.matchId,
            playerId: appearance.playerId,
            minutes: appearance.minutes,
            started: appearance.started,
            goals: appearance.goals,
            assists: appearance.assists,
            rating: null,
          }),
        )
      }
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
          actionType: 'match.record',
          createdAt: data.now,
          summary: `Recorded match against ${data.opponent}`,
          payload: data,
        }),
      )
      return { matchId: data.matchId }
    },
  )
}
