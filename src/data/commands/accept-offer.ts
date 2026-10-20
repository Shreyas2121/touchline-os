import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import {
  auditEventSchema,
  campaignSchema,
  contractSchema,
  entityIdSchema,
  ledgerEntrySchema,
  lineupSchema,
  offerSchema,
  playerSchema,
  transferSchema,
  type EntityId,
  type Lineup,
  type Offer,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { getClub } from '../repositories/clubs'
import {
  listContractsByPlayer,
  updateContract,
} from '../repositories/contracts'
import { insertLedgerEntry } from '../repositories/ledger-entries'
import { listLineups, updateLineup } from '../repositories/lineups'
import { getOffer, updateOffer } from '../repositories/offers'
import { getPlayer, updateStoredPlayer } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { insertTransfer } from '../repositories/transfers'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const acceptOfferInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  offerId: entityIdSchema,
  resolvedOn: dateOnlySchema,
  effectiveOn: dateOnlySchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  transferId: entityIdSchema,
  ledgerEntryId: entityIdSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

type AcceptOfferInput = z.infer<typeof acceptOfferInputSchema>

export function acceptOffer(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Offer>> {
  const parsed = acceptOfferInputSchema.safeParse(input)
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
      database.offers,
      database.players,
      database.clubs,
      database.seasons,
      database.campaigns,
      database.contracts,
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
      const offer = await getOffer(database, campaign.id, data.offerId)
      if (!offer) rejectCommand('NOT_FOUND', 'Offer not found.')
      if (offer.status !== 'open')
        throw new PersistenceError('SCOPE', 'That offer is already resolved.')
      const season = await getActiveSeason(database, campaign.id)
      if (!season || season.id !== offer.seasonId)
        throw new PersistenceError('SCOPE', 'Season is not the active season.')
      const player = await getPlayer(database, campaign.id, offer.playerId)
      if (!player) rejectCommand('NOT_FOUND', 'Player not found.')
      if (player.clubId !== campaign.managedClubId)
        throw new PersistenceError(
          'SCOPE',
          'That player cannot take this move.',
        )
      const bidder = await getClub(database, campaign.id, offer.bidderClubId)
      if (!bidder || bidder.id === campaign.managedClubId)
        throw new PersistenceError(
          'SCOPE',
          'That player cannot take this move.',
        )
      const contracts = await listContractsByPlayer(
        database,
        campaign.id,
        player.id,
      )
      const managedActive = contracts.filter(
        (contract) =>
          contract.status === 'active' &&
          contract.clubId === campaign.managedClubId,
      )
      if (managedActive.length > 1)
        throw new PersistenceError(
          'SCOPE',
          'More than one active contract exists for this player.',
        )
      const lineups = await listLineups(database, campaign.id, season.id)
      await updateStoredPlayer(
        database,
        campaign.id,
        playerSchema.parse({ ...player, clubId: bidder.id }),
      )
      await insertTransfer(
        database,
        campaign.id,
        transferSchema.parse({
          id: data.transferId,
          campaignId: campaign.id,
          seasonId: season.id,
          playerId: player.id,
          fromClubId: campaign.managedClubId,
          toClubId: bidder.id,
          feeCents: offer.feeCents,
          kind: 'sale',
          effectiveOn: data.effectiveOn,
          sourceActionId: data.actionId,
        }),
      )
      await insertLedgerEntry(
        database,
        campaign.id,
        ledgerEntrySchema.parse({
          id: data.ledgerEntryId,
          campaignId: campaign.id,
          seasonId: season.id,
          clubId: campaign.managedClubId,
          kind: 'player_sale',
          amountCents: offer.feeCents,
          effectiveOn: data.effectiveOn,
          sourceActionId: data.actionId,
          reversesEntryId: null,
          note: player.name,
        }),
      )
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
      const accepted = offerSchema.parse({
        ...offer,
        status: 'accepted',
        resolvedOn: data.resolvedOn,
      })
      await updateOffer(database, campaign.id, accepted)
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
          actionType: 'offer.accept',
          createdAt: data.now,
          summary: `Accepted offer for ${player.name}`,
          payload: data,
        }),
      )
      return accepted
    },
  )
}

function withoutPlayer(
  lineup: Lineup,
  playerId: EntityId,
  now: AcceptOfferInput['now'],
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
