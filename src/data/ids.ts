import { entityIdSchema, type EntityId } from '../domain/validation/schemas'

export function createEntityId(): EntityId {
  return entityIdSchema.parse(crypto.randomUUID())
}
