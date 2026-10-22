import type { FormEvent } from 'react'
import type { CreationRequest } from '../../platform/generated/CreationRequest'
import type { ManagementAction } from '../../platform/generated/ManagementAction'

export function makeCareerRequest(
  kind: 'career' | 'standalone-demo',
  campaignId: string = crypto.randomUUID(),
): CreationRequest {
  const demo = kind === 'standalone-demo'
  return {
    kind,
    resetRevision: null,
    club: null,
    career: {
      campaignId: demo ? 'native-standalone-demo' : campaignId,
      name: demo ? 'Standalone demo' : 'New career',
      seed: demo ? 'native-standalone-demo-v2' : 'touchline-world',
      startYear: 2026,
      clubKey: 'club:01',
      rulesMode: 'challenge',
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
