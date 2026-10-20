import Dexie, { type Table } from 'dexie'
import {
  applyIndexedDbNormalization,
  INDEXEDDB_V1_STORES,
  serializeSnapshot,
  SNAPSHOT_STORES,
  validateSnapshot,
  type CampaignSnapshot,
  type SnapshotStoreName,
} from '../../domain/migration/snapshot'

export type ExportStage = 'read' | 'validate' | 'ready'

export type ExportCampaignOptions = {
  exportId: string
  exportedAt: string
  signal?: AbortSignal
  onProgress?: (stage: ExportStage) => void
}

export type ExportCampaignResult =
  | { ok: true; snapshot: CampaignSnapshot; json: string }
  | {
      ok: false
      code: 'MISSING' | 'UNSUPPORTED' | 'INVALID' | 'CANCELLED' | 'FAILED'
      message: string
    }

class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled.')
    this.name = 'ExportCancelled'
  }
}

function cancelled(): ExportCampaignResult {
  return { ok: false, code: 'CANCELLED', message: 'Export cancelled.' }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function storesForVersion(verno: number): readonly SnapshotStoreName[] | null {
  if (verno === 1) return INDEXEDDB_V1_STORES
  if (verno === 2) return SNAPSHOT_STORES
  return null
}

/**
 * Read one campaign in a single readonly transaction.
 * Validation and JSON serialization happen after that transaction commits,
 * so a failure cannot append an audit, bump the revision, or write a row.
 */
export async function exportCampaign(
  database: Dexie,
  campaignId: string,
  options: ExportCampaignOptions,
): Promise<ExportCampaignResult> {
  try {
    if (options.signal?.aborted) return cancelled()
    if (database.verno === 0) await database.open()
    if (options.signal?.aborted) return cancelled()
    const storeNames = storesForVersion(database.verno)
    if (!storeNames) {
      return {
        ok: false,
        code: 'UNSUPPORTED',
        message: `Opened database version ${database.verno} is not a supported IndexedDB source. Supported versions are 1 and 2.`,
      }
    }
    options.onProgress?.('read')
    if (options.signal?.aborted) return cancelled()
    const tables = storeNames.map((name) => database.table(name))
    const captured = await database.transaction('r', tables, async () => {
      const rows = {} as Record<SnapshotStoreName, unknown[]>
      for (const name of storeNames) {
        if (options.signal?.aborted) throw new ExportCancelled()
        rows[name] = await readStore(database.table(name), name, campaignId)
      }
      return rows
    })
    const snapshotRows = structuredClone(captured)
    options.onProgress?.('validate')
    if (options.signal?.aborted) return cancelled()
    const campaign = snapshotRows.campaigns[0]
    if (!campaign) {
      return {
        ok: false,
        code: 'MISSING',
        message: 'That campaign is not saved in the opened database.',
      }
    }
    const campaignRevision =
      isPlainObject(campaign) && typeof campaign.revision === 'number'
        ? campaign.revision
        : Number.NaN
    const validated = validateSnapshot({
      format: 'touchline-campaign',
      formatVersion: 1,
      sourceStorage: 'indexeddb',
      sourceSchemaVersion: database.verno,
      exportId: options.exportId,
      exportedAt: options.exportedAt,
      campaignRevision,
      tables: applyIndexedDbNormalization(database.verno, snapshotRows),
    })
    if (!validated.ok) {
      return { ok: false, code: 'INVALID', message: validated.message }
    }
    const json = serializeSnapshot(validated.value)
    options.onProgress?.('ready')
    if (options.signal?.aborted) return cancelled()
    return { ok: true, snapshot: validated.value, json }
  } catch (error) {
    if (error instanceof ExportCancelled || options.signal?.aborted) {
      return cancelled()
    }
    return {
      ok: false,
      code: 'FAILED',
      message:
        error instanceof Error ? error.message : 'The save could not be read.',
    }
  }
}

async function readStore(
  table: Table,
  name: SnapshotStoreName,
  campaignId: string,
): Promise<unknown[]> {
  if (name === 'campaigns') {
    const campaign: unknown = await table.get(campaignId)
    return campaign === undefined ? [] : [campaign]
  }
  return table.where('campaignId').equals(campaignId).toArray()
}
