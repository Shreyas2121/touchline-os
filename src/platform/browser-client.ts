import type { GameClientError } from './errors'
import {
  unavailableMethods,
  unavailableNativeReads,
  type GameClient,
} from './game-client'
import type { HealthReport } from './generated/HealthReport'
import type { ClientOperation } from './operations'

// The frozen browser entry remains `pnpm dev` / `pnpm build`. The welcome page
// exporter reads IndexedDB directly. This client never opens that database.
export function createBrowserClient(): GameClient {
  return {
    async health(): Promise<HealthReport> {
      return {
        product: 'Touchline OS',
        identifier: 'com.touchline.os',
        profile: 'browser',
        storage: 'unavailable',
        features: 'unavailable',
        dexieFallback: false,
      }
    },
    ...unavailableMethods(rejectInBrowser),
    ...unavailableNativeReads(),
  }
}

function rejectInBrowser(operation: ClientOperation): Promise<never> {
  const error: GameClientError = {
    code: 'UNAVAILABLE',
    message: `${operation} is not available in the browser shell.`,
  }
  return Promise.reject(error)
}
