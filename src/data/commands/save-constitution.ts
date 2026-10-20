import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import {
  auditEventSchema,
  campaignSchema,
  constitutionSchema,
  entityIdSchema,
  ledgerEntrySchema,
  type Campaign,
  type Constitution,
  type Season,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import {
  insertConstitution,
  listConstitutions,
} from '../repositories/constitutions'
import {
  insertLedgerEntry,
  listLedgerEntries,
} from '../repositories/ledger-entries'
import { getActiveSeason } from '../repositories/seasons'
import { rejectChallengeConstitution } from './guards'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const saveConstitutionInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  constitutionId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  ledgerEntryId: entityIdSchema,
  effectiveOn: dateOnlySchema,
  rules: constitutionSchema.shape.rules,
})

type ConstitutionWrite = Omit<
  z.infer<typeof saveConstitutionInputSchema>,
  'expectedRevision'
>

// Both callers provide the transaction, campaign revision and explicit ids.
export async function writeConstitution(
  database: TouchlineDatabase,
  campaign: Campaign,
  season: Season,
  data: ConstitutionWrite,
): Promise<Constitution> {
  if (
    campaign.id !== data.campaignId ||
    season.campaignId !== campaign.id ||
    season.id !== campaign.activeSeasonId ||
    season.status !== 'active'
  )
    throw new PersistenceError('SCOPE', 'Season is not the active season.')
  const versions = await listConstitutions(database, campaign.id)
  const constitution = constitutionSchema.parse({
    id: data.constitutionId,
    campaignId: campaign.id,
    version: (versions.at(-1)?.version ?? 0) + 1,
    updatedAt: data.now,
    rules: data.rules,
  })
  await insertConstitution(database, campaign.id, constitution)
  const rule = constitution.rules.find((item) => item.id === 'SELL_TO_BUY')
  if (rule?.enabled) {
    const entries = await listLedgerEntries(
      database,
      campaign.id,
      season.id,
      campaign.managedClubId,
    )
    const reversed = new Set(
      entries
        .filter((entry) => entry.kind === 'reversal')
        .map((entry) => entry.reversesEntryId),
    )
    if (
      !entries.some(
        (entry) =>
          entry.kind === 'initial_allocation' && !reversed.has(entry.id),
      )
    ) {
      await insertLedgerEntry(
        database,
        campaign.id,
        ledgerEntrySchema.parse({
          id: data.ledgerEntryId,
          campaignId: campaign.id,
          seasonId: season.id,
          clubId: campaign.managedClubId,
          kind: 'initial_allocation',
          amountCents: rule.initialAllocationCents,
          effectiveOn: data.effectiveOn,
          sourceActionId: data.actionId,
          reversesEntryId: null,
          note: null,
        }),
      )
    }
  }
  await database.auditEvents.add(
    auditEventSchema.parse({
      id: data.auditEventId,
      campaignId: campaign.id,
      seasonId: season.id,
      actionId: data.actionId,
      actionType: 'constitution.save',
      createdAt: data.now,
      summary: `Saved constitution version ${constitution.version}`,
      payload: data,
    }),
  )
  return constitution
}

export function saveConstitution(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Constitution>> {
  const parsed = saveConstitutionInputSchema.safeParse(input)
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
      database.constitutions,
      database.ledgerEntries,
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
      const campaign = await getCampaign(database, data.campaignId)
      if (!campaign) rejectCommand('NOT_FOUND', 'Campaign not found.')
      rejectChallengeConstitution(campaign)
      const season = await getActiveSeason(database, campaign.id)
      if (!season)
        throw new PersistenceError('SCOPE', 'Season is not the active season.')
      const constitution = await writeConstitution(
        database,
        campaign,
        season,
        data,
      )
      await updateCampaign(
        database,
        campaignSchema.parse({ ...campaign, revision, updatedAt: data.now }),
      )
      return constitution
    },
  )
}
