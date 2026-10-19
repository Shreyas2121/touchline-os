import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  FEATURED_CAMPAIGN_ID,
  FEATURED_SEED,
  GENERATOR_VERSION,
  generateWorld,
} from '../../domain/seed/generate-world'
import {
  auditEventSchema,
  campaignSchema,
  clubSchema,
  entityIdSchema,
  leagueSchema,
  playerSchema,
  seasonSchema,
  type Campaign,
} from '../../domain/validation/schemas'
import { limits } from '../../domain/validation/limits'
import type { TouchlineDatabase } from '../db'
import { listAuditEvents } from '../repositories/audit-events'
import {
  getCampaign,
  insertCampaign,
  updateCampaign,
} from '../repositories/campaigns'
import { insertClub, listClubs } from '../repositories/clubs'
import { insertLeague, listLeagues } from '../repositories/leagues'
import { insertPlayer, listPlayers } from '../repositories/players'
import { insertSeason } from '../repositories/seasons'
import { runCommand } from '../transactions/run-command'

export type SeedProgress = {
  stage: 'leagues' | 'clubs' | 'players' | 'ready'
  done: number
  total: number
}

const inputSchema = z.strictObject({
  campaignId: entityIdSchema,
  seed: z.string().min(1).max(limits.seedMax),
  generatorVersion: z.string().min(1).max(limits.generatorVersionMax),
  now: timestampUtcSchema,
  reason: z.enum(['create', 'reset']),
  createAuditEventId: entityIdSchema,
  createActionId: entityIdSchema,
  seedAuditEventId: entityIdSchema,
  seedActionId: entityIdSchema,
})

export async function seedDemoCampaign(
  database: TouchlineDatabase,
  input: unknown,
  onProgress: (progress: SeedProgress) => void,
): Promise<CommandResult<Campaign>> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    }
  const command = parsed.data
  const { campaignId, seed, generatorVersion, now, reason } = command
  if (
    campaignId !== FEATURED_CAMPAIGN_ID ||
    seed !== FEATURED_SEED ||
    generatorVersion !== GENERATOR_VERSION
  ) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Only the fictional demo can be seeded.',
    }
  }
  const generated = generateWorld({ campaignId, seed, generatorVersion })
  if (!generated.ok)
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Unsupported generator version.',
    }
  const world = generated.value
  let campaign = await getCampaign(database, campaignId)
  if (
    campaign &&
    (campaign.seed !== FEATURED_SEED ||
      campaign.generatorVersion !== GENERATOR_VERSION)
  ) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Demo world version does not match.',
    }
  }
  const leagues = await listLeagues(database, campaignId)
  const clubs = await listClubs(database, campaignId)
  const players = await listPlayers(database, campaignId)
  const audits = await listAuditEvents(database, campaignId)
  const hasSeedAudit = audits.some(
    (audit) => audit.actionType === 'campaign.seed',
  )
  if (
    campaign &&
    leagues.length === 4 &&
    clubs.length === 72 &&
    players.length === 3000 &&
    hasSeedAudit
  ) {
    onProgress({ stage: 'ready', done: 3000, total: 3000 })
    return { ok: true, revision: campaign.revision, value: campaign }
  }

  const seasonId = entityIdSchema.parse('demo-season-1')
  const leagueIds = new Set(leagues.map((league) => String(league.id)))
  const clubIds = new Set(clubs.map((club) => String(club.id)))
  const hasCreateAudit = audits.some(
    (audit) => audit.actionType === 'campaign.create',
  )
  const season = await database.seasons.get(seasonId)
  if (
    !campaign ||
    world.leagues.some((league) => !leagueIds.has(league.id)) ||
    world.clubs.some((club) => !clubIds.has(club.id)) ||
    !season ||
    !hasCreateAudit
  ) {
    if (leagues.length < 4)
      onProgress({ stage: 'leagues', done: leagues.length, total: 4 })
    if (clubs.length < 72)
      onProgress({ stage: 'clubs', done: clubs.length, total: 72 })
    campaign = await getCampaign(database, campaignId)
    const existing = campaign
    const result = await runCommand(
      database,
      [
        database.leagues,
        database.clubs,
        database.seasons,
        database.campaigns,
        database.auditEvents,
      ],
      existing
        ? { kind: 'update', campaignId, expectedRevision: existing.revision }
        : { kind: 'create' },
      async (revision) => {
        for (const draft of world.leagues) {
          const league = leagueSchema.parse(draft)
          if (!(await database.leagues.get(league.id)))
            await insertLeague(database, campaignId, league)
        }
        for (const draft of world.clubs) {
          const club = clubSchema.parse(draft)
          if (!(await database.clubs.get(club.id)))
            await insertClub(database, campaignId, club)
        }
        if (!(await database.seasons.get(seasonId))) {
          await insertSeason(
            database,
            campaignId,
            seasonSchema.parse({
              id: seasonId,
              campaignId,
              label: 'Season 1',
              ordinal: 1,
              status: 'active',
              startDate: now.slice(0, 10),
              endDate: null,
              openedAt: now,
              closedAt: null,
            }),
          )
        }
        const stored = await getCampaign(database, campaignId)
        const updated = campaignSchema.parse(
          stored
            ? { ...stored, revision, updatedAt: now }
            : {
                id: campaignId,
                name: 'Fictional demo',
                kind: 'fictional',
                seed,
                generatorVersion,
                managedClubId: 'demo-club-01',
                activeSeasonId: seasonId,
                currency: 'EUR',
                createdAt: now,
                updatedAt: now,
                revision,
              },
        )
        if (stored) await updateCampaign(database, updated)
        else await insertCampaign(database, updated)
        const currentAudits = await listAuditEvents(database, campaignId)
        if (
          !currentAudits.some((audit) => audit.actionType === 'campaign.create')
        ) {
          await database.auditEvents.add(
            auditEventSchema.parse({
              id: command.createAuditEventId,
              campaignId,
              seasonId,
              actionId: command.createActionId,
              actionType: 'campaign.create',
              createdAt: now,
              summary: 'Created campaign Fictional demo',
              payload: command,
            }),
          )
        }
        return updated
      },
    )
    if (!result.ok) return result
    campaign = result.value
  }

  for (let offset = 0; offset < world.players.length; offset += 250) {
    const slice = world.players.slice(offset, offset + 250)
    const storedRows = await database.players.bulkGet(
      slice.map((player) => entityIdSchema.parse(player.id)),
    )
    const missing = slice.filter((_, i) => storedRows[i] === undefined)
    if (missing.length === 0) continue
    const storedCount = await database.players
      .where('campaignId')
      .equals(campaignId)
      .count()
    campaign = await getCampaign(database, campaignId)
    if (!campaign)
      return { ok: false, code: 'NOT_FOUND', message: 'Campaign not found.' }
    const existing = campaign
    const result = await runCommand(
      database,
      // insertPlayer checks club ownership inside the same transaction.
      [database.players, database.campaigns, database.clubs],
      { kind: 'update', campaignId, expectedRevision: existing.revision },
      async (revision) => {
        onProgress({ stage: 'players', done: storedCount, total: 3000 })
        for (const draft of missing) {
          const { weeklyWageCents, ...record } = draft
          void weeklyWageCents
          const player = playerSchema.parse(record)
          if (!(await database.players.get(player.id)))
            await insertPlayer(database, campaignId, player)
        }
        const updated = campaignSchema.parse({
          ...existing,
          revision,
          updatedAt: now,
        })
        await updateCampaign(database, updated)
        return updated
      },
    )
    if (!result.ok) return result
    campaign = result.value
  }

  const playerCount = await database.players
    .where('campaignId')
    .equals(campaignId)
    .count()
  if (playerCount !== 3000) {
    return { ok: false, code: 'ABORTED', message: 'Command did not finish.' }
  }
  const currentAudits = await listAuditEvents(database, campaignId)
  if (
    playerCount === 3000 &&
    !currentAudits.some((audit) => audit.actionType === 'campaign.seed')
  ) {
    campaign = await getCampaign(database, campaignId)
    if (!campaign)
      return { ok: false, code: 'NOT_FOUND', message: 'Campaign not found.' }
    const existing = campaign
    const result = await runCommand(
      database,
      [database.campaigns, database.auditEvents],
      { kind: 'update', campaignId, expectedRevision: existing.revision },
      async (revision) => {
        const batchAudits = await listAuditEvents(database, campaignId)
        if (
          !batchAudits.some((audit) => audit.actionType === 'campaign.seed')
        ) {
          await database.auditEvents.add(
            auditEventSchema.parse({
              id: command.seedAuditEventId,
              campaignId,
              seasonId,
              actionId: command.seedActionId,
              actionType: 'campaign.seed',
              createdAt: now,
              summary:
                reason === 'create'
                  ? 'Seeded fictional world'
                  : 'Reset fictional world',
              payload: {
                seed,
                generatorVersion,
                leagueCount: 4,
                clubCount: 72,
                playerCount: 3000,
                reason,
              },
            }),
          )
        }
        const updated = campaignSchema.parse({
          ...existing,
          revision,
          updatedAt: now,
        })
        await updateCampaign(database, updated)
        return updated
      },
    )
    if (!result.ok) return result
    campaign = result.value
  }
  if (!campaign)
    return { ok: false, code: 'NOT_FOUND', message: 'Campaign not found.' }
  onProgress({ stage: 'ready', done: 3000, total: 3000 })
  return { ok: true, revision: campaign.revision, value: campaign }
}
