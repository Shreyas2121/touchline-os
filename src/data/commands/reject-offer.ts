import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import { evaluateAction } from '../../domain/rules/evaluate-action'
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
import { listConstitutions } from '../repositories/constitutions'
import { getOffer, updateOffer } from '../repositories/offers'
import { getPlayer } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { rejectStandaloneWrite } from './guards'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const rejectOfferInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  offerId: entityIdSchema,
  resolvedOn: dateOnlySchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
  acknowledgedWarnings: z.boolean(),
})

export function rejectOffer(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Offer>> {
  const parsed = rejectOfferInputSchema.safeParse(input)
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
      database.constitutions,
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
      rejectStandaloneWrite(campaign, 'negotiation')
      const offer = await getOffer(database, campaign.id, data.offerId)
      if (!offer) rejectCommand('NOT_FOUND', 'Offer not found.')
      if (offer.status !== 'open')
        throw new PersistenceError('SCOPE', 'That offer is already resolved.')
      const season = await getActiveSeason(database, campaign.id)
      if (!season || season.id !== offer.seasonId)
        throw new PersistenceError('SCOPE', 'Season is not the active season.')
      const player = await getPlayer(database, campaign.id, offer.playerId)
      if (!player) rejectCommand('NOT_FOUND', 'Player not found.')
      const bidder = await getClub(database, campaign.id, offer.bidderClubId)
      const managed = await getClub(
        database,
        campaign.id,
        campaign.managedClubId,
      )
      const constitution = (await listConstitutions(database, campaign.id)).at(
        -1,
      )
      if (constitution) {
        const report = evaluateAction(
          {
            type: 'reject-offer',
            feeCents: offer.feeCents,
            marketValueCents: player.marketValueCents,
            bidderPrestige: bidder?.prestige ?? null,
            sellerPrestige: managed?.prestige ?? null,
          },
          { revision: campaign.revision, remainingCapacityCents: null },
          constitution,
          data.resolvedOn,
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
      const rejected = offerSchema.parse({
        ...offer,
        status: 'rejected',
        resolvedOn: data.resolvedOn,
      })
      await updateOffer(database, campaign.id, rejected)
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
          actionType: 'offer.reject',
          createdAt: data.now,
          summary: `Rejected offer for ${player.name}`,
          payload: data,
        }),
      )
      return rejected
    },
  )
}
