import Dexie from 'dexie'
import { reportDiagnostic } from '../../platform/diagnostics'
import { ZodError } from 'zod'
import type { Table } from 'dexie'
import type { CommandResult } from '../../domain/commands/result'
import { nextRevision } from '../../domain/commands/revision'
import type { EntityId } from '../../domain/validation/schemas'
import type { TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign } from '../repositories/campaigns'
import { runInTransaction } from './run-in-transaction'

export type RunCommandOptions =
  | { kind: 'create' }
  | { kind: 'update'; campaignId: EntityId; expectedRevision: number }

class CommandFailure extends Error {
  readonly code: 'NOT_FOUND' | 'CONFLICT'

  constructor(code: 'NOT_FOUND' | 'CONFLICT', message: string) {
    super(message)
    this.name = 'CommandFailure'
    this.code = code
  }
}

export function rejectCommand(
  code: 'NOT_FOUND' | 'CONFLICT',
  message: string,
): never {
  throw new CommandFailure(code, message)
}

function causeOf(error: unknown): unknown {
  if (error instanceof Dexie.AbortError && error.inner !== undefined) {
    return error.inner
  }
  return error
}

function failed(error: unknown, operation: string): CommandResult<never> {
  const cause = causeOf(error)
  if (cause instanceof CommandFailure) {
    return { ok: false, code: cause.code, message: cause.message }
  }
  if (cause instanceof ZodError) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    }
  }
  if (cause instanceof PersistenceError && cause.code === 'SCOPE') {
    return { ok: false, code: 'VALIDATION', message: cause.message }
  }
  if (
    (cause instanceof PersistenceError && cause.code === 'DUPLICATE') ||
    cause instanceof Dexie.ConstraintError
  ) {
    return {
      ok: false,
      code: 'DUPLICATE',
      message: 'A row with this id already exists.',
    }
  }
  reportDiagnostic(operation, 'unexpected-command', cause)
  return { ok: false, code: 'ABORTED', message: 'Command did not finish.' }
}

export async function runCommand<T>(
  database: TouchlineDatabase,
  tables: readonly Table[],
  options: RunCommandOptions,
  body: (revision: number) => Promise<T>,
): Promise<CommandResult<T>> {
  try {
    const outcome = await runInTransaction(database, tables, async () => {
      if (options.kind === 'create') {
        const revision = nextRevision(0)
        return { revision, value: await body(revision) }
      }
      const campaign = await getCampaign(database, options.campaignId)
      if (campaign === undefined) {
        throw new CommandFailure('NOT_FOUND', 'Campaign not found.')
      }
      if (campaign.revision !== options.expectedRevision) {
        throw new CommandFailure('CONFLICT', 'Campaign revision is stale.')
      }
      const revision = nextRevision(campaign.revision)
      return { revision, value: await body(revision) }
    })
    return { ok: true, revision: outcome.revision, value: outcome.value }
  } catch (error) {
    return failed(
      error,
      `command.${options.kind}:${tables.map((table) => table.name).join(',')}`,
    )
  }
}
