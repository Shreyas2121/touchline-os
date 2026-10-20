export const clientOperations = [
  'read-campaign',
  'read-seasons',
  'read-leagues',
  'read-clubs',
  'read-players',
  'read-player',
  'read-contracts',
  'read-constitution',
  'read-ledger',
  'read-transfers',
  'read-offers',
  'read-lineups',
  'read-registrations',
  'read-matches',
  'read-appearances',
  'read-shortlist',
  'read-scouting',
  'read-development',
  'read-audit',
  'read-import-receipts',
  'read-simulation',
  'preview-contract',
  'preview-constitution',
  'preview-ledger',
  'preview-transfer',
  'preview-offer',
  'preview-lineup',
  'preview-registration',
  'preview-match',
  'write-start-standalone-campaign',
  'write-create-campaign',
  'write-rename-campaign',
  'write-set-campaign-archived',
  'write-delete-campaign',
  'write-select-managed-club',
  'write-seed-demo',
  'write-reset-demo',
  'write-reset-standalone-demo',
  'write-add-player',
  'write-update-player',
  'write-save-contract',
  'write-save-constitution',
  'write-post-ledger-entry',
  'write-reverse-ledger-entry',
  'write-record-transfer',
  'write-record-offer',
  'write-accept-offer',
  'write-reject-offer',
  'write-record-match',
  'write-save-lineup',
  'write-delete-lineup',
  'write-save-registration',
  'write-save-shortlist-item',
  'write-close-shortlist-item',
  'write-save-development-note',
  'migrate-export-source',
  'migrate-validate-snapshot',
  'migrate-import-snapshot',
  'clock-read',
  'clock-advance',
] as const

export type ClientOperation = (typeof clientOperations)[number]

type Camel<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<Camel<Tail>>}`
  : S

export type ClientMethod = Camel<ClientOperation>

export function operationMethod(operation: ClientOperation): ClientMethod {
  return operation.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  ) as ClientMethod
}
