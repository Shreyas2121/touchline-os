import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import { lineupProblems } from '../../domain/player/lineup-draft'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  lineupSchema,
  type Lineup,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { getClub } from '../repositories/clubs'
import {
  getLineup,
  insertLineup,
  listLineups,
  updateLineup,
} from '../repositories/lineups'
import { listPlayersByClub } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const saveLineupInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  lineupId: entityIdSchema,
  seasonId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  name: lineupSchema.shape.name,
  formation: lineupSchema.shape.formation,
  starters: z.array(lineupSchema.shape.starters.element),
  benchPlayerIds: z.array(entityIdSchema),
})

export function saveLineup(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Lineup>> {
  const parsed = saveLineupInputSchema.safeParse(input)
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
      database.lineups,
      database.players,
      database.seasons,
      database.clubs,
      database.campaigns,
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
      const season = await getActiveSeason(database, data.campaignId)
      if (!season || season.id !== data.seasonId)
        throw new PersistenceError('SCOPE', 'Season is not the active season.')
      const [club, players] = await Promise.all([
        getClub(database, campaign.id, campaign.managedClubId),
        listPlayersByClub(database, campaign.id, campaign.managedClubId),
      ])
      if (
        lineupProblems(data, club ? players.map((player) => player.id) : [])
          .length
      )
        throw new PersistenceError(
          'SCOPE',
          'This lineup does not match the current roster.',
        )
      const row = await database.lineups.get(data.lineupId)
      if (
        row &&
        (row.campaignId !== data.campaignId || row.seasonId !== data.seasonId)
      )
        rejectCommand('NOT_FOUND', 'Lineup not found.')
      const existing = await getLineup(database, data.campaignId, data.lineupId)
      const lineups = await listLineups(
        database,
        data.campaignId,
        data.seasonId,
      )
      if (
        lineups.some(
          (lineup) =>
            lineup.id !== data.lineupId && lineup.name.trim() === data.name,
        )
      )
        throw new PersistenceError(
          'SCOPE',
          'A lineup with this name already exists.',
        )
      const lineup = lineupSchema.parse({
        id: data.lineupId,
        campaignId: data.campaignId,
        seasonId: data.seasonId,
        name: data.name,
        formation: data.formation,
        starters: data.starters,
        benchPlayerIds: data.benchPlayerIds,
        updatedAt: data.now,
      })
      if (existing) await updateLineup(database, data.campaignId, lineup)
      else await insertLineup(database, data.campaignId, lineup)
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
          actionType: 'lineup.save',
          createdAt: data.now,
          summary: `Saved lineup ${data.name}`,
          payload: data,
        }),
      )
      return lineup
    },
  )
}
