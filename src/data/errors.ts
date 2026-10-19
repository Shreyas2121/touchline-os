export const persistenceErrorCodes = [
  'CORRUPT',
  'UNAVAILABLE',
  'SCOPE',
  'DUPLICATE',
] as const

export type PersistenceErrorCode = (typeof persistenceErrorCodes)[number]

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode

  constructor(code: PersistenceErrorCode, message: string) {
    super(message)
    this.name = 'PersistenceError'
    this.code = code
  }
}
