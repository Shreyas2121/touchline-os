import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import { formatMoneyEuros, moneyCentsSchema } from '../../domain/models/money'
import { ledgerKindLabel } from '../../domain/finance/capacity'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  ledgerEntrySchema,
  type LedgerEntry,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import {
  insertLedgerEntry,
  listLedgerEntries,
} from '../repositories/ledger-entries'
import { getActiveSeason } from '../repositories/seasons'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const postLedgerEntryInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  entryId: entityIdSchema,
  seasonId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  kind: z.enum(['initial_allocation', 'prize_income']),
  amountCents: moneyCentsSchema,
  effectiveOn: dateOnlySchema,
  note: z.string().trim().min(1).max(4_000).nullable(),
})

export function postLedgerEntry(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<LedgerEntry>> {
  const parsed = postLedgerEntryInputSchema.safeParse(input)
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
      const season = await getActiveSeason(database, campaign.id)
      if (
        !season ||
        season.id !== data.seasonId ||
        campaign.activeSeasonId !== season.id
      )
        throw new PersistenceError('SCOPE', 'Season is not the active season.')
      if (data.kind === 'initial_allocation') {
        const entries = await listLedgerEntries(
          database,
          campaign.id,
          season.id,
          campaign.managedClubId,
        )
        const reversedIds = new Set(
          entries
            .filter((entry) => entry.kind === 'reversal')
            .map((entry) => entry.reversesEntryId),
        )
        if (
          entries.some(
            (entry) =>
              entry.kind === 'initial_allocation' && !reversedIds.has(entry.id),
          )
        )
          throw new PersistenceError(
            'SCOPE',
            'An opening allocation is already posted.',
          )
      }
      const entry = ledgerEntrySchema.parse({
        id: data.entryId,
        campaignId: campaign.id,
        seasonId: season.id,
        clubId: campaign.managedClubId,
        kind: data.kind,
        amountCents: data.amountCents,
        effectiveOn: data.effectiveOn,
        sourceActionId: data.actionId,
        reversesEntryId: null,
        note: data.note,
      })
      await insertLedgerEntry(database, campaign.id, entry)
      await updateCampaign(
        database,
        campaignSchema.parse({ ...campaign, revision, updatedAt: data.now }),
      )
      await database.auditEvents.add(
        auditEventSchema.parse({
          id: data.auditEventId,
          campaignId: campaign.id,
          seasonId: season.id,
          actionId: data.actionId,
          actionType: 'ledger.post',
          createdAt: data.now,
          summary: `Posted ${ledgerKindLabel(data.kind)} of ${formatMoneyEuros(data.amountCents)}`,
          payload: data,
        }),
      )
      return entry
    },
  )
}
