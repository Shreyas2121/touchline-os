import { constitutionPreset } from '../rules/presets'
import {
  applyIndexedDbNormalization,
  SNAPSHOT_STORES,
  validateSnapshot,
  type CampaignSnapshot,
  type CapturedTables,
  type SnapshotStoreName,
} from './snapshot'

const timestamp = '2026-07-01T00:00:00.000Z'
const opening = '2026-07-01'

export const legacyV1Export = {
  exportId: 'export-legacy-v1',
  exportedAt: '2026-10-20T12:00:00.000Z',
} as const

export const legacyV2Export = {
  exportId: 'export-legacy-v2',
  exportedAt: '2026-10-20T12:10:00.000Z',
} as const

export const standaloneV2Export = {
  exportId: 'export-standalone-v2',
  exportedAt: '2026-10-20T12:20:00.000Z',
} as const

function emptyTables(): Record<SnapshotStoreName, unknown[]> {
  const tables = {} as Record<SnapshotStoreName, unknown[]>
  for (const store of SNAPSHOT_STORES) tables[store] = []
  return tables
}

function mustSnapshot(
  label: string,
  sourceSchemaVersion: 1 | 2,
  exportId: string,
  exportedAt: string,
  captured: CapturedTables,
  campaignRevision: number,
): CampaignSnapshot {
  const tables = applyIndexedDbNormalization(sourceSchemaVersion, captured)
  const validated = validateSnapshot({
    format: 'touchline-campaign',
    formatVersion: 1,
    sourceStorage: 'indexeddb',
    sourceSchemaVersion,
    exportId,
    exportedAt,
    campaignRevision,
    tables,
  })
  if (!validated.ok) throw new Error(`${label}: ${validated.message}`)
  return validated.value
}

function legacyRows(
  campaignId: string,
  mode: 'legacy' | 'standalone' | undefined,
  rulesMode: 'challenge' | 'sandbox' | undefined,
  seed: string | null,
  generatorVersion: string | null,
  revision: number,
): Record<SnapshotStoreName, unknown[]> {
  const seasonId = `${campaignId}-season`
  const leagueId = `${campaignId}-league`
  const clubId = `${campaignId}-club`
  const playerId = `${campaignId}-player`
  const tables = emptyTables()
  const campaign: Record<string, unknown> = {
    id: campaignId,
    name: campaignId === 'standalone-v2' ? 'Ashford career' : 'Riverside',
    kind: 'fictional',
    seed,
    generatorVersion,
    managedClubId: clubId,
    activeSeasonId: seasonId,
    currency: 'EUR',
    createdAt: timestamp,
    updatedAt: timestamp,
    revision,
    status: 'active',
  }
  if (mode !== undefined) campaign.mode = mode
  if (rulesMode !== undefined) campaign.rulesMode = rulesMode
  tables.campaigns = [campaign]
  tables.seasons = [
    {
      id: seasonId,
      campaignId,
      label: mode === 'standalone' ? '2026/27' : 'Season 1',
      ordinal: 1,
      status: 'active',
      startDate: mode === 'standalone' ? opening : null,
      endDate: mode === 'standalone' ? '2027-06-30' : null,
      openedAt: timestamp,
      closedAt: null,
    },
  ]
  tables.leagues = [
    {
      id: leagueId,
      campaignId,
      name: 'North Counties',
      countryCode: null,
      tier: null,
    },
  ]
  tables.clubs = [
    {
      id: clubId,
      campaignId,
      leagueId,
      name: 'Riverside Athletic',
      shortName: 'RIV',
      colors: { primary: '#113355', secondary: '#D4A017' },
      prestige: 40,
      academyTier: 3,
      scoutingRegion: null,
    },
  ]
  tables.players = [
    {
      id: playerId,
      campaignId,
      clubId,
      name: 'Amina Cole',
      positionGroup: 'MID',
      positions: ['CM'],
      nationalityCode: null,
      birthDate: null,
      reportedAge: null,
      ageReferenceSeasonOrdinal: null,
      marketValueCents: null,
      attributes: { passing: 70 },
      potential: null,
      source: 'fictional',
      externalSourceId: null,
      isNewgen: false,
    },
  ]
  tables.contracts = [
    {
      id: `${campaignId}-contract`,
      campaignId,
      playerId,
      clubId,
      weeklyWageCents: null,
      squadTier: null,
      startsOn: null,
      expiresOn: null,
      status: 'active',
    },
  ]
  tables.constitutions = [
    {
      id: `${campaignId}-rules`,
      campaignId,
      version: 1,
      rules: constitutionPreset(
        rulesMode === 'challenge' ? 'balanced' : 'custom',
      ),
      updatedAt: timestamp,
    },
  ]
  tables.ledgerEntries = [
    {
      id: `${campaignId}-ledger`,
      campaignId,
      seasonId,
      clubId,
      kind: 'initial_allocation',
      amountCents: 150_000,
      effectiveOn: opening,
      sourceActionId: `${campaignId}-action`,
      reversesEntryId: null,
      note: null,
    },
  ]
  tables.transfers = [
    {
      id: `${campaignId}-transfer`,
      campaignId,
      seasonId,
      playerId,
      fromClubId: null,
      toClubId: clubId,
      feeCents: 0,
      kind: 'free',
      effectiveOn: opening,
      sourceActionId: `${campaignId}-action`,
    },
  ]
  tables.offers = [
    {
      id: `${campaignId}-offer`,
      campaignId,
      seasonId,
      playerId,
      bidderClubId: clubId,
      feeCents: 0,
      status: 'open',
      receivedOn: opening,
      resolvedOn: null,
    },
  ]
  tables.lineups = [
    {
      id: `${campaignId}-lineup`,
      campaignId,
      seasonId,
      name: 'Opening',
      formation: '4-3-3',
      starters: [{ playerId, slot: 'CM', role: null }],
      benchPlayerIds: [],
      updatedAt: timestamp,
    },
  ]
  tables.registrations = [
    {
      id: `${campaignId}-registration`,
      campaignId,
      seasonId,
      playerId,
      competitionKey: 'league',
      status: 'unknown',
      homegrownClub: null,
      homegrownNation: null,
      ageExempt: null,
      provenance: 'fictional',
    },
  ]
  tables.matchRecords = [
    {
      id: `${campaignId}-match`,
      campaignId,
      seasonId,
      date: opening,
      opponent: 'Calder Reserve',
      homeAway: 'home',
      goalsFor: 2,
      goalsAgainst: 1,
      competition: null,
      notes: null,
      xgFor: null,
      xgAgainst: null,
    },
  ]
  tables.appearances = [
    {
      id: `${campaignId}-appearance`,
      campaignId,
      seasonId,
      matchId: `${campaignId}-match`,
      playerId,
      minutes: 90,
      started: null,
      goals: null,
      assists: null,
      rating: null,
    },
  ]
  tables.shortlistItems = [
    {
      id: `${campaignId}-shortlist`,
      campaignId,
      playerId,
      priority: 3,
      status: 'open',
      notes: null,
      addedAt: timestamp,
    },
  ]
  tables.scoutingReports = [
    {
      id: `${campaignId}-scout`,
      campaignId,
      playerId,
      seasonId,
      archetype: 'Box midfielder',
      observations: '',
      confidence: 'low',
      source: 'estimated',
      createdAt: timestamp,
    },
  ]
  tables.developmentPlans = [
    {
      id: `${campaignId}-plan`,
      campaignId,
      playerId,
      seasonId,
      targetRole: null,
      notes: '',
      status: 'open',
    },
  ]
  tables.auditEvents = [
    {
      id: `${campaignId}-audit`,
      campaignId,
      seasonId,
      actionId: `${campaignId}-action`,
      actionType: 'campaign.create',
      createdAt: timestamp,
      summary: 'Created the synthetic campaign',
      payload: { synthetic: true, nullable: null },
    },
  ]
  tables.importReceipts = [
    {
      id: `${campaignId}-import`,
      campaignId,
      sourceName: 'Synthetic receipt',
      sourceType: 'json',
      importedAt: timestamp,
      rowCounts: { players: 1 },
      mappingVersion: 'synthetic-1',
      warnings: ['fingerprint:synthetic-kept'],
      provenance: 'fictional',
    },
  ]
  return tables
}

export function legacyV1Captured(): CapturedTables {
  const tables = legacyRows('legacy-v1', undefined, undefined, null, null, 3)
  const captured: CapturedTables = {}
  for (const store of SNAPSHOT_STORES) {
    if (
      store === 'simulationStates' ||
      store === 'clubSimulationStates' ||
      store === 'playerSimulationStates' ||
      store === 'simulationReceipts'
    ) {
      continue
    }
    captured[store] = tables[store]
  }
  return captured
}

export function legacyV1Snapshot(): CampaignSnapshot {
  return mustSnapshot(
    'legacy-v1',
    1,
    legacyV1Export.exportId,
    legacyV1Export.exportedAt,
    legacyV1Captured(),
    3,
  )
}

function withSimulation(
  tables: Record<SnapshotStoreName, unknown[]>,
  campaignId: string,
  rootSeed: string,
  fingerprint: string,
): void {
  const seasonId = `${campaignId}-season`
  const clubId = `${campaignId}-club`
  const playerId = `${campaignId}-player`
  tables.simulationStates = [
    {
      id: `${campaignId}-clock`,
      campaignId,
      activeSeasonId: seasonId,
      rootSeed,
      simulationVersion: '1',
      calendarVersion: '1',
      currentDate: opening,
      phase: 'preseason',
      lastBoundaryKey: null,
    },
  ]
  tables.clubSimulationStates = [
    {
      id: `${campaignId}-club-state`,
      campaignId,
      clubId,
      simulationKey: 'club:01',
      transferBalanceCents: 100_000,
      wageBudgetWeeklyCents: 10_000,
    },
  ]
  tables.playerSimulationStates = [
    {
      id: `${campaignId}-player-state`,
      campaignId,
      playerId,
      simulationKey: 'player:01',
      fitness: 100,
      sharpness: 60,
      goalkeeping: null,
      injuryUntilDate: null,
      suspensionMatches: 0,
      status: 'active',
      homegrownClub: true,
      homegrownNation: false,
    },
  ]
  tables.simulationReceipts = [
    {
      id: `${campaignId}-receipt`,
      campaignId,
      operationKey: 'career:initialize',
      inputRevision: 3,
      inputFingerprint: fingerprint,
      eventSeed: 123,
      simulationVersion: '1',
      outcomeRefs: [
        { kind: 'campaign', id: campaignId },
        { kind: 'season', id: seasonId },
        { kind: 'club', id: clubId },
        { kind: 'player', id: playerId },
        { kind: 'boundary', key: '2026:summer-deadline' },
      ],
      createdAt: timestamp,
    },
  ]
}

export function legacyV2Captured(): CapturedTables {
  const tables = legacyRows(
    'legacy-v2',
    'legacy',
    'challenge',
    'legacy-v2-seed',
    '1',
    4,
  )
  withSimulation(
    tables,
    'legacy-v2',
    'legacy-v2-seed',
    'input:legacy-v2:café-exact',
  )
  return tables
}

export function legacyV2Snapshot(): CampaignSnapshot {
  return mustSnapshot(
    'legacy-v2',
    2,
    legacyV2Export.exportId,
    legacyV2Export.exportedAt,
    legacyV2Captured(),
    4,
  )
}

export function standaloneV2Captured(): CapturedTables {
  const tables = legacyRows(
    'standalone-v2',
    'standalone',
    'challenge',
    'standalone-demo-v2',
    '2',
    2,
  )
  withSimulation(
    tables,
    'standalone-v2',
    'standalone-demo-v2',
    'fingerprint:standalone-v2:😀',
  )
  return tables
}

export function standaloneV2Snapshot(): CampaignSnapshot {
  return mustSnapshot(
    'standalone-v2',
    2,
    standaloneV2Export.exportId,
    standaloneV2Export.exportedAt,
    standaloneV2Captured(),
    2,
  )
}
