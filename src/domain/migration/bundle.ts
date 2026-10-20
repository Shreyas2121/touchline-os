import { sha256Utf8 } from './digest'
import {
  legacyV1Snapshot,
  legacyV2Snapshot,
  standaloneV2Snapshot,
} from './synthetic-snapshots'
import {
  serializeSnapshot,
  SNAPSHOT_STORES,
  snapshotLimits,
  utf8ByteLength,
} from './snapshot'
import { buildDeterminismVector, buildGeneratorVector } from './vectors'

export type CompatibilityCheckpoint = {
  sourceCheckpoint: string
  evidenceCommit: string
  capturedAtHead: string
}

const fileOrder = [
  'snapshots/legacy-v1.json',
  'snapshots/legacy-v2.json',
  'snapshots/standalone-v2.json',
  'vectors/determinism.json',
  'vectors/generators.json',
] as const

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function buildCompatibilityFiles(
  checkpoint: CompatibilityCheckpoint,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {
    'snapshots/legacy-v1.json': serializeSnapshot(legacyV1Snapshot()),
    'snapshots/legacy-v2.json': serializeSnapshot(legacyV2Snapshot()),
    'snapshots/standalone-v2.json': serializeSnapshot(standaloneV2Snapshot()),
    'vectors/determinism.json': pretty(buildDeterminismVector()),
    'vectors/generators.json': pretty(await buildGeneratorVector()),
  }
  const digests: Record<string, { sha256: string; utf8Bytes: number }> = {}
  for (const path of fileOrder) {
    const text = files[path]
    if (text === undefined)
      throw new Error(`Missing compatibility file ${path}.`)
    digests[path] = {
      sha256: await sha256Utf8(text),
      utf8Bytes: utf8ByteLength(text),
    }
  }
  files['manifest.json'] = pretty({
    format: 'touchline-compatibility',
    formatVersion: 1,
    sourceCheckpoint: checkpoint.sourceCheckpoint,
    evidenceCommit: checkpoint.evidenceCommit,
    capturedAtHead: checkpoint.capturedAtHead,
    personalSaves: false,
    oracle:
      'TypeScript domain modules captured from this tree. Independent of any later Rust port.',
    normalization: {
      indexeddbV1:
        'Missing campaign.mode becomes legacy. Missing campaign.rulesMode becomes sandbox. Simulation store arrays are empty. No wages, contracts, matches, seeds, or other fields are invented.',
      indexeddbV2:
        'Rows are exported as stored. Modes, nulls, ids, money, fingerprints, and audits are not rewritten.',
    },
    digest: {
      algorithm: 'SHA-256',
      encoding: 'UTF-8',
      canonicalJson:
        'JSON.stringify(value) with generator insertion order and no extra whitespace. The manifest hashes are of the exact fixture file bytes, including pretty-printed JSON and the trailing newline.',
    },
    limits: snapshotLimits,
    stores: SNAPSHOT_STORES,
    files: digests,
  })
  return files
}
