import { z } from 'zod'
import type { CommandResult } from '../../domain/commands/result'
import { timestampUtcSchema } from '../../domain/models/dates'
import {
  onlyPlayableDemoReset,
  standaloneDemoCareer,
  STANDALONE_DEMO_ID,
} from '../../domain/simulation/career'
import { entityIdSchema, type Campaign } from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { getCampaign } from '../repositories/campaigns'
import { deleteCampaign } from './delete-campaign'
import {
  startStandaloneCampaign,
  type CareerProgress,
} from './start-standalone-campaign'

const inputSchema = z.strictObject({
  campaignId: entityIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  now: timestampUtcSchema,
  auditEventId: entityIdSchema,
  actionId: entityIdSchema,
})

export async function resetStandaloneDemo(
  database: TouchlineDatabase,
  input: unknown,
  onProgress?: (progress: CareerProgress) => void,
): Promise<CommandResult<Campaign>> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    }
  const command = parsed.data
  if (command.campaignId !== STANDALONE_DEMO_ID)
    return { ok: false, code: 'VALIDATION', message: onlyPlayableDemoReset }
  if (await getCampaign(database, STANDALONE_DEMO_ID)) {
    const deleted = await deleteCampaign(database, command)
    if (!deleted.ok) return deleted
  }
  return startStandaloneCampaign(
    database,
    { ...standaloneDemoCareer, now: command.now },
    onProgress,
  )
}
