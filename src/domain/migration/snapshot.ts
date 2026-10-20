import type { ZodType } from 'zod'
import { timestampUtcSchema } from '../models/dates'
import {
  simulationReceiptSchema,
  clubSimulationStateSchema,
  playerSimulationStateSchema,
  simulationStateSchema,
  type ClubSimulationState,
  type PlayerSimulationState,
  type SimulationReceipt,
  type SimulationState,
} from '../simulation/schemas'
import type { ParseResult } from '../validation/result'
import {
  appearanceSchema,
  auditEventSchema,
  campaignSchema,
  clubSchema,
  constitutionSchema,
  contractSchema,
  developmentPlanSchema,
  entityIdSchema,
  importReceiptSchema,
  leagueSchema,
  ledgerEntrySchema,
  lineupSchema,
  matchRecordSchema,
  offerSchema,
  playerSchema,
  registrationSchema,
  scoutingReportSchema,
  seasonSchema,
  shortlistItemSchema,
  transferSchema,
  type Appearance,
  type AuditEvent,
  type Campaign,
  type Club,
  type Constitution,
  type Contract,
  type DevelopmentPlan,
  type ImportReceipt,
  type League,
  type LedgerEntry,
  type Lineup,
  type MatchRecord,
  type Offer,
  type Player,
  type Registration,
  type ScoutingReport,
  type Season,
  type ShortlistItem,
  type Transfer,
} from '../validation/schemas'

export const SNAPSHOT_FORMAT = 'touchline-campaign'
export const SNAPSHOT_FORMAT_VERSION = 1

export const SNAPSHOT_STORES = [
  'campaigns',
  'seasons',
  'leagues',
  'clubs',
  'players',
  'contracts',
  'constitutions',
  'ledgerEntries',
  'transfers',
  'offers',
  'lineups',
  'registrations',
  'matchRecords',
  'appearances',
  'shortlistItems',
  'scoutingReports',
  'developmentPlans',
  'auditEvents',
  'importReceipts',
  'simulationStates',
  'clubSimulationStates',
  'playerSimulationStates',
  'simulationReceipts',
] as const

export type SnapshotStoreName = (typeof SNAPSHOT_STORES)[number]

export const SIMULATION_STORES = [
  'simulationStates',
  'clubSimulationStates',
  'playerSimulationStates',
  'simulationReceipts',
] as const satisfies readonly SnapshotStoreName[]

export const INDEXEDDB_V1_STORES = SNAPSHOT_STORES.filter(
  (store) =>
    !(SIMULATION_STORES as readonly SnapshotStoreName[]).includes(store),
)

export const supportedSourceVersions = {
  indexeddb: [1, 2],
  sqlite: [1],
} as const

export type SourceStorage = keyof typeof supportedSourceVersions

export const snapshotLimits = {
  maxUtf8Bytes: 32 * 1024 * 1024,
  maxStringLength: 20_000,
  maxDepth: 12,
  maxRows: {
    campaigns: 1,
    seasons: 64,
    leagues: 32,
    clubs: 256,
    players: 8_000,
    contracts: 8_000,
    constitutions: 64,
    ledgerEntries: 8_000,
    transfers: 8_000,
    offers: 8_000,
    lineups: 256,
    registrations: 16_000,
    matchRecords: 8_000,
    appearances: 64_000,
    shortlistItems: 2_000,
    scoutingReports: 8_000,
    developmentPlans: 8_000,
    auditEvents: 16_000,
    importReceipts: 256,
    simulationStates: 1,
    clubSimulationStates: 256,
    playerSimulationStates: 8_000,
    simulationReceipts: 256,
  },
} as const satisfies {
  maxUtf8Bytes: number
  maxStringLength: number
  maxDepth: number
  maxRows: Record<SnapshotStoreName, number>
}

export type SnapshotTables = {
  campaigns: Campaign[]
  seasons: Season[]
  leagues: League[]
  clubs: Club[]
  players: Player[]
  contracts: Contract[]
  constitutions: Constitution[]
  ledgerEntries: LedgerEntry[]
  transfers: Transfer[]
  offers: Offer[]
  lineups: Lineup[]
  registrations: Registration[]
  matchRecords: MatchRecord[]
  appearances: Appearance[]
  shortlistItems: ShortlistItem[]
  scoutingReports: ScoutingReport[]
  developmentPlans: DevelopmentPlan[]
  auditEvents: AuditEvent[]
  importReceipts: ImportReceipt[]
  simulationStates: SimulationState[]
  clubSimulationStates: ClubSimulationState[]
  playerSimulationStates: PlayerSimulationState[]
  simulationReceipts: SimulationReceipt[]
}

export type CampaignSnapshot = {
  format: typeof SNAPSHOT_FORMAT
  formatVersion: typeof SNAPSHOT_FORMAT_VERSION
  sourceStorage: SourceStorage
  sourceSchemaVersion: number
  exportId: string
  exportedAt: string
  campaignRevision: number
  tables: SnapshotTables
}

export type CapturedTables = Partial<
  Record<SnapshotStoreName, readonly unknown[]>
>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function rowId(value: unknown): string {
  if (isPlainObject(value) && typeof value.id === 'string') return value.id
  return ''
}

export function isSupportedSource(
  storage: string,
  version: number,
): storage is SourceStorage {
  if (storage === 'indexeddb') return version === 1 || version === 2
  if (storage === 'sqlite') return version === 1
  return false
}

export function rowLimitReason(
  store: SnapshotStoreName,
  count: number,
): string | null {
  const limit = snapshotLimits.maxRows[store]
  if (count > limit) return `${store} has ${count} rows; the limit is ${limit}.`
  return null
}

export function snapshotByteReason(utf8Bytes: number): string | null {
  if (utf8Bytes > snapshotLimits.maxUtf8Bytes) {
    return `Snapshot is ${utf8Bytes} UTF-8 bytes; the limit is ${snapshotLimits.maxUtf8Bytes}.`
  }
  return null
}

export function numberReason(value: number, path: string): string | null {
  if (!Number.isFinite(value)) return `${path} is not a finite number.`
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    return `${path} is not a safe integer.`
  }
  return null
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function serializeSnapshot(snapshot: CampaignSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

/**
 * IndexedDB v1 rows predate mode metadata and the simulation stores.
 * Supply only those gaps. Leave every other missing or null field untouched.
 */
export function applyIndexedDbNormalization(
  sourceSchemaVersion: number,
  captured: CapturedTables,
): Record<SnapshotStoreName, unknown[]> {
  const tables = {} as Record<SnapshotStoreName, unknown[]>
  for (const store of SNAPSHOT_STORES) {
    const rows = captured[store]
    tables[store] = rows ? [...rows] : []
  }
  if (sourceSchemaVersion !== 1) return tables
  tables.campaigns = tables.campaigns.map((row) => {
    if (!isPlainObject(row)) return row
    const next = { ...row }
    if (!Object.hasOwn(next, 'mode')) next.mode = 'legacy'
    if (!Object.hasOwn(next, 'rulesMode')) next.rulesMode = 'sandbox'
    return next
  })
  tables.simulationStates = []
  tables.clubSimulationStates = []
  tables.playerSimulationStates = []
  tables.simulationReceipts = []
  return tables
}

function stringReason(value: string, path: string): string | null {
  if (value.length > snapshotLimits.maxStringLength) {
    return `${path} has ${value.length} characters; the limit is ${snapshotLimits.maxStringLength}.`
  }
  return null
}

function walkValue(value: unknown, path: string, depth: number): string | null {
  if (depth > snapshotLimits.maxDepth) return `${path} is nested too deeply.`
  if (typeof value === 'string') return stringReason(value, path)
  if (typeof value === 'number') return numberReason(value, path)
  if (typeof value === 'boolean' || value === null) return null
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const reason = walkValue(value[index], `${path}[${index}]`, depth + 1)
      if (reason) return reason
    }
    return null
  }
  if (!isPlainObject(value)) return `${path} has an unsupported value.`
  for (const [key, item] of Object.entries(value)) {
    const reason = walkValue(item, `${path}.${key}`, depth + 1)
    if (reason) return reason
  }
  return null
}

function duplicateIdReason(
  store: string,
  ids: readonly string[],
): string | null {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) return `${store} id ${id} is duplicated.`
    seen.add(id)
  }
  return null
}

function duplicateKeyReason(
  label: string,
  keys: readonly string[],
): string | null {
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) return `${label} ${key} is duplicated.`
    seen.add(key)
  }
  return null
}

function relationshipReason(tables: SnapshotTables): string | null {
  const campaign = tables.campaigns[0]
  if (!campaign) return 'Snapshot has 0 campaigns; export exactly one.'
  const campaignId = campaign.id
  const seasonIds = new Set(tables.seasons.map((row) => row.id))
  const leagueIds = new Set(tables.leagues.map((row) => row.id))
  const clubIds = new Set(tables.clubs.map((row) => row.id))
  const playerIds = new Set(tables.players.map((row) => row.id))
  const ledgerIds = new Set(tables.ledgerEntries.map((row) => row.id))
  const matchIds = new Set(tables.matchRecords.map((row) => row.id))

  const owned = [
    ...tables.seasons,
    ...tables.leagues,
    ...tables.clubs,
    ...tables.players,
    ...tables.contracts,
    ...tables.constitutions,
    ...tables.ledgerEntries,
    ...tables.transfers,
    ...tables.offers,
    ...tables.lineups,
    ...tables.registrations,
    ...tables.matchRecords,
    ...tables.appearances,
    ...tables.shortlistItems,
    ...tables.scoutingReports,
    ...tables.developmentPlans,
    ...tables.auditEvents,
    ...tables.simulationStates,
    ...tables.clubSimulationStates,
    ...tables.playerSimulationStates,
    ...tables.simulationReceipts,
  ]
  for (const row of owned) {
    if (row.campaignId !== campaignId) {
      return `${row.id} belongs to ${row.campaignId}, not ${campaignId}.`
    }
  }
  if (!clubIds.has(campaign.managedClubId)) {
    return `Campaign managedClubId ${campaign.managedClubId} is not a club in this campaign.`
  }
  if (!seasonIds.has(campaign.activeSeasonId)) {
    return `Campaign activeSeasonId ${campaign.activeSeasonId} is not a season in this campaign.`
  }

  const idSets: [string, readonly { id: string }[]][] = [
    ['seasons', tables.seasons],
    ['leagues', tables.leagues],
    ['clubs', tables.clubs],
    ['players', tables.players],
    ['contracts', tables.contracts],
    ['constitutions', tables.constitutions],
    ['ledgerEntries', tables.ledgerEntries],
    ['transfers', tables.transfers],
    ['offers', tables.offers],
    ['lineups', tables.lineups],
    ['registrations', tables.registrations],
    ['matchRecords', tables.matchRecords],
    ['appearances', tables.appearances],
    ['shortlistItems', tables.shortlistItems],
    ['scoutingReports', tables.scoutingReports],
    ['developmentPlans', tables.developmentPlans],
    ['auditEvents', tables.auditEvents],
    ['importReceipts', tables.importReceipts],
    ['simulationStates', tables.simulationStates],
    ['clubSimulationStates', tables.clubSimulationStates],
    ['playerSimulationStates', tables.playerSimulationStates],
    ['simulationReceipts', tables.simulationReceipts],
  ]
  for (const [store, rows] of idSets) {
    const reason = duplicateIdReason(
      store,
      rows.map((row) => row.id),
    )
    if (reason) return reason
  }

  const ordinalReason = duplicateKeyReason(
    'Season ordinal',
    tables.seasons.map((row) => String(row.ordinal)),
  )
  if (ordinalReason) return ordinalReason
  const versionReason = duplicateKeyReason(
    'Constitution version',
    tables.constitutions.map((row) => String(row.version)),
  )
  if (versionReason) return versionReason

  for (const club of tables.clubs) {
    if (club.leagueId !== null && !leagueIds.has(club.leagueId)) {
      return `Club ${club.id} leagueId ${club.leagueId} is not a league in this campaign.`
    }
  }
  for (const player of tables.players) {
    if (player.clubId !== null && !clubIds.has(player.clubId)) {
      return `Player ${player.id} clubId ${player.clubId} is not a club in this campaign.`
    }
  }
  for (const contract of tables.contracts) {
    if (!playerIds.has(contract.playerId)) {
      return `Contract ${contract.id} playerId ${contract.playerId} is not a player in this campaign.`
    }
    if (!clubIds.has(contract.clubId)) {
      return `Contract ${contract.id} clubId ${contract.clubId} is not a club in this campaign.`
    }
  }
  for (const entry of tables.ledgerEntries) {
    if (!seasonIds.has(entry.seasonId)) {
      return `Ledger entry ${entry.id} seasonId ${entry.seasonId} is not a season in this campaign.`
    }
    if (!clubIds.has(entry.clubId)) {
      return `Ledger entry ${entry.id} clubId ${entry.clubId} is not a club in this campaign.`
    }
    if (entry.reversesEntryId === entry.id) {
      return `Ledger entry ${entry.id} reverses itself.`
    }
    if (
      entry.reversesEntryId !== null &&
      !ledgerIds.has(entry.reversesEntryId)
    ) {
      return `Ledger entry ${entry.id} reversesEntryId ${entry.reversesEntryId} is not a ledger entry in this campaign.`
    }
  }
  for (const transfer of tables.transfers) {
    if (!seasonIds.has(transfer.seasonId)) {
      return `Transfer ${transfer.id} seasonId ${transfer.seasonId} is not a season in this campaign.`
    }
    if (!playerIds.has(transfer.playerId)) {
      return `Transfer ${transfer.id} playerId ${transfer.playerId} is not a player in this campaign.`
    }
    if (transfer.fromClubId !== null && !clubIds.has(transfer.fromClubId)) {
      return `Transfer ${transfer.id} fromClubId ${transfer.fromClubId} is not a club in this campaign.`
    }
    if (transfer.toClubId !== null && !clubIds.has(transfer.toClubId)) {
      return `Transfer ${transfer.id} toClubId ${transfer.toClubId} is not a club in this campaign.`
    }
  }
  for (const offer of tables.offers) {
    if (!seasonIds.has(offer.seasonId)) {
      return `Offer ${offer.id} seasonId ${offer.seasonId} is not a season in this campaign.`
    }
    if (!playerIds.has(offer.playerId)) {
      return `Offer ${offer.id} playerId ${offer.playerId} is not a player in this campaign.`
    }
    if (!clubIds.has(offer.bidderClubId)) {
      return `Offer ${offer.id} bidderClubId ${offer.bidderClubId} is not a club in this campaign.`
    }
  }
  for (const lineup of tables.lineups) {
    if (!seasonIds.has(lineup.seasonId)) {
      return `Lineup ${lineup.id} seasonId ${lineup.seasonId} is not a season in this campaign.`
    }
    for (const starter of lineup.starters) {
      if (!playerIds.has(starter.playerId)) {
        return `Lineup ${lineup.id} starter ${starter.playerId} is not a player in this campaign.`
      }
    }
    for (const playerId of lineup.benchPlayerIds) {
      if (!playerIds.has(playerId)) {
        return `Lineup ${lineup.id} bench player ${playerId} is not a player in this campaign.`
      }
    }
  }
  for (const registration of tables.registrations) {
    if (!seasonIds.has(registration.seasonId)) {
      return `Registration ${registration.id} seasonId ${registration.seasonId} is not a season in this campaign.`
    }
    if (!playerIds.has(registration.playerId)) {
      return `Registration ${registration.id} playerId ${registration.playerId} is not a player in this campaign.`
    }
  }
  const registrationKey = duplicateKeyReason(
    'Registration',
    tables.registrations.map(
      (row) => `${row.seasonId}\0${row.competitionKey}\0${row.playerId}`,
    ),
  )
  if (registrationKey) return registrationKey
  for (const match of tables.matchRecords) {
    if (!seasonIds.has(match.seasonId)) {
      return `Match ${match.id} seasonId ${match.seasonId} is not a season in this campaign.`
    }
  }
  for (const appearance of tables.appearances) {
    if (!seasonIds.has(appearance.seasonId)) {
      return `Appearance ${appearance.id} seasonId ${appearance.seasonId} is not a season in this campaign.`
    }
    if (!matchIds.has(appearance.matchId)) {
      return `Appearance ${appearance.id} matchId ${appearance.matchId} is not a match in this campaign.`
    }
    if (!playerIds.has(appearance.playerId)) {
      return `Appearance ${appearance.id} playerId ${appearance.playerId} is not a player in this campaign.`
    }
  }
  const appearanceKey = duplicateKeyReason(
    'Appearance',
    tables.appearances.map((row) => `${row.matchId}\0${row.playerId}`),
  )
  if (appearanceKey) return appearanceKey
  for (const item of tables.shortlistItems) {
    if (!playerIds.has(item.playerId)) {
      return `Shortlist item ${item.id} playerId ${item.playerId} is not a player in this campaign.`
    }
  }
  const shortlistKey = duplicateKeyReason(
    'Shortlist player',
    tables.shortlistItems.map((row) => row.playerId),
  )
  if (shortlistKey) return shortlistKey
  for (const report of tables.scoutingReports) {
    if (!playerIds.has(report.playerId)) {
      return `Scouting report ${report.id} playerId ${report.playerId} is not a player in this campaign.`
    }
    if (!seasonIds.has(report.seasonId)) {
      return `Scouting report ${report.id} seasonId ${report.seasonId} is not a season in this campaign.`
    }
  }
  for (const plan of tables.developmentPlans) {
    if (!playerIds.has(plan.playerId)) {
      return `Development plan ${plan.id} playerId ${plan.playerId} is not a player in this campaign.`
    }
    if (!seasonIds.has(plan.seasonId)) {
      return `Development plan ${plan.id} seasonId ${plan.seasonId} is not a season in this campaign.`
    }
  }
  const planKey = duplicateKeyReason(
    'Development plan',
    tables.developmentPlans.map((row) => `${row.playerId}\0${row.seasonId}`),
  )
  if (planKey) return planKey
  for (const audit of tables.auditEvents) {
    if (audit.seasonId !== null && !seasonIds.has(audit.seasonId)) {
      return `Audit ${audit.id} seasonId ${audit.seasonId} is not a season in this campaign.`
    }
  }
  const actionKey = duplicateKeyReason(
    'Audit action',
    tables.auditEvents.map((row) => row.actionId),
  )
  if (actionKey) return actionKey
  for (const receipt of tables.importReceipts) {
    if (receipt.campaignId !== campaignId) {
      return `Import receipt ${receipt.id} is not scoped to this campaign.`
    }
  }
  if (tables.simulationStates.length > 1) {
    return 'simulationStates has more than one row; a campaign has one clock.'
  }
  for (const state of tables.simulationStates) {
    if (!seasonIds.has(state.activeSeasonId)) {
      return `Simulation state ${state.id} activeSeasonId ${state.activeSeasonId} is not a season in this campaign.`
    }
  }
  for (const state of tables.clubSimulationStates) {
    if (!clubIds.has(state.clubId)) {
      return `Club simulation ${state.id} clubId ${state.clubId} is not a club in this campaign.`
    }
  }
  const clubKey = duplicateKeyReason(
    'Club simulation key',
    tables.clubSimulationStates.map((row) => row.simulationKey),
  )
  if (clubKey) return clubKey
  const clubSimClub = duplicateKeyReason(
    'Club simulation club',
    tables.clubSimulationStates.map((row) => row.clubId),
  )
  if (clubSimClub) return clubSimClub
  for (const state of tables.playerSimulationStates) {
    if (!playerIds.has(state.playerId)) {
      return `Player simulation ${state.id} playerId ${state.playerId} is not a player in this campaign.`
    }
  }
  const playerKey = duplicateKeyReason(
    'Player simulation key',
    tables.playerSimulationStates.map((row) => row.simulationKey),
  )
  if (playerKey) return playerKey
  const playerSimPlayer = duplicateKeyReason(
    'Player simulation player',
    tables.playerSimulationStates.map((row) => row.playerId),
  )
  if (playerSimPlayer) return playerSimPlayer
  const operationKey = duplicateKeyReason(
    'Simulation receipt',
    tables.simulationReceipts.map((row) => row.operationKey),
  )
  if (operationKey) return operationKey
  for (const receipt of tables.simulationReceipts) {
    for (const ref of receipt.outcomeRefs) {
      if (ref.kind === 'campaign' && ref.id !== campaignId) {
        return `Simulation receipt ${receipt.id} references campaign ${ref.id}.`
      }
      if (ref.kind === 'season' && !seasonIds.has(ref.id)) {
        return `Simulation receipt ${receipt.id} references missing season ${ref.id}.`
      }
      if (ref.kind === 'club' && !clubIds.has(ref.id)) {
        return `Simulation receipt ${receipt.id} references missing club ${ref.id}.`
      }
      if (ref.kind === 'player' && !playerIds.has(ref.id)) {
        return `Simulation receipt ${receipt.id} references missing player ${ref.id}.`
      }
    }
  }
  return null
}

function parseStoreRows<T>(
  store: SnapshotStoreName,
  rows: readonly unknown[],
  schema: ZodType<T>,
): ParseResult<T[]> {
  const parsed: T[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const result = schema.safeParse(rows[index])
    if (!result.success) {
      const issue = result.error.issues[0]
      const detail = issue?.message ?? 'is invalid'
      const suffix =
        issue && issue.path.length > 0 ? ` (${issue.path.join('.')})` : ''
      return {
        ok: false,
        message: `${store}[${index}] ${detail}${suffix}`,
      }
    }
    parsed.push(result.data)
  }
  return { ok: true, value: parsed }
}

export function validateSnapshot(
  value: unknown,
): ParseResult<CampaignSnapshot> {
  if (!isPlainObject(value)) {
    return { ok: false, message: 'Snapshot must be an object.' }
  }
  if (value.format !== SNAPSHOT_FORMAT) {
    return { ok: false, message: 'format must be touchline-campaign.' }
  }
  if (value.formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    return { ok: false, message: 'formatVersion must be 1.' }
  }
  if (value.sourceStorage !== 'indexeddb' && value.sourceStorage !== 'sqlite') {
    return {
      ok: false,
      message: 'sourceStorage must be indexeddb or sqlite.',
    }
  }
  if (
    typeof value.sourceSchemaVersion !== 'number' ||
    !Number.isSafeInteger(value.sourceSchemaVersion)
  ) {
    return { ok: false, message: 'sourceSchemaVersion is not a safe integer.' }
  }
  if (!isSupportedSource(value.sourceStorage, value.sourceSchemaVersion)) {
    return {
      ok: false,
      message: `sourceSchemaVersion ${value.sourceSchemaVersion} is not supported for ${value.sourceStorage}. Supported pairs are indexeddb 1, indexeddb 2, and sqlite 1.`,
    }
  }
  const exportId = entityIdSchema.safeParse(value.exportId)
  if (!exportId.success) {
    return {
      ok: false,
      message: 'exportId must be 1-64 letters, numbers, or hyphens.',
    }
  }
  const exportedAt = timestampUtcSchema.safeParse(value.exportedAt)
  if (!exportedAt.success) {
    return {
      ok: false,
      message:
        'exportedAt must be a UTC timestamp like YYYY-MM-DDTHH:mm:ss.sssZ.',
    }
  }
  if (
    typeof value.campaignRevision !== 'number' ||
    !Number.isSafeInteger(value.campaignRevision) ||
    value.campaignRevision < 0
  ) {
    return {
      ok: false,
      message: 'campaignRevision is not a non-negative safe integer.',
    }
  }
  if (!isPlainObject(value.tables)) {
    return { ok: false, message: 'tables must list all 23 stores.' }
  }
  const extras = Object.keys(value.tables).filter(
    (key) => !(SNAPSHOT_STORES as readonly string[]).includes(key),
  )
  if (extras.length > 0) {
    return {
      ok: false,
      message: `tables includes unsupported store ${extras[0]}.`,
    }
  }
  const rawTables = {} as Record<SnapshotStoreName, unknown[]>
  for (const store of SNAPSHOT_STORES) {
    if (!Object.hasOwn(value.tables, store)) {
      return { ok: false, message: `tables.${store} is missing.` }
    }
    const rows = value.tables[store]
    if (!Array.isArray(rows)) {
      return { ok: false, message: `tables.${store} must be an array.` }
    }
    if (store === 'campaigns' && rows.length !== 1) {
      return {
        ok: false,
        message: `Snapshot has ${rows.length} campaigns; export exactly one.`,
      }
    }
    for (const row of rows) {
      if (
        isPlainObject(row) &&
        !Object.hasOwn(row, 'mode') &&
        store === 'campaigns'
      ) {
        return {
          ok: false,
          message:
            'Campaign is missing mode. IndexedDB v1 normalization must supply legacy before validation.',
        }
      }
      if (
        isPlainObject(row) &&
        store === 'campaigns' &&
        !Object.hasOwn(row, 'rulesMode')
      ) {
        return {
          ok: false,
          message:
            'Campaign is missing rulesMode. IndexedDB v1 normalization must supply sandbox before validation.',
        }
      }
    }
    const limit = rowLimitReason(store, rows.length)
    if (limit) return { ok: false, message: limit }
    rawTables[store] = [...rows].sort((left, right) =>
      compareIds(rowId(left), rowId(right)),
    )
  }
  const walked = walkValue(rawTables, 'tables', 1)
  if (walked) return { ok: false, message: walked }

  const campaigns = parseStoreRows(
    'campaigns',
    rawTables.campaigns,
    campaignSchema,
  )
  if (!campaigns.ok) return campaigns
  const seasons = parseStoreRows('seasons', rawTables.seasons, seasonSchema)
  if (!seasons.ok) return seasons
  const leagues = parseStoreRows('leagues', rawTables.leagues, leagueSchema)
  if (!leagues.ok) return leagues
  const clubs = parseStoreRows('clubs', rawTables.clubs, clubSchema)
  if (!clubs.ok) return clubs
  const players = parseStoreRows('players', rawTables.players, playerSchema)
  if (!players.ok) return players
  const contracts = parseStoreRows(
    'contracts',
    rawTables.contracts,
    contractSchema,
  )
  if (!contracts.ok) return contracts
  const constitutions = parseStoreRows(
    'constitutions',
    rawTables.constitutions,
    constitutionSchema,
  )
  if (!constitutions.ok) return constitutions
  const ledgerEntries = parseStoreRows(
    'ledgerEntries',
    rawTables.ledgerEntries,
    ledgerEntrySchema,
  )
  if (!ledgerEntries.ok) return ledgerEntries
  const transfers = parseStoreRows(
    'transfers',
    rawTables.transfers,
    transferSchema,
  )
  if (!transfers.ok) return transfers
  const offers = parseStoreRows('offers', rawTables.offers, offerSchema)
  if (!offers.ok) return offers
  const lineups = parseStoreRows('lineups', rawTables.lineups, lineupSchema)
  if (!lineups.ok) return lineups
  const registrations = parseStoreRows(
    'registrations',
    rawTables.registrations,
    registrationSchema,
  )
  if (!registrations.ok) return registrations
  const matchRecords = parseStoreRows(
    'matchRecords',
    rawTables.matchRecords,
    matchRecordSchema,
  )
  if (!matchRecords.ok) return matchRecords
  const appearances = parseStoreRows(
    'appearances',
    rawTables.appearances,
    appearanceSchema,
  )
  if (!appearances.ok) return appearances
  const shortlistItems = parseStoreRows(
    'shortlistItems',
    rawTables.shortlistItems,
    shortlistItemSchema,
  )
  if (!shortlistItems.ok) return shortlistItems
  const scoutingReports = parseStoreRows(
    'scoutingReports',
    rawTables.scoutingReports,
    scoutingReportSchema,
  )
  if (!scoutingReports.ok) return scoutingReports
  const developmentPlans = parseStoreRows(
    'developmentPlans',
    rawTables.developmentPlans,
    developmentPlanSchema,
  )
  if (!developmentPlans.ok) return developmentPlans
  const auditEvents = parseStoreRows(
    'auditEvents',
    rawTables.auditEvents,
    auditEventSchema,
  )
  if (!auditEvents.ok) return auditEvents
  const importReceipts = parseStoreRows(
    'importReceipts',
    rawTables.importReceipts,
    importReceiptSchema,
  )
  if (!importReceipts.ok) return importReceipts
  const simulationStates = parseStoreRows(
    'simulationStates',
    rawTables.simulationStates,
    simulationStateSchema,
  )
  if (!simulationStates.ok) return simulationStates
  const clubSimulationStates = parseStoreRows(
    'clubSimulationStates',
    rawTables.clubSimulationStates,
    clubSimulationStateSchema,
  )
  if (!clubSimulationStates.ok) return clubSimulationStates
  const playerSimulationStates = parseStoreRows(
    'playerSimulationStates',
    rawTables.playerSimulationStates,
    playerSimulationStateSchema,
  )
  if (!playerSimulationStates.ok) return playerSimulationStates
  const simulationReceipts = parseStoreRows(
    'simulationReceipts',
    rawTables.simulationReceipts,
    simulationReceiptSchema,
  )
  if (!simulationReceipts.ok) return simulationReceipts

  const tables: SnapshotTables = {
    campaigns: campaigns.value,
    seasons: seasons.value,
    leagues: leagues.value,
    clubs: clubs.value,
    players: players.value,
    contracts: contracts.value,
    constitutions: constitutions.value,
    ledgerEntries: ledgerEntries.value,
    transfers: transfers.value,
    offers: offers.value,
    lineups: lineups.value,
    registrations: registrations.value,
    matchRecords: matchRecords.value,
    appearances: appearances.value,
    shortlistItems: shortlistItems.value,
    scoutingReports: scoutingReports.value,
    developmentPlans: developmentPlans.value,
    auditEvents: auditEvents.value,
    importReceipts: importReceipts.value,
    simulationStates: simulationStates.value,
    clubSimulationStates: clubSimulationStates.value,
    playerSimulationStates: playerSimulationStates.value,
    simulationReceipts: simulationReceipts.value,
  }
  const campaign = tables.campaigns[0]
  if (!campaign) {
    return {
      ok: false,
      message: 'Snapshot has 0 campaigns; export exactly one.',
    }
  }
  if (campaign.revision !== value.campaignRevision) {
    return {
      ok: false,
      message: `campaignRevision ${value.campaignRevision} does not match the campaign revision ${campaign.revision}.`,
    }
  }
  const relations = relationshipReason(tables)
  if (relations) return { ok: false, message: relations }
  const snapshot: CampaignSnapshot = {
    format: SNAPSHOT_FORMAT,
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    sourceStorage: value.sourceStorage,
    sourceSchemaVersion: value.sourceSchemaVersion,
    exportId: exportId.data,
    exportedAt: exportedAt.data,
    campaignRevision: value.campaignRevision,
    tables,
  }
  const bytes = snapshotByteReason(utf8ByteLength(serializeSnapshot(snapshot)))
  if (bytes) return { ok: false, message: bytes }
  return { ok: true, value: snapshot }
}
