import { useEffect, useRef, useState } from 'react'
import type { GameClient } from '../../platform/game-client'
import type { TimePreview } from '../../platform/generated/TimePreview'
import type { MatchdayPreview } from '../../platform/generated/MatchdayPreview'
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
  const [matchday, setMatchday] = useState<{
    key: string
    value: MatchdayPreview
  } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const submitting = useRef(false)
  const shown = preview?.key === requestKey ? preview.value : null
  const shownError = error?.key === requestKey ? error.message : ''
  const round = matchday?.key === requestKey ? matchday.value : null
  const matchdayMode = shown?.phase === 'league' || shown?.phase === 'review'
  useEffect(() => {
    let active = true
    client.previewTime(campaignId).then(
      async (result) => {
        if (!active) return
        setPreview({ key: requestKey, value: result })
        if (result.phase === 'league' || result.phase === 'review') {
          try {
            const value = await client.previewMatchday(campaignId)
            if (active) setMatchday({ key: requestKey, value })
          } catch (failure) {
            if (active)
              setError({
                key: requestKey,
                message: mapInvokeError(failure).message,
              })
          }
        }
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
  async function simulateRound() {
    if (submitting.current || !round?.allowed || round.targetDate === null)
      return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const ids = (count: number) =>
        Array.from({ length: count }, () => crypto.randomUUID())
      await client.simMatchday({
        campaignId,
        expectedRevision: round.revision,
        sourceDate: round.fromDate,
        sourceBoundaryKey: round.sourceBoundaryKey,
        targetDate: round.targetDate,
        actionId: crypto.randomUUID(),
        auditId: crypto.randomUUID(),
        receiptId: crypto.randomUUID(),
        now: new Date().toISOString(),
        fixtureIds: ids(round.fixtureCount),
        matchIds: ids(round.matchCount),
        appearanceIds: ids(round.appearanceCount),
      })
      setConfirming(false)
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
        {matchdayMode
          ? round === null
            ? 'Calculating the next matchday.'
            : round.allowed
              ? `${round.nextEvent} on ${round.targetDate}`
              : round.blocker
          : shown === null
            ? 'Loading the next event.'
            : shown.allowed
              ? `${shown.nextEvent} on ${shown.targetDate}`
              : shown.reason}
      </p>
      {shown?.allowed && !matchdayMode && (
        <Button
          disabled={busy}
          onClick={() => {
            void continueCareer()
          }}
        >
          Continue
        </Button>
      )}
      {round?.emergency && <p>Emergency selection</p>}
      {round?.allowed && !confirming && (
        <Button disabled={busy} onClick={() => setConfirming(true)}>
          Sim Matchday
        </Button>
      )}
      {round?.allowed && confirming && (
        <section aria-label="Confirm matchday" className="space-y-3">
          <p>
            Play round {round.round} on {round.targetDate}? All four leagues
            will be simulated and saved.
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void simulateRound()
            }}
          >
            Confirm Sim Matchday
          </Button>
          <Button disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </section>
      )}
      {busy && (
        <p role="status">
          {matchdayMode
            ? 'Calculating and saving the matchday…'
            : 'Advancing the career…'}
        </p>
      )}
      {shownError && (
        <>
          <p role="alert">{shownError}</p>
          <Button onClick={onReload}>Reload saved campaign</Button>
        </>
      )}
    </section>
  )
}
