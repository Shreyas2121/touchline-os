import Dexie, { type EntityTable } from 'dexie'
import type { ZodType } from 'zod'
import type {
  SimulationState,
  ClubSimulationState,
  PlayerSimulationState,
  SimulationReceipt,
} from '../domain/simulation/schemas'
import type {
  Appearance,
  AuditEvent,
  Campaign,
  Club,
  Constitution,
  Contract,
  DevelopmentPlan,
  ImportReceipt,
  League,
  LedgerEntry,
  Lineup,
  MatchRecord,
  Offer,
  Player,
  Registration,
  ScoutingReport,
  Season,
  ShortlistItem,
  Transfer,
} from '../domain/validation/schemas'
import { PersistenceError } from './errors'
import { schemaV1 } from './migrations/v1'
import { schemaV2, upgradeLegacyCampaigns } from './migrations/v2'

export const DATABASE_NAME = 'touchline-os'
export const DATABASE_VERSION = 2

export class TouchlineDatabase extends Dexie {
  campaigns!: EntityTable<Campaign, 'id'>
  seasons!: EntityTable<Season, 'id'>
  leagues!: EntityTable<League, 'id'>
  clubs!: EntityTable<Club, 'id'>
  players!: EntityTable<Player, 'id'>
  contracts!: EntityTable<Contract, 'id'>
  constitutions!: EntityTable<Constitution, 'id'>
  ledgerEntries!: EntityTable<LedgerEntry, 'id'>
  transfers!: EntityTable<Transfer, 'id'>
  offers!: EntityTable<Offer, 'id'>
  lineups!: EntityTable<Lineup, 'id'>
  registrations!: EntityTable<Registration, 'id'>
  matchRecords!: EntityTable<MatchRecord, 'id'>
  appearances!: EntityTable<Appearance, 'id'>
  shortlistItems!: EntityTable<ShortlistItem, 'id'>
  scoutingReports!: EntityTable<ScoutingReport, 'id'>
  developmentPlans!: EntityTable<DevelopmentPlan, 'id'>
  auditEvents!: EntityTable<AuditEvent, 'id'>
  importReceipts!: EntityTable<ImportReceipt, 'id'>
  simulationStates!: EntityTable<SimulationState, 'id'>
  clubSimulationStates!: EntityTable<ClubSimulationState, 'id'>
  playerSimulationStates!: EntityTable<PlayerSimulationState, 'id'>
  simulationReceipts!: EntityTable<SimulationReceipt, 'id'>

  constructor(name: string) {
    super(name)
    this.version(1).stores(schemaV1)
    this.version(2).stores(schemaV2).upgrade(upgradeLegacyCampaigns)
    this.on('ready', () => {
      // Dexie can open a newer native database without running an upgrade.
      // Refuse it explicitly before exposing any reads or writes.
      if (this.backendDB().version > DATABASE_VERSION * 10) {
        throw new Dexie.VersionError(
          'This save uses a newer database version. Update Touchline OS to open it.',
        )
      }
    })
  }
}

const databases = new Map<string, TouchlineDatabase>()

export function getDatabase(name = DATABASE_NAME): TouchlineDatabase {
  const cached = databases.get(name)
  if (cached) return cached
  const database = new TouchlineDatabase(name)
  databases.set(name, database)
  return database
}

export async function deleteDatabaseForTests(name: string): Promise<void> {
  const cached = databases.get(name)
  if (cached) {
    cached.close()
    databases.delete(name)
  }
  await Dexie.delete(name)
}

export function closeDatabaseForTests(name: string): void {
  const cached = databases.get(name)
  if (!cached) return
  cached.close()
  databases.delete(name)
}

export function assertStorageAvailable(
  indexedDB: IDBFactory | undefined,
): void {
  if (indexedDB === undefined) {
    throw new PersistenceError('UNAVAILABLE', 'IndexedDB is not available.')
  }
}

export function parseStored<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new PersistenceError(
      'CORRUPT',
      'Stored row does not match its schema.',
    )
  }
  return parsed.data
}
