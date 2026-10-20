import { z } from 'zod'
import { dateOnlySchema, timestampUtcSchema } from '../models/dates'
import { moneyCentsSchema } from '../models/money'
import {
  positionGroupFor,
  positionGroups,
  positions,
} from '../models/positions'
import { limits } from './limits'

const positionGroupSchema = z.enum(positionGroups)
const positionSchema = z.enum(positions)

export const entityIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]+$/)
  .min(1)
  .max(limits.idMax)
  .brand('EntityId')

export type EntityId = z.infer<typeof entityIdSchema>

const recordSources = [
  'fictional',
  'imported',
  'user-entered',
  'estimated',
  'generated',
] as const

export const recordSourceSchema = z.enum(recordSources)

export type RecordSource = z.infer<typeof recordSourceSchema>

const percentSchema = z.number().int().min(0).max(100)
const attributeSchema = z.number().int().min(0).max(limits.attributeMax)

function nameText(max: number) {
  return z.string().trim().min(1).max(max)
}

function boundedText(max: number) {
  return z.string().min(1).max(max)
}

const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .nullable()

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/)

const nullableId = entityIdSchema.nullable()
const nullableDate = dateOnlySchema.nullable()
const nullableTimestamp = timestampUtcSchema.nullable()
const nullableMoney = moneyCentsSchema.nullable()

const attributesSchema = z.strictObject({
  pace: attributeSchema.optional(),
  finishing: attributeSchema.optional(),
  passing: attributeSchema.optional(),
  dribbling: attributeSchema.optional(),
  defending: attributeSchema.optional(),
  physical: attributeSchema.optional(),
})

const sellToBuyRuleSchema = z.strictObject({
  id: z.literal('SELL_TO_BUY'),
  enabled: z.boolean(),
  salesReinvestmentPct: percentSchema,
  prizeReinvestmentPct: percentSchema,
  carryoverPct: percentSchema,
  initialAllocationCents: moneyCentsSchema,
})

const maxSigningAgeRuleSchema = z.strictObject({
  id: z.literal('MAX_SIGNING_AGE'),
  enabled: z.boolean(),
  maxAge: z.number().int().min(limits.signingAgeMin).max(limits.signingAgeMax),
  freeTransfersExempt: z.boolean(),
})

const wageTierCapRuleSchema = z.strictObject({
  id: z.literal('WAGE_TIER_CAP'),
  enabled: z.boolean(),
  keyWeeklyCapCents: moneyCentsSchema,
  rotationWeeklyCapCents: moneyCentsSchema,
  youthWeeklyCapCents: moneyCentsSchema,
})

const prestigeBidSaleRuleSchema = z.strictObject({
  id: z.literal('PRESTIGE_BID_SALE'),
  enabled: z.boolean(),
  requiredFeeNumerator: z.number().int().min(1),
  requiredFeeDenominator: z.number().int().min(1),
  requireHigherPrestige: z.boolean(),
})

const registrationQuotaRuleSchema = z.strictObject({
  id: z.literal('REGISTRATION_QUOTA'),
  enabled: z.boolean(),
  rosterLimit: z.number().int().min(1),
  minimumHomegrown: z.number().int().min(0),
  ageExemptionUnder: z.number().int().min(1).nullable(),
  competitionKey: boundedText(limits.competitionKeyMax),
})

export const constitutionRuleSchema = z.discriminatedUnion('id', [
  sellToBuyRuleSchema,
  maxSigningAgeRuleSchema,
  wageTierCapRuleSchema,
  prestigeBidSaleRuleSchema,
  registrationQuotaRuleSchema,
])

export type ConstitutionRule = z.infer<typeof constitutionRuleSchema>

const payloadDepthMax = 6

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function isJsonData(value: unknown, depth: number): boolean {
  if (value === null) return true
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true
    case 'number':
      return Number.isFinite(value)
    case 'object':
      break
    default:
      return false
  }
  if (depth > payloadDepthMax) return false
  if (Array.isArray(value)) {
    return value.every((item) => isJsonData(item, depth + 1))
  }
  if (!isPlainObject(value)) return false
  return Object.values(value).every((item) => isJsonData(item, depth + 1))
}

function isAuditPayload(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value) || !isJsonData(value, 1)) return false
  try {
    return JSON.stringify(value).length <= limits.payloadJsonMax
  } catch {
    return false
  }
}

const auditPayloadSchema = z.custom<Record<string, unknown>>((value) =>
  isAuditPayload(value),
)

const lineupStarterSchema = z.strictObject({
  playerId: entityIdSchema,
  slot: z.string().trim().min(1).max(limits.slotMax),
  role: z.string().trim().min(1).max(limits.roleMax).nullable(),
})

export const campaignSchema = z.strictObject({
  id: entityIdSchema,
  name: nameText(limits.nameMax),
  kind: z.enum(['fictional', 'imported']),
  seed: boundedText(limits.seedMax).nullable(),
  generatorVersion: boundedText(limits.generatorVersionMax).nullable(),
  managedClubId: entityIdSchema,
  activeSeasonId: entityIdSchema,
  currency: z.literal('EUR'),
  createdAt: timestampUtcSchema,
  updatedAt: timestampUtcSchema,
  revision: z.number().int().nonnegative(),
  status: z.enum(['active', 'archived']),
})

export type Campaign = z.infer<typeof campaignSchema>

export const seasonSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  label: boundedText(limits.seasonLabelMax),
  ordinal: z.number().int().min(1),
  status: z.enum(['active', 'closed']),
  startDate: nullableDate,
  endDate: nullableDate,
  openedAt: timestampUtcSchema,
  closedAt: nullableTimestamp,
})

export type Season = z.infer<typeof seasonSchema>

export const leagueSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  name: nameText(limits.nameMax),
  countryCode: countryCodeSchema,
  tier: z.number().int().min(1).nullable(),
})

export type League = z.infer<typeof leagueSchema>

export const clubSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  leagueId: nullableId,
  name: nameText(limits.nameMax),
  shortName: nameText(limits.shortNameMax),
  colors: z.strictObject({
    primary: hexColorSchema,
    secondary: hexColorSchema,
  }),
  prestige: z.number().int().min(0).max(limits.prestigeMax),
  academyTier: z
    .number()
    .int()
    .min(limits.academyTierMin)
    .max(limits.academyTierMax),
  scoutingRegion: boundedText(limits.regionMax).nullable(),
})

export type Club = z.infer<typeof clubSchema>

export const playerSchema = z
  .strictObject({
    id: entityIdSchema,
    campaignId: entityIdSchema,
    clubId: nullableId,
    name: nameText(limits.nameMax),
    positionGroup: positionGroupSchema,
    positions: z
      .array(positionSchema)
      .min(limits.positionsMin)
      .max(limits.positionsMax)
      .refine((items) => new Set(items).size === items.length),
    nationalityCode: countryCodeSchema,
    birthDate: nullableDate,
    reportedAge: z.number().int().min(0).max(limits.ageMax).nullable(),
    ageReferenceSeasonOrdinal: z.number().int().min(1).nullable(),
    marketValueCents: nullableMoney,
    attributes: attributesSchema,
    potential: attributeSchema.nullable(),
    source: recordSourceSchema,
    externalSourceId: boundedText(limits.sourceIdMax).nullable(),
    isNewgen: z.boolean(),
  })
  .refine(
    (player) =>
      (player.reportedAge === null) ===
      (player.ageReferenceSeasonOrdinal === null),
  )
  .refine((player) =>
    player.positions.every(
      (position) => positionGroupFor(position) === player.positionGroup,
    ),
  )

export type Player = z.infer<typeof playerSchema>

export const contractSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  playerId: entityIdSchema,
  clubId: entityIdSchema,
  weeklyWageCents: nullableMoney,
  squadTier: z.enum(['key', 'rotation', 'youth']).nullable(),
  startsOn: nullableDate,
  expiresOn: nullableDate,
  status: z.enum(['active', 'ended']),
})

export type Contract = z.infer<typeof contractSchema>

export const constitutionSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  version: z.number().int().min(1),
  rules: z
    .array(constitutionRuleSchema)
    .length(5)
    .refine(
      (rules) => new Set(rules.map((rule) => rule.id)).size === rules.length,
    ),
  updatedAt: timestampUtcSchema,
})

export type Constitution = z.infer<typeof constitutionSchema>

const ledgerKinds = [
  'initial_allocation',
  'player_sale',
  'prize_income',
  'approved_carryover',
  'incoming_fee',
  'reversal',
] as const

export const ledgerEntrySchema = z
  .strictObject({
    id: entityIdSchema,
    campaignId: entityIdSchema,
    seasonId: entityIdSchema,
    clubId: entityIdSchema,
    kind: z.enum(ledgerKinds),
    amountCents: moneyCentsSchema,
    effectiveOn: dateOnlySchema,
    sourceActionId: entityIdSchema,
    reversesEntryId: nullableId,
    note: boundedText(limits.noteMax).nullable(),
  })
  .refine((entry) =>
    entry.kind === 'reversal'
      ? entry.reversesEntryId !== null
      : entry.reversesEntryId === null,
  )

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>

export const transferSchema = z
  .strictObject({
    id: entityIdSchema,
    campaignId: entityIdSchema,
    seasonId: entityIdSchema,
    playerId: entityIdSchema,
    fromClubId: nullableId,
    toClubId: nullableId,
    feeCents: moneyCentsSchema,
    kind: z.enum(['sale', 'purchase', 'free']),
    effectiveOn: dateOnlySchema,
    sourceActionId: entityIdSchema,
  })
  .refine(
    (transfer) => transfer.fromClubId !== null || transfer.toClubId !== null,
  )
  .refine((transfer) => transfer.kind !== 'free' || transfer.feeCents === 0)

export type Transfer = z.infer<typeof transferSchema>

export const offerSchema = z
  .strictObject({
    id: entityIdSchema,
    campaignId: entityIdSchema,
    seasonId: entityIdSchema,
    playerId: entityIdSchema,
    bidderClubId: entityIdSchema,
    feeCents: moneyCentsSchema,
    status: z.enum(['open', 'accepted', 'rejected']),
    receivedOn: dateOnlySchema,
    resolvedOn: nullableDate,
  })
  .refine((offer) => offer.status !== 'open' || offer.resolvedOn === null)

export type Offer = z.infer<typeof offerSchema>

export const lineupSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  seasonId: entityIdSchema,
  name: nameText(limits.nameMax),
  formation: z.enum(['4-3-3', '4-2-3-1', '4-4-2', '3-5-2']),
  starters: z.array(lineupStarterSchema).max(limits.startersMax),
  benchPlayerIds: z.array(entityIdSchema).max(limits.benchMax),
  updatedAt: timestampUtcSchema,
})

export type Lineup = z.infer<typeof lineupSchema>

export const registrationSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  seasonId: entityIdSchema,
  playerId: entityIdSchema,
  competitionKey: boundedText(limits.competitionKeyMax),
  status: z.enum(['registered', 'ineligible', 'unknown']),
  homegrownClub: z.boolean().nullable(),
  homegrownNation: z.boolean().nullable(),
  ageExempt: z.boolean().nullable(),
  provenance: recordSourceSchema,
})

export type Registration = z.infer<typeof registrationSchema>

export const matchRecordSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  seasonId: entityIdSchema,
  date: dateOnlySchema,
  opponent: nameText(limits.nameMax),
  homeAway: z.enum(['home', 'away']),
  goalsFor: z.number().int().min(0).max(limits.goalsMax),
  goalsAgainst: z.number().int().min(0).max(limits.goalsMax),
  competition: boundedText(limits.competitionKeyMax).nullable(),
  notes: boundedText(limits.noteMax).nullable(),
  xgFor: z.number().int().min(0).max(limits.xgMilliMax).nullable(),
  xgAgainst: z.number().int().min(0).max(limits.xgMilliMax).nullable(),
})

export type MatchRecord = z.infer<typeof matchRecordSchema>

export const appearanceSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  seasonId: entityIdSchema,
  matchId: entityIdSchema,
  playerId: entityIdSchema,
  minutes: z.number().int().min(0).max(limits.minutesMax),
  started: z.boolean().nullable(),
  goals: z.number().int().min(0).max(limits.goalsMax).nullable(),
  assists: z.number().int().min(0).max(limits.goalsMax).nullable(),
  rating: z.number().int().min(0).max(limits.ratingMax).nullable(),
})

export type Appearance = z.infer<typeof appearanceSchema>

export const shortlistItemSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  playerId: entityIdSchema,
  priority: z.number().int().min(limits.priorityMin).max(limits.priorityMax),
  status: z.enum(['open', 'closed']),
  notes: boundedText(limits.noteMax).nullable(),
  addedAt: timestampUtcSchema,
})

export type ShortlistItem = z.infer<typeof shortlistItemSchema>

export const scoutingReportSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  playerId: entityIdSchema,
  seasonId: entityIdSchema,
  archetype: boundedText(limits.archetypeMax),
  observations: z.string().max(limits.noteMax),
  confidence: z.enum(['low', 'medium', 'high']),
  source: recordSourceSchema,
  createdAt: timestampUtcSchema,
})

export type ScoutingReport = z.infer<typeof scoutingReportSchema>

export const developmentPlanSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  playerId: entityIdSchema,
  seasonId: entityIdSchema,
  targetRole: boundedText(limits.roleMax).nullable(),
  notes: z.string().max(limits.noteMax),
  status: z.enum(['open', 'closed']),
})

export type DevelopmentPlan = z.infer<typeof developmentPlanSchema>

export const auditEventSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: entityIdSchema,
  seasonId: nullableId,
  actionId: entityIdSchema,
  actionType: z.enum([
    'campaign.create',
    'campaign.rename',
    'player.add',
    'player.update',
    'player.note',
    'lineup.save',
    'lineup.delete',
    'ledger.post',
    'ledger.reverse',
    'constitution.save',
    'campaign.seed',
    'campaign.archive',
    'campaign.restore',
    'campaign.delete',
    'campaign.select-club',
    'shortlist.save',
    'shortlist.close',
    'transfer.record',
    'offer.record',
    'offer.accept',
    'offer.reject',
    'contract.save',
  ]),
  createdAt: timestampUtcSchema,
  summary: boundedText(limits.noteMax),
  payload: auditPayloadSchema,
})

export type AuditEvent = z.infer<typeof auditEventSchema>

export const importReceiptSchema = z.strictObject({
  id: entityIdSchema,
  campaignId: nullableId,
  sourceName: nameText(limits.nameMax),
  sourceType: z.enum(['csv', 'json', 'backup']),
  importedAt: timestampUtcSchema,
  rowCounts: z
    .record(
      boundedText(limits.competitionKeyMax),
      z.number().int().nonnegative(),
    )
    .refine((counts) => Object.keys(counts).length <= limits.rowCountKeysMax),
  mappingVersion: boundedText(limits.mappingVersionMax),
  warnings: z.array(boundedText(limits.noteMax)).max(limits.warningCountMax),
  provenance: recordSourceSchema,
})

export type ImportReceipt = z.infer<typeof importReceiptSchema>
