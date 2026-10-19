import Dexie from 'dexie'
import {
  auditEventSchema,
  type AuditEvent,
  type EntityId,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'

export async function listAuditEvents(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<AuditEvent[]> {
  const rows = await database.auditEvents
    .where('[campaignId+createdAt]')
    .between([campaignId, Dexie.minKey], [campaignId, Dexie.maxKey])
    .toArray()
  return rows
    .map((row) => parseStored(auditEventSchema, row))
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
      return a.id === b.id ? 0 : a.id < b.id ? 1 : -1
    })
}
