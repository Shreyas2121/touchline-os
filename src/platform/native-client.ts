import { invoke } from '@tauri-apps/api/core'
import { mapInvokeError } from './errors'
import { unavailableMethods, type GameClient } from './game-client'
import type { HealthReport } from './generated/HealthReport'
import type { ClientOperation } from './operations'

async function rejectOperation(operation: ClientOperation): Promise<never> {
  try {
    await invoke('client_operation', { operation })
  } catch (error) {
    throw mapInvokeError(error)
  }
  throw mapInvokeError(new Error('The native shell returned no error.'))
}

export function createNativeClient(): GameClient {
  return {
    async health(): Promise<HealthReport> {
      try {
        return await invoke<HealthReport>('health')
      } catch (error) {
        throw mapInvokeError(error)
      }
    },
    ...unavailableMethods(rejectOperation),
  }
}
