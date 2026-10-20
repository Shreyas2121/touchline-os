import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import manifestText from '../../compatibility/manifest.json?raw'
import legacyV1Text from '../../compatibility/snapshots/legacy-v1.json?raw'
import legacyV2Text from '../../compatibility/snapshots/legacy-v2.json?raw'
import standaloneV2Text from '../../compatibility/snapshots/standalone-v2.json?raw'
import determinismText from '../../compatibility/vectors/determinism.json?raw'
import generatorsText from '../../compatibility/vectors/generators.json?raw'
import { TouchlineDatabase } from '../data/db'
import { exportCampaign } from '../data/exports/export-campaign'
import { schemaV1 } from '../data/migrations/v1'
import { buildCompatibilityFiles } from '../domain/migration/bundle'
import {
  applyIndexedDbNormalization,
  numberReason,
  rowLimitReason,
  SNAPSHOT_STORES,
  snapshotByteReason,
  snapshotLimits,
  validateSnapshot,
} from '../domain/migration/snapshot'
import {
  legacyV1Captured,
  legacyV1Export,
  legacyV1Snapshot,
  legacyV2Captured,
  legacyV2Export,
  legacyV2Snapshot,
  standaloneV2Captured,
  standaloneV2Export,
  standaloneV2Snapshot,
} from '../domain/migration/synthetic-snapshots'
import type { CampaignSnapshot } from '../domain/migration/snapshot'

const names: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  for (const name of names) await Dexie.delete(name)
  names.length = 0
})

function databaseName(suffix: string): string {
  const name = `touchline-export-${suffix}`
  names.push(name)
  return name
}

async function insertCaptured(
  database: Dexie,
  captured: Record<string, readonly unknown[] | undefined>,
) {
  await database.transaction('rw', database.tables, async () => {
    for (const [name, rows] of Object.entries(captured)) {
      if (!rows?.length) continue
      await database.table(name).bulkAdd([...rows])
    }
  })
}

async function counts(database: Dexie): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  for (const table of database.tables) result[table.name] = await table.count()
  return result
}

function cloneSnapshot(snapshot: CampaignSnapshot): CampaignSnapshot {
  return structuredClone(snapshot)
}

describe('campaign snapshot contract', () => {
  it('accepts the synthetic legacy and standalone envelopes', () => {
    for (const snapshot of [
      legacyV1Snapshot(),
      legacyV2Snapshot(),
      standaloneV2Snapshot(),
    ]) {
      expect(validateSnapshot(snapshot).ok).toBe(true)
      expect(Object.keys(snapshot.tables)).toEqual([...SNAPSHOT_STORES])
      expect(snapshot.tables.campaigns).toHaveLength(1)
      expect(snapshot.formatVersion).toBe(1)
      expect(snapshot.sourceStorage).toBe('indexeddb')
    }
    const legacy = legacyV1Snapshot()
    expect(legacy.sourceSchemaVersion).toBe(1)
    expect(legacy.tables.campaigns[0]?.mode).toBe('legacy')
    expect(legacy.tables.campaigns[0]?.rulesMode).toBe('sandbox')
    expect(legacy.tables.contracts[0]?.weeklyWageCents).toBeNull()
    expect(legacy.tables.players[0]?.marketValueCents).toBeNull()
    expect(legacy.tables.players[0]?.birthDate).toBeNull()
    expect(legacy.tables.simulationReceipts).toEqual([])
    expect(legacy.tables.importReceipts[0]?.warnings).toEqual([
      'fingerprint:synthetic-kept',
    ])
    const current = legacyV2Snapshot()
    expect(current.sourceSchemaVersion).toBe(2)
    expect(current.tables.campaigns[0]?.rulesMode).toBe('challenge')
    expect(current.tables.simulationReceipts[0]?.inputFingerprint).toBe(
      'input:legacy-v2:café-exact',
    )
    expect(current.tables.playerSimulationStates[0]?.goalkeeping).toBeNull()
    const standalone = standaloneV2Snapshot()
    expect(standalone.tables.campaigns[0]?.mode).toBe('standalone')
    expect(standalone.tables.simulationReceipts[0]?.inputFingerprint).toBe(
      'fingerprint:standalone-v2:😀',
    )
  })

  it('normalizes only missing v1 mode metadata and empty simulation arrays', () => {
    const captured = legacyV1Captured()
    const campaign = captured.campaigns?.[0] as Record<string, unknown>
    expect(campaign).not.toHaveProperty('mode')
    expect(campaign).not.toHaveProperty('rulesMode')
    delete campaign.seed
    captured.simulationStates = [{ id: 'should-not-survive' }]
    const normalized = applyIndexedDbNormalization(1, captured)
    expect(normalized.campaigns[0]).toMatchObject({
      mode: 'legacy',
      rulesMode: 'sandbox',
    })
    expect(normalized.campaigns[0]).not.toHaveProperty('seed')
    expect(normalized.simulationStates).toEqual([])
    const current = applyIndexedDbNormalization(2, legacyV2Captured())
    expect(current.campaigns[0]).toMatchObject({
      mode: 'legacy',
      rulesMode: 'challenge',
    })
    expect(current.simulationReceipts).toHaveLength(1)
  })

  it('rejects malformed, unsafe, and inconsistent snapshots', () => {
    const base = legacyV2Snapshot()
    const sqlite = cloneSnapshot(base)
    sqlite.sourceStorage = 'sqlite'
    sqlite.sourceSchemaVersion = 1
    expect(validateSnapshot(sqlite).ok).toBe(true)
    sqlite.sourceSchemaVersion = 2
    expect(validateSnapshot(sqlite).ok).toBe(false)
    const future = cloneSnapshot(base)
    future.sourceSchemaVersion = 3
    expect(validateSnapshot(future).ok).toBe(false)

    const missing = cloneSnapshot(base) as unknown as {
      tables: Record<string, unknown>
    }
    delete missing.tables.offers
    expect(validateSnapshot(missing).ok).toBe(false)
    const extra = cloneSnapshot(base) as unknown as {
      tables: Record<string, unknown[]>
    }
    extra.tables.future = []
    const extraResult = validateSnapshot(extra)
    expect(extraResult.ok).toBe(false)
    if (!extraResult.ok) expect(extraResult.message).toMatch(/future/)
    const none = cloneSnapshot(base)
    none.tables.campaigns = []
    const noneResult = validateSnapshot(none)
    expect(noneResult.ok).toBe(false)
    if (!noneResult.ok) expect(noneResult.message).toMatch(/exactly one/)
    const two = cloneSnapshot(base)
    const firstCampaign = two.tables.campaigns[0]
    if (!firstCampaign) throw new Error('missing campaign')
    two.tables.campaigns.push({
      ...firstCampaign,
      id: 'legacy-v2-copy' as typeof firstCampaign.id,
    })
    const twoResult = validateSnapshot(two)
    expect(twoResult.ok).toBe(false)
    if (!twoResult.ok) expect(twoResult.message).toMatch(/2 campaigns/)

    const unsafe = cloneSnapshot(base)
    const entry = unsafe.tables.ledgerEntries[0]
    if (!entry) throw new Error('missing ledger entry')
    entry.amountCents = (Number.MAX_SAFE_INTEGER +
      1) as typeof entry.amountCents
    const unsafeResult = validateSnapshot(unsafe)
    expect(unsafeResult.ok).toBe(false)
    if (!unsafeResult.ok) expect(unsafeResult.message).toMatch(/safe integer/)
    expect(numberReason(Number.MAX_SAFE_INTEGER, 'amount')).toBeNull()
    expect(numberReason(Number.MAX_SAFE_INTEGER + 1, 'amount')).toMatch(
      /safe integer/,
    )
    expect(snapshotByteReason(snapshotLimits.maxUtf8Bytes)).toBeNull()
    expect(snapshotByteReason(snapshotLimits.maxUtf8Bytes + 1)).toMatch(/limit/)

    const broken = cloneSnapshot(base)
    const player = broken.tables.players[0]
    if (!player) throw new Error('missing player')
    player.clubId = 'missing-club' as typeof player.clubId
    const brokenResult = validateSnapshot(broken)
    expect(brokenResult.ok).toBe(false)
    if (!brokenResult.ok) expect(brokenResult.message).toMatch(/missing-club/)

    const long = cloneSnapshot(base)
    const audit = long.tables.auditEvents[0]
    if (!audit) throw new Error('missing audit')
    audit.summary = 'a'.repeat(snapshotLimits.maxStringLength)
    const bounded = validateSnapshot(long)
    expect(bounded.ok).toBe(false)
    if (!bounded.ok) expect(bounded.message).not.toMatch(/the limit is 20000/)
    audit.summary = 'a'.repeat(snapshotLimits.maxStringLength + 1)
    const unbounded = validateSnapshot(long)
    expect(unbounded.ok).toBe(false)
    if (!unbounded.ok) expect(unbounded.message).toMatch(/20000/)

    const seasons = cloneSnapshot(legacyV1Snapshot())
    const season = seasons.tables.seasons[0]
    if (!season) throw new Error('missing season')
    while (seasons.tables.seasons.length < snapshotLimits.maxRows.seasons) {
      const ordinal = seasons.tables.seasons.length + 1
      seasons.tables.seasons.push({
        ...season,
        id: `legacy-v1-season-${ordinal}` as typeof season.id,
        ordinal,
        label: `S${ordinal}`,
      })
    }
    expect(validateSnapshot(seasons).ok).toBe(true)
    seasons.tables.seasons.push({
      ...season,
      id: 'legacy-v1-season-over' as typeof season.id,
      ordinal: snapshotLimits.maxRows.seasons + 1,
      label: 'over',
    })
    const overSeasons = validateSnapshot(seasons)
    expect(overSeasons.ok).toBe(false)
    if (!overSeasons.ok) expect(overSeasons.message).toMatch(/seasons has 65/)
    expect(rowLimitReason('players', snapshotLimits.maxRows.players)).toBeNull()
    expect(
      rowLimitReason('players', snapshotLimits.maxRows.players + 1),
    ).toMatch(/8001/)
  })
})

describe('readonly campaign export', () => {
  it('exports a v1 database without upgrading or inventing fields', async () => {
    const name = databaseName('v1')
    const database = new Dexie(name)
    database.version(1).stores(schemaV1)
    await database.open()
    await insertCaptured(database, legacyV1Captured())
    const before = await counts(database)
    const stored = await database.table('campaigns').get('legacy-v1')
    expect(stored).not.toHaveProperty('mode')
    const result = await exportCampaign(database, 'legacy-v1', legacyV1Export)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot).toEqual(legacyV1Snapshot())
    expect(await counts(database)).toEqual(before)
    expect(
      await database.table('campaigns').get('legacy-v1'),
    ).not.toHaveProperty('mode')
    expect(database.verno).toBe(1)
    database.close()
  })

  it('keeps one campaign revision and ignores other campaigns and global receipts', async () => {
    const name = databaseName('v2')
    const database = new TouchlineDatabase(name)
    await database.open()
    const legacyRows = legacyV2Captured()
    const standaloneRows = standaloneV2Captured()
    const merged: Record<string, unknown[]> = {}
    for (const captured of [legacyRows, standaloneRows]) {
      for (const [name, rows] of Object.entries(captured)) {
        merged[name] = [...(merged[name] ?? []), ...(rows ?? [])]
      }
    }
    await insertCaptured(database, merged)
    await database.importReceipts.add({
      id: 'global-receipt',
      campaignId: null,
      sourceName: 'Global import',
      sourceType: 'json',
      importedAt: '2026-07-01T00:00:00.000Z',
      rowCounts: { players: 9 },
      mappingVersion: 'global-1',
      warnings: ['not-this-campaign'],
      provenance: 'imported',
    } as never)
    const before = await counts(database)
    const calls: string[] = []
    const original = database.transaction.bind(database)
    vi.spyOn(database, 'transaction').mockImplementation(((
      mode: 'r' | 'rw',
      tables: never,
      scope: never,
    ) => {
      calls.push(mode)
      return original(mode, tables, scope)
    }) as typeof database.transaction)
    const result = await exportCampaign(database, 'legacy-v2', legacyV2Export)
    expect(calls).toEqual(['r'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot).toEqual(legacyV2Snapshot())
    expect(result.json).toContain('input:legacy-v2:café-exact')
    expect(
      result.snapshot.tables.players.map((player) => player.id),
    ).not.toContain('standalone-v2-player')
    expect(
      result.snapshot.tables.importReceipts.map((receipt) => receipt.id),
    ).toEqual(['legacy-v2-import'])
    expect(await counts(database)).toEqual(before)
    expect((await database.campaigns.get('legacy-v2' as never))?.revision).toBe(
      4,
    )
    database.close()
  })

  it('sees a competing write as one whole revision', async () => {
    const name = databaseName('race')
    const reader = new TouchlineDatabase(name)
    const writer = new TouchlineDatabase(name)
    await reader.open()
    await writer.open()
    await insertCaptured(reader, legacyV2Captured())
    let release: () => void = () => {}
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    let markReady: () => void = () => {}
    const ready = new Promise<void>((resolve) => {
      markReady = resolve
    })
    const writing = writer.transaction(
      'rw',
      [writer.campaigns, writer.players],
      async () => {
        await writer.campaigns.update('legacy-v2' as never, { revision: 9 })
        markReady()
        await Dexie.waitFor(hold)
        await writer.players.add({
          ...(legacyV2Captured().players?.[0] as Record<string, unknown>),
          id: 'legacy-v2-player-2',
          name: 'Second Cole',
        } as never)
      },
    )
    await ready
    const exporting = exportCampaign(reader, 'legacy-v2', legacyV2Export)
    release()
    const [result] = await Promise.all([exporting, writing])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.campaignRevision).toBe(9)
    expect(result.snapshot.tables.campaigns[0]?.revision).toBe(9)
    expect(
      result.snapshot.tables.players.map((player) => player.id).sort(),
    ).toEqual(['legacy-v2-player', 'legacy-v2-player-2'])
    reader.close()
    writer.close()
  })

  it('leaves every source row in place when export is cancelled or invalid', async () => {
    const name = databaseName('abort')
    const database = new TouchlineDatabase(name)
    await database.open()
    await insertCaptured(database, legacyV2Captured())
    await database.players.add({
      ...(legacyV2Captured().players?.[0] as Record<string, unknown>),
      id: 'legacy-v2-bad',
      positionGroup: 'NOPE',
      positions: ['NOPE'],
    } as never)
    const before = await counts(database)
    const controller = new AbortController()
    const cancelled = await exportCampaign(database, 'legacy-v2', {
      ...legacyV2Export,
      signal: controller.signal,
      onProgress: (stage) => {
        if (stage === 'validate') controller.abort()
      },
    })
    expect(cancelled).toMatchObject({ ok: false, code: 'CANCELLED' })
    const invalid = await exportCampaign(database, 'legacy-v2', legacyV2Export)
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.code).toBe('INVALID')
    const already = new AbortController()
    already.abort()
    const skipped = await exportCampaign(database, 'legacy-v2', {
      ...standaloneV2Export,
      signal: already.signal,
    })
    expect(skipped).toMatchObject({ ok: false, code: 'CANCELLED' })
    expect(await counts(database)).toEqual(before)
    expect((await database.campaigns.get('legacy-v2' as never))?.revision).toBe(
      4,
    )
    database.close()
  })
})

describe('committed compatibility fixtures', () => {
  it('reproduces the TypeScript oracle byte for byte', async () => {
    const manifest = JSON.parse(manifestText) as {
      sourceCheckpoint: string
      evidenceCommit: string
      capturedAtHead: string
      personalSaves: boolean
      oracle: string
      files: Record<string, { sha256: string }>
    }
    expect(manifest.sourceCheckpoint).toBe(
      'df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3',
    )
    expect(manifest.evidenceCommit).toBe(
      '7b3c6a03af0999d61c722e43835ebcbd2998f4c5',
    )
    expect(manifest.personalSaves).toBe(false)
    expect(manifest.oracle).toMatch(/TypeScript/)
    expect(manifest.files['vectors/generators.json']?.sha256).toEqual(
      expect.any(String),
    )
    const files = await buildCompatibilityFiles({
      sourceCheckpoint: manifest.sourceCheckpoint,
      evidenceCommit: manifest.evidenceCommit,
      capturedAtHead: manifest.capturedAtHead,
    })
    expect(files['snapshots/legacy-v1.json']).toBe(legacyV1Text)
    expect(files['snapshots/legacy-v2.json']).toBe(legacyV2Text)
    expect(files['snapshots/standalone-v2.json']).toBe(standaloneV2Text)
    expect(files['vectors/determinism.json']).toBe(determinismText)
    expect(files['vectors/generators.json']).toBe(generatorsText)
    expect(files['manifest.json']).toBe(manifestText)
  }, 120_000)
})
