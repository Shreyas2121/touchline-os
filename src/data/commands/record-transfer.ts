import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { transferCapacity } from '../../domain/finance/capacity'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import {
  formatMoneyEuros,
  moneyCentsSchema,
  type MoneyCents,
} from '../../domain/models/money'
import { displayAge } from '../../domain/player/squad-view'
import { evaluateAction } from '../../domain/rules/evaluate-action'
import {
  auditEventSchema,
  campaignSchema,
  contractSchema,
  entityIdSchema,
  ledgerEntrySchema,
  lineupSchema,
  playerSchema,
  transferSchema,
  type EntityId,
  type Lineup,
  type Transfer,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { getClub } from '../repositories/clubs'
import { listConstitutions } from '../repositories/constitutions'
import {
  insertContract,
  listContractsByPlayer,
  updateContract,
} from '../repositories/contracts'
import {
  insertLedgerEntry,
  listLedgerEntries,
} from '../repositories/ledger-entries'
import { listLineups, updateLineup } from '../repositories/lineups'
import { getPlayer, updateStoredPlayer } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { insertTransfer } from '../repositories/transfers'
import { rejectCommand, runCommand } from '../transactions/run-command'

const directionSchema = z.enum(['purchase', 'free-in', 'sale', 'free-out'])

export const recordTransferInputSchema = z
  .strictObject({
    campaignId: entityIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    now: timestampUtcSchema,
    seasonId: entityIdSchema,
    playerId: entityIdSchema,
    effectiveOn: dateOnlySchema,
    direction: directionSchema,
    feeCents: moneyCentsSchema,
    weeklyWageCents: moneyCentsSchema.nullable(),
    squadTier: z.enum(['key', 'rotation', 'youth']).nullable(),
    startsOn: dateOnlySchema.nullable(),
    expiresOn: dateOnlySchema.nullable(),
    destinationClubId: entityIdSchema.nullable(),
    transferId: entityIdSchema,
    ledgerEntryId: entityIdSchema.nullable(),
    contractId: entityIdSchema.nullable(),
    auditEventId: entityIdSchema,
    actionId: entityIdSchema,
    acknowledgedWarnings: z.boolean(),
  })
  .superRefine((input, context) => {
    const paid = input.direction === 'purchase' || input.direction === 'sale'
    if (paid ? input.feeCents <= 0 : input.feeCents !== 0)
      context.addIssue({ code: 'custom', message: 'fee' })
    if (
      input.direction === 'purchase' &&
      (input.ledgerEntryId === null || input.contractId === null)
    )
      context.addIssue({ code: 'custom', message: 'purchase' })
    if (
      input.direction === 'free-in' &&
      (input.contractId === null || input.ledgerEntryId !== null)
    )
      context.addIssue({ code: 'custom', message: 'free-in' })
    if (
      input.direction === 'sale' &&
      (input.ledgerEntryId === null ||
        input.destinationClubId === null ||
        input.contractId !== null)
    )
      context.addIssue({ code: 'custom', message: 'sale' })
    if (
      input.direction === 'free-out' &&
      (input.ledgerEntryId !== null ||
        input.destinationClubId !== null ||
        input.contractId !== null)
    )
      context.addIssue({ code: 'custom', message: 'free-out' })
  })

type RecordTransferInput = z.infer<typeof recordTransferInputSchema>

export function recordTransfer(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Transfer>> {
  const parsed = recordTransferInputSchema.safeParse(input)
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
      database.clubs,
      database.players,
      database.contracts,
      database.constitutions,
      database.ledgerEntries,
      database.lineups,
      database.transfers,
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
      const player = await getPlayer(database, campaign.id, data.playerId)
      if (!player) rejectCommand('NOT_FOUND', 'Player not found.')
      const constitution = (await listConstitutions(database, campaign.id)).at(
        -1,
      )
      const entries = await listLedgerEntries(
        database,
        campaign.id,
        season.id,
        campaign.managedClubId,
      )
      const contracts = await listContractsByPlayer(
        database,
        campaign.id,
        data.playerId,
      )
      const lineups = await listLineups(database, campaign.id, season.id)
      const arriving =
        data.direction === 'purchase' || data.direction === 'free-in'
      let nextClubId: EntityId | null
      if (arriving) {
        if (player.clubId === campaign.managedClubId)
          throw new PersistenceError(
            'SCOPE',
            'That player cannot take this move.',
          )
        nextClubId = campaign.managedClubId
      } else if (player.clubId !== campaign.managedClubId) {
        throw new PersistenceError(
          'SCOPE',
          'That player cannot take this move.',
        )
      } else if (data.direction === 'free-out') {
        nextClubId = null
      } else {
        const destinationId = data.destinationClubId
        if (destinationId === null)
          throw new PersistenceError(
            'SCOPE',
            'That player cannot take this move.',
          )
        const destination = await getClub(database, campaign.id, destinationId)
        if (!destination || destination.id === campaign.managedClubId)
          throw new PersistenceError(
            'SCOPE',
            'That player cannot take this move.',
          )
        nextClubId = destination.id
      }
      if (arriving && constitution) {
        const rule = constitution.rules.find(
          (item) => item.id === 'SELL_TO_BUY',
        )
        const age = displayAge(player, season)
        const report = evaluateAction(
          {
            type: 'incoming-transfer',
            feeCents: data.feeCents,
            isFree: data.direction === 'free-in',
            age: age.kind === 'unknown' ? null : age.years,
            weeklyWageCents: data.weeklyWageCents,
            squadTier: data.squadTier,
          },
          {
            revision: campaign.revision,
            remainingCapacityCents: transferCapacity(
              entries,
              season.id,
              campaign.managedClubId,
              {
                salesReinvestmentPct: rule?.salesReinvestmentPct ?? 0,
                prizeReinvestmentPct: rule?.prizeReinvestmentPct ?? 0,
              },
            ).remainingCents,
          },
          constitution,
          data.effectiveOn,
        )
        const block = report.verdicts.find(
          (verdict) => verdict.severity === 'BLOCK',
        )
        if (block) throw new PersistenceError('SCOPE', block.message)
        if (
          report.verdicts.some((verdict) => verdict.severity === 'WARN') &&
          !data.acknowledgedWarnings
        )
          throw new PersistenceError(
            'SCOPE',
            'Acknowledge the warning before recording.',
          )
      }
      const managedActive = contracts.filter(
        (contract) =>
          contract.status === 'active' &&
          contract.clubId === campaign.managedClubId,
      )
      if (!arriving && managedActive.length > 1)
        throw new PersistenceError(
          'SCOPE',
          'More than one active contract exists for this player.',
        )
      await updateStoredPlayer(
        database,
        campaign.id,
        playerSchema.parse({ ...player, clubId: nextClubId }),
      )
      const transfer = transferSchema.parse({
        id: data.transferId,
        campaignId: campaign.id,
        seasonId: season.id,
        playerId: player.id,
        fromClubId: arriving ? player.clubId : campaign.managedClubId,
        toClubId: arriving ? campaign.managedClubId : nextClubId,
        feeCents: data.feeCents,
        kind:
          data.direction === 'purchase'
            ? 'purchase'
            : data.direction === 'sale'
              ? 'sale'
              : 'free',
        effectiveOn: data.effectiveOn,
        sourceActionId: data.actionId,
      })
      await insertTransfer(database, campaign.id, transfer)
      if (data.direction === 'purchase' || data.direction === 'sale') {
        await insertLedgerEntry(
          database,
          campaign.id,
          ledgerEntrySchema.parse({
            id: requiredId(data.ledgerEntryId),
            campaignId: campaign.id,
            seasonId: season.id,
            clubId: campaign.managedClubId,
            kind:
              data.direction === 'purchase' ? 'incoming_fee' : 'player_sale',
            amountCents: data.feeCents,
            effectiveOn: data.effectiveOn,
            sourceActionId: data.actionId,
            reversesEntryId: null,
            note: player.name,
          }),
        )
      }
      if (arriving) {
        await insertContract(
          database,
          campaign.id,
          contractSchema.parse({
            id: requiredId(data.contractId),
            campaignId: campaign.id,
            playerId: player.id,
            clubId: campaign.managedClubId,
            weeklyWageCents: data.weeklyWageCents,
            squadTier: data.squadTier,
            startsOn: data.startsOn,
            expiresOn: data.expiresOn,
            status: 'active',
          }),
        )
      } else {
        if (managedActive[0]) {
          await updateContract(
            database,
            campaign.id,
            contractSchema.parse({ ...managedActive[0], status: 'ended' }),
          )
        }
        for (const lineup of lineups) {
          const cleared = withoutPlayer(lineup, player.id, data.now)
          if (cleared) await updateLineup(database, campaign.id, cleared)
        }
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
          actionType: 'transfer.record',
          createdAt: data.now,
          summary: recordedSummary(data.direction, player.name, data.feeCents),
          payload: data,
        }),
      )
      return transfer
    },
  )
}

function requiredId(value: EntityId | null): EntityId {
  if (value === null)
    throw new PersistenceError('SCOPE', 'Command input is not valid.')
  return value
}

function withoutPlayer(
  lineup: Lineup,
  playerId: EntityId,
  now: RecordTransferInput['now'],
): Lineup | undefined {
  const starters = lineup.starters.filter(
    (starter) => starter.playerId !== playerId,
  )
  const benchPlayerIds = lineup.benchPlayerIds.filter((id) => id !== playerId)
  if (
    starters.length === lineup.starters.length &&
    benchPlayerIds.length === lineup.benchPlayerIds.length
  )
    return undefined
  return lineupSchema.parse({
    ...lineup,
    starters,
    benchPlayerIds,
    updatedAt: now,
  })
}

function recordedSummary(
  direction: RecordTransferInput['direction'],
  playerName: string,
  feeCents: MoneyCents,
): string {
  const euros = formatMoneyEuros(feeCents)
  switch (direction) {
    case 'purchase':
      return `Recorded purchase of ${playerName} for ${euros}`
    case 'free-in':
      return `Recorded free signing of ${playerName}`
    case 'sale':
      return `Recorded sale of ${playerName} for ${euros}`
    case 'free-out':
      return `Recorded free departure of ${playerName}`
  }
}
