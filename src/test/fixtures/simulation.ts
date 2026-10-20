import {
  clubSimulationStateSchema,
  playerSimulationStateSchema,
  simulationReceiptSchema,
  simulationStateSchema,
} from '../../domain/simulation/schemas'
import { playerSchema } from '../../domain/validation/schemas'
import { campaignA, clubA, seasonA } from './campaign'

export const simulationPlayer = playerSchema.parse({
  id: 'player-a',
  campaignId: campaignA.id,
  clubId: clubA.id,
  name: 'Amina Cole',
  positionGroup: 'MID',
  positions: ['CM'],
  nationalityCode: null,
  birthDate: null,
  reportedAge: 18,
  ageReferenceSeasonOrdinal: 1,
  marketValueCents: null,
  attributes: { passing: 70 },
  potential: null,
  source: 'fictional',
  externalSourceId: null,
  isNewgen: false,
})

export const simulationState = simulationStateSchema.parse({
  id: 'state-a',
  campaignId: campaignA.id,
  activeSeasonId: seasonA.id,
  rootSeed: 'foundation-test',
  simulationVersion: '1',
  calendarVersion: '1',
  currentDate: '2026-07-01',
  phase: 'preseason',
  lastBoundaryKey: null,
})

export const clubSimulationState = clubSimulationStateSchema.parse({
  id: 'club-state-a',
  campaignId: campaignA.id,
  clubId: clubA.id,
  simulationKey: 'club:01',
  transferBalanceCents: 100_000,
  wageBudgetWeeklyCents: 10_000,
})

export const playerSimulationState = playerSimulationStateSchema.parse({
  id: 'player-state-a',
  campaignId: campaignA.id,
  playerId: simulationPlayer.id,
  simulationKey: 'player:01',
  fitness: 100,
  sharpness: 60,
  goalkeeping: null,
  injuryUntilDate: null,
  suspensionMatches: 0,
  status: 'active',
  homegrownClub: true,
  homegrownNation: true,
})

export const simulationReceipt = simulationReceiptSchema.parse({
  id: 'receipt-a',
  campaignId: campaignA.id,
  operationKey: 'initialize:1',
  inputRevision: 0,
  inputFingerprint: 'input:foundation-test:2026',
  eventSeed: 123,
  simulationVersion: '1',
  outcomeRefs: [
    { kind: 'campaign', id: campaignA.id },
    { kind: 'season', id: seasonA.id },
    { kind: 'club', id: clubA.id },
    { kind: 'player', id: simulationPlayer.id },
    { kind: 'boundary', key: '2026:summer-deadline' },
  ],
  createdAt: campaignA.createdAt,
})
