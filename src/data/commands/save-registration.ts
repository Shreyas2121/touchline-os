import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import { displayAge } from '../../domain/player/squad-view'
import { evaluateAction } from '../../domain/rules/evaluate-action'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  registrationSchema,
  type Registration,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { listConstitutions } from '../repositories/constitutions'
import { getPlayer } from '../repositories/players'
import {
  insertRegistration,
  listRegistrations,
  updateRegistration,
} from '../repositories/registrations'
import { getActiveSeason } from '../repositories/seasons'
import { rejectCommand, runCommand } from '../transactions/run-command'

const registrationPlayerInputSchema = z.strictObject({
  playerId: entityIdSchema,
  registrationId: entityIdSchema,
  status: registrationSchema.shape.status,
  homegrownClub: registrationSchema.shape.homegrownClub,
  homegrownNation: registrationSchema.shape.homegrownNation,
  ageExempt: registrationSchema.shape.ageExempt,
})

export const saveRegistrationInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  seasonId: entityIdSchema,
  competitionKey: registrationSchema.shape.competitionKey,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  players: z.array(registrationPlayerInputSchema),
})

export function saveRegistration(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<{ count: number }>> {
  const parsed = saveRegistrationInputSchema.safeParse(input)
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
      database.constitutions,
      database.registrations,
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
      const season = await getActiveSeason(database, campaign.id)
      if (!season || season.id !== data.seasonId)
        throw new PersistenceError('SCOPE', 'Season is not the active season.')
      const constitution = (await listConstitutions(database, campaign.id)).at(
        -1,
      )
      if (!constitution)
        throw new PersistenceError(
          'SCOPE',
          'Save a constitution before registering a squad.',
        )
      const rule = constitution.rules.find(
        (item) => item.id === 'REGISTRATION_QUOTA',
      )
      if (
        rule?.id === 'REGISTRATION_QUOTA' &&
        rule.competitionKey !== data.competitionKey
      )
        throw new PersistenceError(
          'SCOPE',
          'Registration uses the constitution competition.',
        )
      const evaluated = []
      for (const entry of data.players) {
        const player = await getPlayer(database, campaign.id, entry.playerId)
        if (!player) rejectCommand('NOT_FOUND', 'Player not found.')
        if (player.clubId !== campaign.managedClubId)
          throw new PersistenceError(
            'SCOPE',
            'That player is not at the managed club.',
          )
        const age = displayAge(player, season)
        evaluated.push({
          playerId: entry.playerId,
          status: entry.status,
          homegrownClub: entry.homegrownClub,
          homegrownNation: entry.homegrownNation,
          ageExempt: entry.ageExempt,
          age: age.kind === 'unknown' ? null : age.years,
        })
      }
      if (rule?.id === 'REGISTRATION_QUOTA' && rule.enabled) {
        const report = evaluateAction(
          {
            type: 'registration',
            competitionKey: data.competitionKey,
            players: evaluated,
          },
          { revision: campaign.revision, remainingCapacityCents: null },
          constitution,
          season.startDate ?? dateOnlySchema.parse(data.now.slice(0, 10)),
        )
        const blocker = report.verdicts.find(
          (verdict) => verdict.severity === 'BLOCK',
        )
        if (blocker) throw new PersistenceError('SCOPE', blocker.message)
      }
      const existing = await listRegistrations(
        database,
        campaign.id,
        season.id,
        data.competitionKey,
      )
      const byPlayer = new Map(existing.map((row) => [row.playerId, row]))
      const selected = new Set(data.players.map((entry) => entry.playerId))
      for (const entry of data.players) {
        const stored = byPlayer.get(entry.playerId)
        if (stored && stored.id !== entry.registrationId)
          throw new PersistenceError(
            'DUPLICATE',
            'A row with this id already exists.',
          )
        const row = registrationSchema.parse({
          id: stored?.id ?? entry.registrationId,
          campaignId: campaign.id,
          seasonId: season.id,
          playerId: entry.playerId,
          competitionKey: data.competitionKey,
          status: entry.status,
          homegrownClub: entry.homegrownClub,
          homegrownNation: entry.homegrownNation,
          ageExempt: entry.ageExempt,
          provenance: 'user-entered',
        })
        if (stored) await updateRegistration(database, campaign.id, row)
        else await insertRegistration(database, campaign.id, row)
      }
      for (const stored of existing) {
        if (selected.has(stored.playerId)) continue
        const player = await getPlayer(database, campaign.id, stored.playerId)
        if (!player || player.clubId !== campaign.managedClubId) continue
        const row: Registration = registrationSchema.parse({
          ...stored,
          status: 'ineligible',
          provenance: 'user-entered',
        })
        await updateRegistration(database, campaign.id, row)
      }
      await updateCampaign(
        database,
        campaignSchema.parse({ ...campaign, updatedAt: data.now, revision }),
      )
      await database.auditEvents.add(
        auditEventSchema.parse({
          id: data.auditEventId,
          campaignId: campaign.id,
          seasonId: season.id,
          actionId: data.actionId,
          actionType: 'registration.save',
          createdAt: data.now,
          summary: `Saved registration for ${data.competitionKey}`,
          payload: data,
        }),
      )
      return { count: data.players.length }
    },
  )
}
