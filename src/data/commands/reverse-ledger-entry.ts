import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { ledgerKindLabel } from '../../domain/finance/capacity'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  ledgerEntrySchema,
  type LedgerEntry,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import {
  getLedgerEntry,
  insertLedgerEntry,
} from '../repositories/ledger-entries'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const reverseLedgerEntryInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  entryId: entityIdSchema,
  reversalId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  note: z.string().trim().min(1).max(4_000),
})

export function reverseLedgerEntry(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<LedgerEntry>> {
  const parsed = reverseLedgerEntryInputSchema.safeParse(input)
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
      const target = await getLedgerEntry(database, campaign.id, data.entryId)
      if (!target) rejectCommand('NOT_FOUND', 'Ledger entry not found.')
      const rows = await database.ledgerEntries
        .where('reversesEntryId')
        .equals(target.id)
        .toArray()
      const reversals = rows
        .filter((row) => row.campaignId === campaign.id)
        .map((row) => parseStored(ledgerEntrySchema, row))
      if (
        target.kind === 'reversal' ||
        reversals.some((row) => row.kind === 'reversal')
      )
        throw new PersistenceError('SCOPE', 'This entry cannot be reversed.')
      const entry = ledgerEntrySchema.parse({
        id: data.reversalId,
        campaignId: campaign.id,
        seasonId: target.seasonId,
        clubId: target.clubId,
        kind: 'reversal',
        amountCents: target.amountCents,
        effectiveOn: target.effectiveOn,
        sourceActionId: data.actionId,
        reversesEntryId: target.id,
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
          seasonId: target.seasonId,
          actionId: data.actionId,
          actionType: 'ledger.reverse',
          createdAt: data.now,
          summary: `Reversed ${ledgerKindLabel(target.kind)}`,
          payload: data,
        }),
      )
      return entry
    },
  )
}
