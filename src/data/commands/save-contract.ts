import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { dateOnlySchema, timestampUtcSchema } from '../../domain/models/dates'
import { evaluateAction } from '../../domain/rules/evaluate-action'
import {
  auditEventSchema,
  campaignSchema,
  contractSchema,
  entityIdSchema,
  type Contract,
} from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign, updateCampaign } from '../repositories/campaigns'
import { listConstitutions } from '../repositories/constitutions'
import {
  insertContract,
  listContractsByPlayer,
  updateContract,
} from '../repositories/contracts'
import { getPlayer } from '../repositories/players'
import { getActiveSeason } from '../repositories/seasons'
import { rejectCommand, runCommand } from '../transactions/run-command'

export const saveContractInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  contractId: entityIdSchema,
  playerId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  weeklyWageCents: contractSchema.shape.weeklyWageCents,
  squadTier: contractSchema.shape.squadTier,
  startsOn: contractSchema.shape.startsOn,
  expiresOn: contractSchema.shape.expiresOn,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export function saveContract(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<Contract>> {
  const parsed = saveContractInputSchema.safeParse(input)
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
      database.contracts,
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
      const player = await getPlayer(database, campaign.id, data.playerId)
      if (!player) rejectCommand('NOT_FOUND', 'Player not found.')
      if (player.clubId !== campaign.managedClubId)
        throw new PersistenceError(
          'SCOPE',
          'That player is not at the managed club.',
        )
      const season = await getActiveSeason(database, campaign.id)
      if (!season)
        throw new PersistenceError(
          'SCOPE',
          'This campaign has no active season.',
        )
      const constitution = (await listConstitutions(database, campaign.id)).at(
        -1,
      )
      if (constitution) {
        const report = evaluateAction(
          {
            type: 'wage-change',
            weeklyWageCents: data.weeklyWageCents,
            squadTier: data.squadTier,
          },
          { revision: campaign.revision, remainingCapacityCents: null },
          constitution,
          data.startsOn ??
            data.expiresOn ??
            dateOnlySchema.parse(data.now.slice(0, 10)),
        )
        const block = report.verdicts.find(
          (verdict) => verdict.severity === 'BLOCK',
        )
        if (block) throw new PersistenceError('SCOPE', block.message)
      }
      const active = (
        await listContractsByPlayer(database, campaign.id, player.id)
      ).filter(
        (contract) =>
          contract.status === 'active' &&
          contract.clubId === campaign.managedClubId,
      )
      if (active.length > 1)
        throw new PersistenceError(
          'SCOPE',
          'More than one active contract exists for this player.',
        )
      if (active[0]) {
        await updateContract(
          database,
          campaign.id,
          contractSchema.parse({ ...active[0], status: 'ended' }),
        )
      }
      const contract = contractSchema.parse({
        id: data.contractId,
        campaignId: campaign.id,
        playerId: player.id,
        clubId: campaign.managedClubId,
        weeklyWageCents: data.weeklyWageCents,
        squadTier: data.squadTier,
        startsOn: data.startsOn,
        expiresOn: data.expiresOn,
        status: 'active',
      })
      await insertContract(database, campaign.id, contract)
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
          actionType: 'contract.save',
          createdAt: data.now,
          summary: `Saved contract for ${player.name}`,
          payload: data,
        }),
      )
      return contract
    },
  )
}
