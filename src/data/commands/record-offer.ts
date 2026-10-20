import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import { moneyCentsSchema } from '../../domain/models/money'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  offerSchema,
  type Offer,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { getClub } from '../repositories/clubs'
import { insertOffer, listOffers } from '../repositories/offers'
import { getPlayer } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const recordOfferInputSchema = z
  .strictObject({
    campaignId: entityIdSchema,
    offerId: entityIdSchema,
    seasonId: entityIdSchema,
    playerId: entityIdSchema,
    bidderClubId: entityIdSchema,
    feeCents: moneyCentsSchema,
    receivedOn: dateOnlySchema,
    expectedRevision: z.number().int().nonnegative(),
    now: timestampUtcSchema,
    auditEventId: entityIdSchema,
    actionId: entityIdSchema,
  })
  .superRefine((input, context) => {
    if (input.feeCents <= 0)
      context.addIssue({ code: 'custom', message: 'fee' })
  })

export function recordOffer(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Offer>> {
  const parsed = recordOfferInputSchema.safeParse(input)
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
      if (player.clubId !== campaign.managedClubId)
        throw new PersistenceError(
          'SCOPE',
          'That player is not at the managed club.',
        )
      const bidder = await getClub(database, campaign.id, data.bidderClubId)
      if (!bidder || bidder.id === campaign.managedClubId)
        throw new PersistenceError(
          'SCOPE',
          'That club is not another club in this campaign.',
        )
      const existing = await listOffers(database, campaign.id, season.id)
      if (
        existing.some(
          (offer) =>
            offer.status === 'open' &&
            offer.playerId === player.id &&
            offer.bidderClubId === bidder.id,
        )
      )
        throw new PersistenceError(
          'SCOPE',
          'That club already has an open offer for this player.',
        )
      const offer = offerSchema.parse({
        id: data.offerId,
        campaignId: campaign.id,
        seasonId: season.id,
        playerId: player.id,
        bidderClubId: bidder.id,
        feeCents: data.feeCents,
        status: 'open',
        receivedOn: data.receivedOn,
        resolvedOn: null,
      })
      await insertOffer(database, campaign.id, offer)
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
          actionType: 'offer.record',
          createdAt: data.now,
          summary: `Recorded offer for ${player.name}`,
          payload: data,
        }),
      )
      return offer
    },
  )
}
