import { reportDiagnostic } from './diagnostics'

export const gameClientErrorCodes = [
  'UNAVAILABLE',
  'VALIDATION',
  'INTERNAL',
  'CONFLICT',
  'SCOPE',
] as const

export type GameClientErrorCode = (typeof gameClientErrorCodes)[number]

export type GameClientError = {
  code: GameClientErrorCode
  message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readStructured(value: unknown): GameClientError | null {
  if (!isRecord(value)) return null
  const { code, message } = value
  if (
    typeof code === 'string' &&
    typeof message === 'string' &&
    gameClientErrorCodes.some((item) => item === code)
  ) {
    return { code: code as GameClientErrorCode, message }
  }
  if (typeof message === 'string') {
    try {
      return readStructured(JSON.parse(message))
    } catch {
      return null
    }
  }
  return null
}

export function mapInvokeError(
  error: unknown,
  operation = 'native.invoke',
): GameClientError {
  const direct = readStructured(error)
  if (direct) return direct
  if (typeof error === 'string') {
    const parsed = readStructured(tryParse(error))
    if (parsed) return parsed
  }
  reportDiagnostic(operation, 'unexpected-invoke', error)
  return {
    code: 'INTERNAL',
    message: 'The native shell returned an unexpected error.',
  }
}

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
