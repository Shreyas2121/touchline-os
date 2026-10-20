import { z } from 'zod'
import { dateOnlySchema, timestampUtcSchema } from '../models/dates'
import { moneyCentsSchema } from '../models/money'
import { limits } from '../validation/limits'
import { entityIdSchema } from '../validation/schemas'

// Logical keys survive entity-ID remapping. Keep receipts compact and versioned.
export const simulationKeySchema = z.string().trim().min(1).max(200)
export const simulationVersionSchema = z.literal('1')
const nonnegativeInteger = z.number().int().nonnegative()
const percent = z.number().int().min(0).max(100)

export const simulationStateSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  activeSeasonId: entityIdSchema,
  rootSeed: z.string().trim().min(1).max(limits.seedMax),
  simulationVersion: simulationVersionSchema,
  calendarVersion: z.literal('1'),
  currentDate: dateOnlySchema,
  phase: z.enum(['preseason', 'league', 'review']),
  lastBoundaryKey: simulationKeySchema.nullable(),
})

export type SimulationState = z.infer<typeof simulationStateSchema>

export const clubSimulationStateSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  clubId: entityIdSchema,
  simulationKey: simulationKeySchema,
  transferBalanceCents: moneyCentsSchema,
  wageBudgetWeeklyCents: moneyCentsSchema,
})

export type ClubSimulationState = z.infer<typeof clubSimulationStateSchema>

export const playerSimulationStateSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  playerId: entityIdSchema,
  simulationKey: simulationKeySchema,
  fitness: percent,
  sharpness: percent,
  goalkeeping: percent.nullable(),
  injuryUntilDate: dateOnlySchema.nullable(),
  suspensionMatches: nonnegativeInteger,
  status: z.enum(['active', 'retired']),
  homegrownClub: z.boolean(),
  homegrownNation: z.boolean(),
})

export type PlayerSimulationState = z.infer<typeof playerSimulationStateSchema>

export const simulationOutcomeRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('campaign'), id: entityIdSchema }),
  z.strictObject({ kind: z.literal('season'), id: entityIdSchema }),
  z.strictObject({ kind: z.literal('club'), id: entityIdSchema }),
  z.strictObject({ kind: z.literal('player'), id: entityIdSchema }),
  z.strictObject({ kind: z.literal('boundary'), key: simulationKeySchema }),
])

export type SimulationOutcomeRef = z.infer<typeof simulationOutcomeRefSchema>

export const simulationReceiptSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  operationKey: simulationKeySchema,
  inputRevision: nonnegativeInteger,
  inputFingerprint: z.string().trim().min(1).max(512),
  eventSeed: z.number().int().min(0).max(0xffff_ffff),
  simulationVersion: simulationVersionSchema,
  outcomeRefs: z.array(simulationOutcomeRefSchema).min(1).max(32),
  createdAt: timestampUtcSchema,
})

export type SimulationReceipt = z.infer<typeof simulationReceiptSchema>
