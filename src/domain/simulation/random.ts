import { z } from 'zod'
import { hashSeed, mulberry32 } from '../seed/prng'
import {
  simulationKeySchema,
  simulationStateSchema,
  simulationVersionSchema,
} from './schemas'

export const simulationEventKinds = [
  'world',
  'calendar',
  'fixture',
  'market',
  'development',
] as const

export type SimulationEventKind = (typeof simulationEventKinds)[number]
const eventKindSchema = z.enum(simulationEventKinds)
const logicalKeysSchema = z.array(simulationKeySchema).max(32)

/**
 * Versioned stream identity: ordered JSON arrays preserve component boundaries.
 * Keys describe football/calendar identities, never remappable database IDs or
 * audit timestamps. An empty key list names the namespace's root stream.
 */
export function eventStreamKey(
  rootSeed: string,
  simulationVersion: string,
  eventKind: SimulationEventKind,
  logicalKeys: readonly string[],
): string {
  return JSON.stringify([
    'simulation-stream',
    simulationVersionSchema.parse(simulationVersion),
    simulationStateSchema.shape.rootSeed.parse(rootSeed),
    eventKindSchema.parse(eventKind),
    logicalKeysSchema.parse(logicalKeys),
  ])
}

export function deriveEventSeed(
  rootSeed: string,
  simulationVersion: string,
  eventKind: SimulationEventKind,
  logicalKeys: readonly string[],
): number {
  return hashSeed(
    eventStreamKey(rootSeed, simulationVersion, eventKind, logicalKeys),
    'simulation-stream',
  )
}

/** Each call owns its PRNG; draws never consume another event's stream. */
export function createEventStream(
  rootSeed: string,
  simulationVersion: string,
  eventKind: SimulationEventKind,
  logicalKeys: readonly string[],
): () => number {
  return mulberry32(
    deriveEventSeed(rootSeed, simulationVersion, eventKind, logicalKeys),
  )
}
