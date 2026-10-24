import { useCallback, useRef, useState } from 'react'
import type { GameClient } from '../../platform/game-client'
import { mapInvokeError } from '../../platform/errors'
import { staleSave } from '../copy'
import { useNativeRead } from './useNativeRead'
import { Button } from '../../components/ui/Button'

export function NativeTransfers({
  client,
  campaignId,
  revision,
  refresh,
  onChanged,
}: {
  client: GameClient
  campaignId: string
  revision: number
  refresh: number
  onChanged: () => void
}) {
  const requestKey = `${campaignId}:${revision}:${refresh}`
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const submitting = useRef(false)
  const loadBoard = useCallback(
    () => client.transferBoard(campaignId),
    [client, campaignId],
  )
  const loadClock = useCallback(
    () => client.previewTime(campaignId),
    [client, campaignId],
  )
  const { state: board } = useNativeRead(requestKey, loadBoard)
  const { state: clock } = useNativeRead(requestKey, loadClock)
  const shown = board.status === 'success' ? board.data : null
  const cursor = clock.status === 'success' ? clock.data : null
  const shownError =
    error?.key === requestKey
      ? error.message
      : board.status === 'error'
        ? board.error
        : clock.status === 'error'
          ? clock.error
          : ''
  async function submit(id: string, work: () => Promise<unknown>) {
    if (submitting.current || cursor === null) return
    submitting.current = true
    setBusyId(id)
    setError(null)
    try {
      await work()
      onChanged()
    } catch (failure) {
      const mapped = mapInvokeError(failure)
      setError({
        key: requestKey,
        message: mapped.code === 'CONFLICT' ? staleSave : mapped.message,
      })
    } finally {
      submitting.current = false
      setBusyId(null)
    }
  }
  function ids(count: number) {
    return Array.from({ length: count }, () => crypto.randomUUID())
  }
  function stamp() {
    return {
      campaignId,
      expectedRevision: revision,
      sourceDate: cursor?.fromDate ?? '',
      sourceBoundaryKey: cursor?.sourceBoundaryKey ?? null,
      receiptId: crypto.randomUUID(),
      auditId: crypto.randomUUID(),
      actionId: crypto.randomUUID(),
      now: new Date().toISOString(),
    }
  }
  return (
    <section aria-label="Transfer board" className="space-y-4">
      {shown === null && <p>Calculating the transfer market.</p>}
      {shown !== null && shown.incoming.length === 0 && (
        <p>No incoming offers.</p>
      )}
      {shown?.incoming.map((offer) => (
        <article key={offer.offerId} aria-label={offer.playerName}>
          <h3>
            {offer.playerName} — {offer.bidderName}
          </h3>
          <p>
            {offer.feeCents} fee, {offer.wageCents} weekly, {offer.squadTier},{' '}
            {offer.term}, deadline {offer.deadline}
          </p>
          <p>{offer.compulsory}</p>
          <Button
            disabled={busyId !== null}
            onClick={() => {
              void submit(offer.offerId, () =>
                client.respondOffer({
                  ...stamp(),
                  offerId: offer.offerId,
                  decision: 'accept',
                  transferId: crypto.randomUUID(),
                  contractId: crypto.randomUUID(),
                  ledgerIds: ids(offer.ledgerCount),
                  registrationId: offer.needsRegistration
                    ? crypto.randomUUID()
                    : null,
                }),
              )
            }}
          >
            Accept
          </Button>
          <Button
            disabled={busyId !== null || !offer.rejectAllowed}
            onClick={() => {
              void submit(`${offer.offerId}:reject`, () =>
                client.respondOffer({
                  ...stamp(),
                  offerId: offer.offerId,
                  decision: 'reject',
                  transferId: crypto.randomUUID(),
                  contractId: crypto.randomUUID(),
                  ledgerIds: [],
                  registrationId: null,
                }),
              )
            }}
          >
            Reject
          </Button>
        </article>
      ))}
      {shown?.outgoing.map((negotiation) => (
        <article
          key={negotiation.negotiationId}
          aria-label={negotiation.playerName}
        >
          <h3>
            {negotiation.playerName} — {negotiation.sellerName}
          </h3>
          <p>
            {negotiation.status}, deadline {negotiation.deadline}
          </p>
          {negotiation.canWithdraw && (
            <Button
              disabled={busyId !== null}
              onClick={() => {
                void submit(negotiation.negotiationId, () =>
                  client.respondNegotiation({
                    ...stamp(),
                    negotiationId: negotiation.negotiationId,
                    decision: 'withdraw',
                  }),
                )
              }}
            >
              Withdraw
            </Button>
          )}
          {negotiation.canSettle && (
            <Button
              disabled={busyId !== null}
              onClick={() => {
                void submit(`${negotiation.negotiationId}:settle`, () =>
                  client.settleTransfer({
                    ...stamp(),
                    negotiationId: negotiation.negotiationId,
                    transferId: crypto.randomUUID(),
                    contractId: crypto.randomUUID(),
                    ledgerIds: ids(negotiation.ledgerCount),
                    registrationId: negotiation.needsRegistration
                      ? crypto.randomUUID()
                      : null,
                  }),
                )
              }}
            >
              Settle
            </Button>
          )}
        </article>
      ))}
      {shown?.completed.map((transfer) => (
        <p key={transfer.transferId}>
          {transfer.playerName} — {transfer.otherClub} — {transfer.kind} —{' '}
          {transfer.effectiveOn}
        </p>
      ))}
      {shownError && <p role="alert">{shownError}</p>}
    </section>
  )
}
