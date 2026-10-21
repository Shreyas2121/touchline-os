import type { FormEvent } from 'react'
import type { CreationRequest } from '../../platform/generated/CreationRequest'
import type { CreationKind } from '../../platform/generated/CreationKind'
import type { ManagementAction } from '../../platform/generated/ManagementAction'

export function makeCareerRequest(
  kind: CreationKind,
  campaignId: string = crypto.randomUUID(),
): CreationRequest {
  const legacy = kind === 'legacy' || kind === 'legacy-demo'
  const demo = kind === 'legacy-demo' || kind === 'standalone-demo'
  return {
    kind,
    resetRevision: null,
    club: null,
    career: {
      campaignId: demo
        ? `native-${legacy ? 'legacy' : 'standalone'}-demo`
        : campaignId,
      name: demo ? `${legacy ? 'Legacy' : 'Standalone'} demo` : 'New career',
      seed: demo
        ? `native-${legacy ? 'legacy-demo-v1' : 'standalone-demo-v2'}`
        : 'touchline-world',
      startYear: 2026,
      clubKey: 'club:01',
      rulesMode: legacy ? 'sandbox' : 'challenge',
      preset: 'balanced',
      now: new Date().toISOString(),
      seasonId: crypto.randomUUID(),
      clockId: crypto.randomUUID(),
      constitutionId: crypto.randomUUID(),
      allocationId: crypto.randomUUID(),
      receiptId: crypto.randomUUID(),
      auditEventId: crypto.randomUUID(),
      actionId: crypto.randomUUID(),
    },
  }
}
export type SendAction = (action: ManagementAction) => Promise<void>
export function submit(
  event: FormEvent<HTMLFormElement>,
  action: (data: FormData) => ManagementAction,
  send: SendAction,
) {
  event.preventDefault()
  void send(action(new FormData(event.currentTarget)))
}
