import { z } from 'zod'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import { constitutionPreset } from '../../domain/rules/presets'
import { writeConstitution } from './save-constitution'
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

const baseInputSchema = z.strictObject({
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

export const createCampaignInputSchema = z.union([
  baseInputSchema,
  baseInputSchema.extend({
    preset: z.enum(['balanced', 'strict', 'custom']),
    constitutionId: entityIdSchema,
    constitutionActionId: entityIdSchema,
    ledgerEntryId: entityIdSchema,
  }),
])

export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>

export function createCampaign(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Campaign>> {
  const result = createCampaignInputSchema.safeParse(input)
  if (!result.success)
    return Promise.resolve({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
  const parsed = result.data
  return runCommand(
    database,
    [
      database.clubs,
      database.seasons,
      database.campaigns,
      database.auditEvents,
      ...('preset' in parsed
        ? [database.constitutions, database.ledgerEntries]
        : []),
    ],
    { kind: 'create' },
    async (revision) => {
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
      if ('preset' in parsed) {
        await writeConstitution(database, campaign, season, {
          campaignId: campaign.id,
          constitutionId: parsed.constitutionId,
          actionId: parsed.constitutionActionId,
          auditEventId: parsed.constitutionActionId,
          ledgerEntryId: parsed.ledgerEntryId,
          now: parsed.now,
          effectiveOn: dateOnlySchema.parse(parsed.now.slice(0, 10)),
          rules: constitutionPreset(parsed.preset),
        })
      }
      return campaign
    },
  )
}
