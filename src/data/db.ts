import Dexie, { type EntityTable } from 'dexie'
import type { ZodType } from 'zod'
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

export const DATABASE_NAME = 'touchline-os'
export const DATABASE_VERSION = 1

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

  constructor(name: string) {
    super(name)
    this.version(DATABASE_VERSION).stores(schemaV1)
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
