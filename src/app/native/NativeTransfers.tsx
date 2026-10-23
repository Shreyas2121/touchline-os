import { useEffect, useRef, useState } from 'react'
import type { GameClient } from '../../platform/game-client'
import type { TransferBoard } from '../../platform/generated/TransferBoard'
import type { TimePreview } from '../../platform/generated/TimePreview'
import { mapInvokeError } from '../../platform/errors'
import { staleSave } from '../copy'
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
  const [board, setBoard] = useState<{
    key: string
    value: TransferBoard
  } | null>(null)
  const [clock, setClock] = useState<{
    key: string
    value: TimePreview
  } | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const submitting = useRef(false)
  const shown = board?.key === requestKey ? board.value : null
  const cursor = clock?.key === requestKey ? clock.value : null
  const shownError = error?.key === requestKey ? error.message : ''
  useEffect(() => {
    let active = true
    client.transferBoard(campaignId).then(
      (value) => {
        if (active) setBoard({ key: requestKey, value })
      },
      (failure) => {
        if (active)
          setError({ key: requestKey, message: mapInvokeError(failure).message })
      },
    )
    client.previewTime(campaignId).then(
      (value) => {
        if (active) setClock({ key: requestKey, value })
      },
      (failure) => {
        if (active)
          setError({ key: requestKey, message: mapInvokeError(failure).message })
      },
    )
    return () => {
      active = false
    }
  }, [client, campaignId, requestKey])
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
