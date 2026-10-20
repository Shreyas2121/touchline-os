import type { HealthReport } from './generated/HealthReport'
import {
  clientOperations,
  operationMethod,
  type ClientMethod,
  type ClientOperation,
} from './operations'

type ClientCalls = {
  [Method in ClientMethod]: () => Promise<never>
}

export type GameClient = ClientCalls & {
  health(): Promise<HealthReport>
}

export function unavailableMethods(
  reject: (operation: ClientOperation) => Promise<never>,
): ClientCalls {
  const methods = {} as Record<ClientMethod, () => Promise<never>>
  for (const operation of clientOperations) {
    methods[operationMethod(operation)] = () => reject(operation)
  }
  return methods
}
