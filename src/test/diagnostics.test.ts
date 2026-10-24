import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { getDatabase, deleteDatabaseForTests } from '../data/db'
import { rejectCommand, runCommand } from '../data/transactions/run-command'
import { setDiagnosticSink, type Diagnostic } from '../platform/diagnostics'
import { call } from '../platform/native-commands'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const databaseName = 'diagnostics-test'
let restore: (() => void) | undefined
afterEach(async () => {
  restore?.()
  restore = undefined
  vi.resetAllMocks()
  await deleteDatabaseForTests(databaseName)
})

it('unwraps and reports the original browser cause once before returning ABORTED', async () => {
  const events: Diagnostic[] = []
  restore = setDiagnosticSink((event) => events.push(event))
  const database = getDatabase(databaseName)
  const cause = new Error('private failure details')
  const result = await runCommand(
    database,
    [database.campaigns],
    { kind: 'create' },
    async () => {
      await database.campaigns.clear()
      throw new Dexie.AbortError('aborted', cause)
    },
  )
  expect(result).toEqual({
    ok: false,
    code: 'ABORTED',
    message: 'Command did not finish.',
  })
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    operation: 'command.create:campaigns',
    category: 'unexpected-command',
    cause,
  })
  expect(events[0].correlationId).toBeTruthy()
})

it('preserves expected command failures without diagnostics', async () => {
  const sink = vi.fn()
  restore = setDiagnosticSink(sink)
  const database = getDatabase(databaseName)
  const result = await runCommand(
    database,
    [database.campaigns],
    { kind: 'create' },
    async () => {
      rejectCommand('CONFLICT', 'stale')
    },
  )
  expect(result).toEqual({ ok: false, code: 'CONFLICT', message: 'stale' })
  expect(sink).not.toHaveBeenCalled()
})

it('reports unexpected invoke failures once with the wire operation and original cause', async () => {
  const sink = vi.fn()
  restore = setDiagnosticSink(sink)
  const cause = new Error('private transport details')
  vi.mocked(invoke).mockRejectedValueOnce(cause)
  await expect(call('health')).rejects.toEqual({
    code: 'INTERNAL',
    message: 'The native shell returned an unexpected error.',
  })
  expect(sink).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      operation: 'health',
      category: 'unexpected-invoke',
      cause,
    }),
  )
  const publicError = { code: 'INTERNAL', message: 'Already translated' }
  vi.mocked(invoke).mockRejectedValueOnce(publicError)
  await expect(call('health')).rejects.toEqual(publicError)
  expect(sink).toHaveBeenCalledTimes(1)
})

it('does not let a failing diagnostic sink change the public result', async () => {
  restore = setDiagnosticSink(() => {
    throw new Error('sink unavailable')
  })
  vi.mocked(invoke).mockRejectedValueOnce(new Error('transport'))
  await expect(call('health')).rejects.toMatchObject({ code: 'INTERNAL' })
})
