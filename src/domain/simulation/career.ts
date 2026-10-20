import { z } from 'zod'
import { timestampUtcSchema } from '../models/dates'
import { constitutionPreset } from '../rules/presets'
import {
  PLAYABLE_GENERATOR_VERSION,
  generatePlayableWorld,
} from '../seed/generate-playable-world'
import type { ParseResult } from '../validation/result'
import type { PlayableWorld } from '../seed/playable-world-validation'
import {
  auditEventSchema,
  campaignSchema,
  constitutionSchema,
  entityIdSchema,
  ledgerEntrySchema,
  seasonSchema,
  type AuditEvent,
  type Campaign,
  type Constitution,
  type LedgerEntry,
  type Season,
} from '../validation/schemas'
import { seasonDates } from './calendar'
import { deriveEventSeed } from './random'
import {
  simulationKeySchema,
  simulationReceiptSchema,
  simulationStateSchema,
  type SimulationReceipt,
  type SimulationState,
} from './schemas'

export const CAREER_OPERATION_KEY = 'career:initialize'
export const DEFAULT_START_YEAR = 2026
export const STANDALONE_DEMO_ID = entityIdSchema.parse('standalone-demo')
export const resetPlayablePhrase = 'Reset playable demo'

export const legacyDemoProtected =
  'The legacy demo cannot be replaced by a standalone career.'
export const careerIdTaken = 'A career with this id already exists.'
export const clubNotInWorld = 'Choose a club from this world.'
export const onlyPlayableDemoReset = 'Only the playable demo can be reset.'
export const negotiationUnavailable = 'Negotiation arrives in a later phase.'
export const playerEditUnavailable =
  'Standalone careers cannot change players directly.'
export const contractEditUnavailable = 'Negotiated contracts arrive later.'
export const manualLedgerUnavailable =
  'Standalone careers cannot post manual money effects.'
export const managedClubFixed =
  'The managed club is fixed after a standalone career is created.'
export const challengeRulesLocked = 'Challenge rules are locked.'

export const standaloneDemoCareer = {
  campaignId: STANDALONE_DEMO_ID,
  name: 'Playable demo',
  seed: 'standalone-demo-v2',
  startYear: DEFAULT_START_YEAR,
  clubKey: 'club:01',
  rulesMode: 'challenge' as const,
  preset: 'balanced' as const,
  seasonId: 'standalone-demo-season',
  clockId: 'standalone-demo-clock',
  constitutionId: 'standalone-demo-rules',
  allocationId: 'standalone-demo-allocation',
  receiptId: 'standalone-demo-receipt',
  auditEventId: 'standalone-demo-audit',
  actionId: 'standalone-demo-action',
}

export const standaloneCareerInputSchema = z.strictObject({
  campaignId: entityIdSchema,
  name: campaignSchema.shape.name,
  seed: simulationStateSchema.shape.rootSeed,
  startYear: z.number().int(),
  clubKey: simulationKeySchema,
  rulesMode: z.enum(['challenge', 'sandbox']),
  preset: z.enum(['balanced', 'strict']),
  now: timestampUtcSchema,
  seasonId: entityIdSchema,
  clockId: entityIdSchema,
  constitutionId: entityIdSchema,
  allocationId: entityIdSchema,
  receiptId: entityIdSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export type StandaloneCareerInput = z.infer<typeof standaloneCareerInputSchema>

export type PreparedCareer = {
  fingerprint: string
  campaign: Campaign
  season: Season
  world: PlayableWorld
  clock: SimulationState
  constitution: Constitution
  allocation: LedgerEntry
  receipt: SimulationReceipt
  audit: AuditEvent
}

/**
 * Identity of a career attempt. Action ids, audit ids and timestamps are
 * deliberately absent so a retry cannot rebuild the world.
 */
export function careerFingerprint(
  input: Pick<
    StandaloneCareerInput,
    'name' | 'seed' | 'startYear' | 'clubKey' | 'rulesMode' | 'preset'
  >,
): string {
  return JSON.stringify([
    'standalone-career',
    PLAYABLE_GENERATOR_VERSION,
    input.name,
    input.seed,
    input.startYear,
    input.clubKey,
    input.rulesMode,
    input.preset,
  ])
}

export function awaitsClubChoice(
  campaign: { mode: 'legacy' | 'standalone'; seed: string | null },
  audits: readonly { actionType: string }[],
): boolean {
  return (
    campaign.mode === 'legacy' &&
    campaign.seed !== null &&
    !audits.some((audit) => audit.actionType === 'campaign.select-club')
  )
}

export function prepareStandaloneCareer(
  input: StandaloneCareerInput,
): ParseResult<PreparedCareer> {
  const fingerprint = careerFingerprint(input)
  if (
    !simulationReceiptSchema.shape.inputFingerprint.safeParse(fingerprint)
      .success
  )
    return { ok: false, message: 'Career settings do not fit a receipt.' }
  const generated = generatePlayableWorld({
    seed: input.seed,
    generatorVersion: PLAYABLE_GENERATOR_VERSION,
    campaignId: input.campaignId,
    startYear: input.startYear,
  })
  if (!generated.ok) return generated
  const clubState = generated.value.clubSimulationStates.find(
    (state) => state.simulationKey === input.clubKey,
  )
  const club = generated.value.clubs.find(
    (item) => item.id === clubState?.clubId,
  )
  if (!clubState || !club) return { ok: false, message: clubNotInWorld }
  const dates = seasonDates(input.startYear)
  const rules = constitutionPreset(input.preset)
  const allocationRule = rules.find((rule) => rule.id === 'SELL_TO_BUY')
  if (allocationRule?.id !== 'SELL_TO_BUY' || !allocationRule.enabled)
    return { ok: false, message: 'Opening allocation is not available.' }
  const season = seasonSchema.parse({
    id: input.seasonId,
    campaignId: input.campaignId,
    label: `${input.startYear}/${String(input.startYear + 1).slice(-2)}`,
    ordinal: 1,
    status: 'active',
    startDate: dates.startDate,
    endDate: dates.endDate,
    openedAt: input.now,
    closedAt: null,
  })
  const campaign = campaignSchema.parse({
    id: input.campaignId,
    name: input.name,
    kind: 'fictional',
    mode: 'standalone',
    rulesMode: input.rulesMode,
    seed: input.seed,
    generatorVersion: PLAYABLE_GENERATOR_VERSION,
    managedClubId: club.id,
    activeSeasonId: season.id,
    currency: 'EUR',
    createdAt: input.now,
    updatedAt: input.now,
    revision: 0,
    status: 'active',
  })
  const clock = simulationStateSchema.parse({
    id: input.clockId,
    campaignId: input.campaignId,
    activeSeasonId: season.id,
    rootSeed: input.seed,
    simulationVersion: '1',
    calendarVersion: '1',
    currentDate: dates.startDate,
    phase: 'preseason',
    lastBoundaryKey: null,
  })
  const constitution = constitutionSchema.parse({
    id: input.constitutionId,
    campaignId: input.campaignId,
    version: 1,
    rules,
    updatedAt: input.now,
  })
  const allocation = ledgerEntrySchema.parse({
    id: input.allocationId,
    campaignId: input.campaignId,
    seasonId: season.id,
    clubId: club.id,
    kind: 'initial_allocation',
    amountCents: allocationRule.initialAllocationCents,
    effectiveOn: dates.startDate,
    sourceActionId: input.actionId,
    reversesEntryId: null,
    note: null,
  })
  const receipt = simulationReceiptSchema.parse({
    id: input.receiptId,
    campaignId: input.campaignId,
    operationKey: CAREER_OPERATION_KEY,
    inputRevision: 0,
    inputFingerprint: fingerprint,
    eventSeed: deriveEventSeed(input.seed, '1', 'world', [
      CAREER_OPERATION_KEY,
      input.clubKey,
      String(input.startYear),
      input.rulesMode,
      input.preset,
    ]),
    simulationVersion: '1',
    outcomeRefs: [
      { kind: 'campaign', id: input.campaignId },
      { kind: 'season', id: season.id },
      { kind: 'club', id: club.id },
    ],
    createdAt: input.now,
  })
  const audit = auditEventSchema.parse({
    id: input.auditEventId,
    campaignId: input.campaignId,
    seasonId: season.id,
    actionId: input.actionId,
    actionType: 'simulation.initialize',
    createdAt: input.now,
    summary: `Started ${input.name} at ${club.name} on ${dates.startDate}.`,
    payload: {
      mode: 'standalone',
      rulesMode: input.rulesMode,
      preset: input.preset,
      seed: input.seed,
      startYear: input.startYear,
      clubKey: input.clubKey,
      generatorVersion: PLAYABLE_GENERATOR_VERSION,
      leagues: generated.value.leagues.length,
      clubs: generated.value.clubs.length,
      players: generated.value.players.length,
      contracts: generated.value.contracts.length,
    },
  })
  return {
    ok: true,
    value: {
      fingerprint,
      campaign,
      season,
      world: generated.value,
      clock,
      constitution,
      allocation,
      receipt,
      audit,
    },
  }
}
