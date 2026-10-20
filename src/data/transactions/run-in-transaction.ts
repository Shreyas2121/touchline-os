import { type Table } from 'dexie'
import type { TouchlineDatabase } from '../db'

export function runInTransaction<T>(
  database: TouchlineDatabase,
  tables: readonly Table[],
  body: () => Promise<T>,
): Promise<T> {
  // Preserve the async callback so Dexie tracks awaits and nested transactions.
  return database.transaction('rw', tables, body)
}
