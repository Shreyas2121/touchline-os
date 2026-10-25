import { useCallback, useRef, useState } from 'react'
import type { GameClient } from '../../platform/game-client'
import { mapInvokeError } from '../../platform/errors'
import { staleSave } from '../copy'
import { useNativeRead } from './useNativeRead'
import { Button } from '../../components/ui/Button'
import { useNavigate } from 'react-router'
import { NativeDevelopment } from './NativeLifecycle'

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
  const navigate = useNavigate()
  const [developmentOpen, setDevelopmentOpen] = useState(false)
  const requestKey = `${campaignId}:${revision}:${refresh}`
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  )
  const [confirming, setConfirming] = useState(false)
  const [busyKind, setBusyKind] = useState<
    'market' | 'advance' | 'match' | null
  >(null)
  const submitting = useRef(false)
  const loadTime = useCallback(
    () => client.previewTime(campaignId),
    [client, campaignId],
  )
  const loadMarket = useCallback(
    () => client.previewMarket(campaignId),
    [client, campaignId],
  )
  const loadMatchday = useCallback(
    () => client.previewMatchday(campaignId),
    [client, campaignId],
  )
  const { state: preview } = useNativeRead(requestKey, loadTime)
  const { state: market } = useNativeRead(requestKey, loadMarket)
  const shown = preview.status === 'success' ? preview.data : null
  const { state: matchday } = useNativeRead(
    requestKey,
    shown?.phase === 'league' || shown?.phase === 'review'
      ? loadMatchday
      : null,
  )
  const round = matchday.status === 'success' ? matchday.data : null
  const marketShown = market.status === 'success' ? market.data : null
  const shownError =
    error?.key === requestKey
      ? error.message
      : preview.status === 'error'
        ? preview.error
        : market.status === 'error'
          ? market.error
          : matchday.status === 'error'
            ? matchday.error
            : ''
  const matchdayMode = shown?.phase === 'league' || shown?.phase === 'review'
  const runMarket = marketShown?.action === 'run' && marketShown.allowed
  const closeWindow = marketShown?.action === 'close' && marketShown.allowed
  const holdForOffer =
    (marketShown?.action === 'close' && !marketShown.allowed) ||
    shown?.reason === 'Accept the qualifying offer before the window can close.'
  const marketFirst = runMarket || closeWindow || holdForOffer
  const developmentDue =
    shown?.reason === 'Development is applied after the halfway matchday.'
  const reviewMode = shown?.phase === 'review'
  async function simulateRound() {
    if (
      submitting.current ||
      marketFirst ||
      !round?.allowed ||
      round.targetDate === null
    )
      return
    submitting.current = true
    setBusyKind('match')
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
      setBusyKind(null)
    }
  }
  async function continueCareer() {
    if (
      submitting.current ||
      marketFirst ||
      !shown?.allowed ||
      shown.targetBoundaryKey === null
    ) {
      return
    }
    submitting.current = true
    setBusyKind('advance')
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
      setBusyKind(null)
    }
  }
  async function confirmMarket(action: 'run' | 'close') {
    if (submitting.current || marketShown === null || !marketShown.allowed)
      return
    submitting.current = true
    setBusyKind('market')
    setError(null)
    const ids = (count: number) =>
      Array.from({ length: count }, () => crypto.randomUUID())
    const shared = {
      campaignId,
      expectedRevision: marketShown.revision,
      sourceDate: marketShown.fromDate,
      sourceBoundaryKey: marketShown.sourceBoundaryKey,
      actionId: crypto.randomUUID(),
      auditId: crypto.randomUUID(),
      receiptId: crypto.randomUUID(),
      now: new Date().toISOString(),
    }
    try {
      if (action === 'run') {
        await client.runMarket({
          ...shared,
          negotiationIds: ids(marketShown.negotiationCount),
          offerIds: ids(marketShown.offerCount),
          transferIds: ids(marketShown.transferCount),
          contractIds: ids(marketShown.contractCount),
          ledgerIds: ids(marketShown.ledgerCount),
          registrationIds: ids(marketShown.registrationCount),
        })
      } else {
        await client.closeWindow(shared)
      }
      onAdvanced()
    } catch (failure) {
      const mapped = mapInvokeError(failure)
      setError({
        key: requestKey,
        message: mapped.code === 'CONFLICT' ? staleSave : mapped.message,
      })
    } finally {
      submitting.current = false
      setBusyKind(null)
    }
  }
  const nextEvent =
    developmentDue || reviewMode
      ? (shown?.reason ?? 'Review the completed season.')
      : marketShown?.reason &&
          (marketShown.action === 'run' || marketShown.action === 'close')
        ? marketShown.reason
        : matchdayMode
          ? round === null
            ? 'Calculating the next matchday.'
            : round.allowed
              ? `${round.nextEvent} on ${round.targetDate}`
              : round.blocker
          : shown === null
            ? 'Loading the next event.'
            : shown.allowed
              ? `${shown.nextEvent} on ${shown.targetDate}`
              : shown.reason
  return (
    <section aria-label="Game calendar" className="space-y-3">
      <h2>Game date</h2>
      <p>{shown?.fromDate ?? 'Loading the game date.'}</p>
      <h2>Next event</h2>
      <p>{nextEvent}</p>
      {developmentDue && !developmentOpen && !marketFirst && (
        <Button
          disabled={busyKind !== null}
          onClick={() => setDevelopmentOpen(true)}
        >
          Apply Development
        </Button>
      )}
      {developmentDue && developmentOpen && (
        <NativeDevelopment
          key={requestKey}
          client={client}
          campaignId={campaignId}
          onSaved={() => {
            setDevelopmentOpen(false)
            onAdvanced()
          }}
          onCancel={() => setDevelopmentOpen(false)}
        />
      )}
      {reviewMode && shown?.allowed && !marketFirst && (
        <Button
          disabled={busyKind !== null}
          onClick={() => {
            void navigate(`/app/${campaignId}/seasons`)
          }}
        >
          Review Season
        </Button>
      )}
      {runMarket && (
        <Button
          disabled={busyKind !== null}
          onClick={() => {
            void confirmMarket('run')
          }}
        >
          Run Market
        </Button>
      )}
      {closeWindow && (
        <Button
          disabled={busyKind !== null}
          onClick={() => {
            void confirmMarket('close')
          }}
        >
          Close Window
        </Button>
      )}
      {shown?.allowed &&
        !matchdayMode &&
        !marketFirst &&
        marketShown !== null && (
          <Button
            disabled={busyKind !== null}
            onClick={() => {
              void continueCareer()
            }}
          >
            Continue
          </Button>
        )}
      {round?.emergency && <p>Emergency selection</p>}
      {round?.allowed &&
        !reviewMode &&
        !developmentDue &&
        !marketFirst &&
        !confirming && (
          <Button
            disabled={busyKind !== null}
            onClick={() => setConfirming(true)}
          >
            Sim Matchday
          </Button>
        )}
      {round?.allowed &&
        !reviewMode &&
        !developmentDue &&
        !marketFirst &&
        confirming && (
          <section aria-label="Confirm matchday" className="space-y-3">
            <p>
              Play round {round.round} on {round.targetDate}? All four leagues
              will be simulated and saved.
            </p>
            <Button
              disabled={busyKind !== null}
              onClick={() => {
                void simulateRound()
              }}
            >
              Confirm Sim Matchday
            </Button>
            <Button
              disabled={busyKind !== null}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </section>
        )}
      {busyKind !== null && (
        <p role="status">
          {busyKind === 'market'
            ? 'Calculating the transfer market.'
            : busyKind === 'match'
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
