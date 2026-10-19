import { z } from 'zod'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  auditEventSchema,
  campaignSchema,
  clubSchema,
  entityIdSchema,
  seasonSchema,
  type Campaign,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import type { CommandResult } from '../../domain/commands/result'
import { runCommand } from '../transactions/run-command'
import { insertCampaign } from '../repositories/campaigns'
import { insertClub } from '../repositories/clubs'
import { insertSeason } from '../repositories/seasons'

export const createCampaignInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  clubId: entityIdSchema,
  seasonId: entityIdSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  name: campaignSchema.shape.name,
  kind: campaignSchema.shape.kind,
  seed: campaignSchema.shape.seed,
  generatorVersion: campaignSchema.shape.generatorVersion,
  now: timestampUtcSchema,
  clubName: clubSchema.shape.name,
  shortName: clubSchema.shape.shortName,
  colors: clubSchema.shape.colors,
  prestige: clubSchema.shape.prestige,
  academyTier: clubSchema.shape.academyTier,
  scoutingRegion: clubSchema.shape.scoutingRegion,
})

export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>

export function createCampaign(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Campaign>> {
  return runCommand(
    database,
    [
      database.clubs,
      database.seasons,
      database.campaigns,
      database.auditEvents,
    ],
    { kind: 'create' },
    async (revision) => {
      const parsed = createCampaignInputSchema.parse(input)
      const club = clubSchema.parse({
        id: parsed.clubId,
        campaignId: parsed.campaignId,
        leagueId: null,
        name: parsed.clubName,
        shortName: parsed.shortName,
        colors: parsed.colors,
        prestige: parsed.prestige,
        academyTier: parsed.academyTier,
        scoutingRegion: parsed.scoutingRegion,
      })
      const season = seasonSchema.parse({
        id: parsed.seasonId,
        campaignId: parsed.campaignId,
        label: 'Season 1',
        ordinal: 1,
        status: 'active',
        startDate: parsed.now.slice(0, 10),
        endDate: null,
        openedAt: parsed.now,
        closedAt: null,
      })
      const campaign = campaignSchema.parse({
        id: parsed.campaignId,
        name: parsed.name,
        kind: parsed.kind,
        seed: parsed.seed,
        generatorVersion: parsed.generatorVersion,
        managedClubId: parsed.clubId,
        activeSeasonId: parsed.seasonId,
        currency: 'EUR',
        createdAt: parsed.now,
        updatedAt: parsed.now,
        revision,
        status: 'active',
      })
      const audit = auditEventSchema.parse({
        id: parsed.auditEventId,
        campaignId: parsed.campaignId,
        seasonId: parsed.seasonId,
        actionId: parsed.actionId,
        actionType: 'campaign.create',
        createdAt: parsed.now,
        summary: `Created campaign ${parsed.name}`,
        payload: parsed,
      })
      await insertClub(database, parsed.campaignId, club)
      await insertSeason(database, parsed.campaignId, season)
      await insertCampaign(database, campaign)
      await database.auditEvents.add(audit)
      return campaign
    },
  )
}
