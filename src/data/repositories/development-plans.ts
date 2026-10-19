import {
  developmentPlanSchema,
  type DevelopmentPlan,
  type EntityId,
} from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'

export async function getDevelopmentPlan(
  database: TouchlineDatabase,
  campaignId: EntityId,
  playerId: EntityId,
  seasonId: EntityId,
): Promise<DevelopmentPlan | undefined> {
  const row = await database.developmentPlans
    .where('[campaignId+playerId+seasonId]')
    .equals([campaignId, playerId, seasonId])
    .first()
  return row === undefined ? undefined : parseStored(developmentPlanSchema, row)
}
export async function insertDevelopmentPlan(
  database: TouchlineDatabase,
  campaignId: EntityId,
  plan: DevelopmentPlan,
): Promise<void> {
  if (plan.campaignId !== campaignId)
    throw new PersistenceError(
      'SCOPE',
      'Development plan is not in this campaign.',
    )
  await database.developmentPlans.add(plan)
}
export async function updateDevelopmentPlan(
  database: TouchlineDatabase,
  campaignId: EntityId,
  plan: DevelopmentPlan,
): Promise<void> {
  const stored = await database.developmentPlans.get(plan.id)
  if (
    !stored ||
    stored.campaignId !== campaignId ||
    plan.campaignId !== campaignId
  )
    throw new PersistenceError(
      'SCOPE',
      'Development plan is not in this campaign.',
    )
  parseStored(developmentPlanSchema, stored)
  const { id, ...changes } = plan
  await database.developmentPlans.update(id, changes)
}
