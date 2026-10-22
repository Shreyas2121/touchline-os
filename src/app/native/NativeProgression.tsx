import { useEffect, useRef, useState } from 'react'
import type { GameClient } from '../../platform/game-client'
import type { TimePreview } from '../../platform/generated/TimePreview'
import { mapInvokeError } from '../../platform/errors'
import { staleSave } from '../copy'
import { Button } from '../../components/ui/Button'

export function NativeProgression({
  client,
  campaignId,
  revision,
  refresh,
  onAdvanced,
  onReload,
}: {
  client: GameClient
  campaignId: string
  revision: number
  refresh: number
  onAdvanced: () => void
  onReload: () => void
}) {
  const requestKey = `${campaignId}:${revision}:${refresh}`
  const [preview, setPreview] = useState<{
    key: string
    value: TimePreview
  } | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const shown = preview?.key === requestKey ? preview.value : null
  const shownError = error?.key === requestKey ? error.message : ''
  useEffect(() => {
    let active = true
    client.previewTime(campaignId).then(
      (result) => {
        if (active) setPreview({ key: requestKey, value: result })
      },
      (failure) => {
        if (active) {
          setError({
            key: requestKey,
            message: mapInvokeError(failure).message,
          })
        }
      },
    )
    return () => {
      active = false
    }
  }, [client, campaignId, requestKey])
  async function continueCareer() {
    if (
      submitting.current ||
      !shown?.allowed ||
      shown.targetBoundaryKey === null
    ) {
      return
    }
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      await client.advanceTime({
        campaignId,
        expectedRevision: revision,
        sourceDate: shown.fromDate,
        sourceBoundaryKey: shown.sourceBoundaryKey,
        targetBoundaryKey: shown.targetBoundaryKey,
        actionId: crypto.randomUUID(),
        auditId: crypto.randomUUID(),
        receiptId: crypto.randomUUID(),
        now: new Date().toISOString(),
      })
      onAdvanced()
    } catch (failure) {
      const mapped = mapInvokeError(failure)
      setError({
        key: requestKey,
        message: mapped.code === 'CONFLICT' ? staleSave : mapped.message,
      })
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <section aria-label="Game calendar" className="space-y-3">
      <h2>Game date</h2>
      <p>{shown?.fromDate ?? 'Loading the game date.'}</p>
      <h2>Next event</h2>
      <p>
        {shown === null
          ? 'Loading the next event.'
          : shown.allowed
            ? `${shown.nextEvent} on ${shown.targetDate}`
            : shown.reason}
      </p>
      {shown?.allowed && (
        <Button
          disabled={busy}
          onClick={() => {
            void continueCareer()
          }}
        >
          Continue
        </Button>
      )}
      {busy && <p role="status">Advancing the career…</p>}
      {shownError && (
        <>
          <p role="alert">{shownError}</p>
          <Button onClick={onReload}>Reload saved campaign</Button>
        </>
      )}
    </section>
  )
}
