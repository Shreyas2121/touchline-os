import { z } from 'zod'
import type { ParseResult } from '../validation/result'
import { entityIdSchema } from '../validation/schemas'

export type Severity = 'BLOCK' | 'WARN' | 'INFO'

export type RuleVerdict = {
  ruleId:
    | 'SELL_TO_BUY'
    | 'MAX_SIGNING_AGE'
    | 'WAGE_TIER_CAP'
    | 'PRESTIGE_BID_SALE'
    | 'REGISTRATION_QUOTA'
  severity: Severity
  code: string
  message: string
  evidence: Record<string, number | string | null>
  remedy: string
}

export type RuleReport = {
  allowed: boolean
  verdicts: RuleVerdict[]
  snapshotRevision: number
}

export type PolicySnapshot = {
  revision: number
  remainingCapacityCents: number | null
}

export type SquadTierChoice = 'key' | 'rotation' | 'youth'

export type PolicyAction =
  | {
      type: 'incoming-transfer'
      feeCents: number
      age: number | null
      isFree: boolean
      weeklyWageCents: number | null
      squadTier: SquadTierChoice | null
    }
  | {
      type: 'wage-change'
      weeklyWageCents: number | null
      squadTier: SquadTierChoice | null
    }
  | {
      type: 'reject-offer'
      feeCents: number
      marketValueCents: number | null
      bidderPrestige: number | null
      sellerPrestige: number | null
    }
  | {
      type: 'season-rollover'
      unresolvedQualifyingOffers: number
    }
  | {
      type: 'registration'
      competitionKey: string
      players: {
        playerId: string
        status: 'registered' | 'ineligible' | 'unknown'
        homegrownClub: boolean | null
        homegrownNation: boolean | null
        ageExempt: boolean | null
        age: number | null
      }[]
    }

const nonnegativeInteger = z.number().int().nonnegative()
const nullableWage = nonnegativeInteger.nullable()
const nullableTier = z.enum(['key', 'rotation', 'youth']).nullable()
const nullablePrestige = z.number().int().min(0).max(100).nullable()

const policyActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('incoming-transfer'),
    feeCents: nonnegativeInteger,
    age: z.number().int().min(0).max(99).nullable(),
    isFree: z.boolean(),
    weeklyWageCents: nullableWage,
    squadTier: nullableTier,
  }),
  z.strictObject({
    type: z.literal('wage-change'),
    weeklyWageCents: nullableWage,
    squadTier: nullableTier,
  }),
  z.strictObject({
    type: z.literal('reject-offer'),
    feeCents: nonnegativeInteger,
    marketValueCents: nonnegativeInteger.nullable(),
    bidderPrestige: nullablePrestige,
    sellerPrestige: nullablePrestige,
  }),
  z.strictObject({
    type: z.literal('season-rollover'),
    unresolvedQualifyingOffers: nonnegativeInteger,
  }),
  z.strictObject({
    type: z.literal('registration'),
    competitionKey: z.string().min(1).max(40),
    players: z.array(
      z.strictObject({
        playerId: entityIdSchema,
        status: z.enum(['registered', 'ineligible', 'unknown']),
        homegrownClub: z.boolean().nullable(),
        homegrownNation: z.boolean().nullable(),
        ageExempt: z.boolean().nullable(),
        age: z.number().int().min(0).max(99).nullable(),
      }),
    ),
  }),
])

export function parsePolicyAction(value: unknown): ParseResult<PolicyAction> {
  const parsed = policyActionSchema.safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: 'Action is not valid.' }
}
