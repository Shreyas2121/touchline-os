export const commandFailureCodes = [
  'VALIDATION',
  'CONFLICT',
  'NOT_FOUND',
  'DUPLICATE',
  'ABORTED',
] as const

export type CommandFailureCode = (typeof commandFailureCodes)[number]

export type CommandResult<T> =
  | { ok: true; revision: number; value: T }
  | { ok: false; code: CommandFailureCode; message: string }
