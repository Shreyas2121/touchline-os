import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { saveFailed, staleSave } from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { StatusPill } from '../../components/ui/StatusPill'
import { systemClock } from '../../data/clock'
import { acceptOffer } from '../../data/commands/accept-offer'
import { recordOffer } from '../../data/commands/record-offer'
import { rejectOffer } from '../../data/commands/reject-offer'
import { createEntityId } from '../../data/ids'
import {
  dateOnlySchema,
  parseDateOnly,
  type DateOnly,
} from '../../domain/models/dates'
import {
  formatMoneyEuros,
  invalidMoneyMessage,
  parseMoneyCents,
} from '../../domain/models/money'
import { evaluateAction } from '../../domain/rules/evaluate-action'
import type { RuleVerdict } from '../../domain/rules/types'
import type {
  Club,
  Constitution,
  EntityId,
  Offer,
  Player,
} from '../../domain/validation/schemas'

const controlClass =
  'touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1'

function today(): DateOnly {
  return dateOnlySchema.parse(systemClock().slice(0, 10))
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, 'en')
}

export function OfferInbox({
  campaignId,
  seasonId,
  revision,
  managedClub,
  players,
  clubs,
  offers,
  constitution,
  initialDate,
  onSaved,
}: {
  campaignId: EntityId
  seasonId: EntityId
  revision: number
  managedClub?: Club
  players: readonly Player[]
  clubs: readonly Club[]
  offers: readonly Offer[]
  constitution?: Constitution
  initialDate: DateOnly
  onSaved: () => void
}) {
  const database = useDatabase()
  const [playerId, setPlayerId] = useState('')
  const [bidderId, setBidderId] = useState('')
  const [fee, setFee] = useState('')
  const [receivedOn, setReceivedOn] = useState<string>(initialDate)
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [awaitingRevision, setAwaitingRevision] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const busy =
    pending || (awaitingRevision !== null && revision < awaitingRevision)
  const squad = players
    .filter((player) => player.clubId === managedClub?.id)
    .slice()
    .sort(byName)
  const bidders = clubs
    .filter((club) => club.id !== managedClub?.id)
    .slice()
    .sort(byName)
  const openOffers = offers.filter((offer) => offer.status === 'open')
  function verdictFor(offer: Offer): RuleVerdict | undefined {
    if (!constitution) return undefined
    const player = players.find((item) => item.id === offer.playerId)
    const bidder = clubs.find((item) => item.id === offer.bidderClubId)
    const report = evaluateAction(
      {
        type: 'reject-offer',
        feeCents: offer.feeCents,
        marketValueCents: player?.marketValueCents ?? null,
        bidderPrestige: bidder?.prestige ?? null,
        sellerPrestige: managedClub?.prestige ?? null,
      },
      { revision, remainingCapacityCents: null },
      constitution,
      offer.receivedOn,
    )
    return (
      report.verdicts.find((verdict) => verdict.severity === 'BLOCK') ??
      report.verdicts.find((verdict) => verdict.severity === 'WARN')
    )
  }
  function fail(text: string) {
    setFailed(true)
    setMessage(text)
  }
  function succeed(text: string, nextRevision: number) {
    setAwaitingRevision(nextRevision)
    setFailed(false)
    setMessage(text)
    onSaved()
  }
  async function record(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setMessage('')
    const parsedFee = parseMoneyCents(fee)
    if (!parsedFee.ok) {
      fail(invalidMoneyMessage)
      return
    }
    const date = parseDateOnly(receivedOn)
    if (!date.ok) {
      fail(date.message)
      return
    }
    if (!playerId || !bidderId) {
      fail('Command input is not valid.')
      return
    }
    setPending(true)
    try {
      const outcome = await recordOffer(database, {
        campaignId,
        offerId: createEntityId(),
        seasonId,
        playerId,
        bidderClubId: bidderId,
        feeCents: parsedFee.value,
        receivedOn: date.value,
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
      })
      if (!outcome.ok) {
        fail(outcome.code === 'CONFLICT' ? staleSave : outcome.message)
        return
      }
      setFee('')
      setPlayerId('')
      setBidderId('')
      succeed('Recorded the offer.', outcome.revision)
    } catch {
      fail(saveFailed)
    } finally {
      setPending(false)
    }
  }
  async function reject(offer: Offer, verdict: RuleVerdict | undefined) {
    if (busy) return
    if (verdict?.severity === 'WARN' && !reviewed.has(offer.id)) return
    setMessage('')
    setPending(true)
    try {
      const outcome = await rejectOffer(database, {
        campaignId,
        offerId: offer.id,
        resolvedOn: today(),
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        acknowledgedWarnings: reviewed.has(offer.id),
      })
      if (!outcome.ok) {
        fail(outcome.code === 'CONFLICT' ? staleSave : outcome.message)
        return
      }
      succeed('Rejected the offer.', outcome.revision)
    } catch {
      fail(saveFailed)
    } finally {
      setPending(false)
    }
  }
  async function accept(offer: Offer) {
    if (busy) return
    setMessage('')
    setPending(true)
    try {
      const date = today()
      const outcome = await acceptOffer(database, {
        campaignId,
        offerId: offer.id,
        resolvedOn: date,
        effectiveOn: date,
        expectedRevision: revision,
        now: systemClock(),
        transferId: createEntityId(),
        ledgerEntryId: createEntityId(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
      })
      if (!outcome.ok) {
        fail(outcome.code === 'CONFLICT' ? staleSave : outcome.message)
        return
      }
      succeed('Accepted the offer.', outcome.revision)
    } catch {
      fail(saveFailed)
    } finally {
      setPending(false)
    }
  }
  return (
    <section aria-label="Offers" className="space-y-4">
      <h2>Offers</h2>
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => void record(event)}
      >
        <div>
          <label htmlFor="offer-player">Player</label>{' '}
          <select
            id="offer-player"
            className={controlClass}
            value={playerId}
            onChange={(event) => setPlayerId(event.target.value)}
          >
            <option value=""></option>
            {squad.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="offer-bidder">Bidding club</label>{' '}
          <select
            id="offer-bidder"
            className={controlClass}
            value={bidderId}
            onChange={(event) => setBidderId(event.target.value)}
          >
            <option value=""></option>
            {bidders.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </div>
        <label>
          Fee{' '}
          <input
            className={controlClass}
            inputMode="decimal"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
          />
        </label>
        <label>
          Received on{' '}
          <input
            className={controlClass}
            type="date"
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy}>
          Record offer
        </Button>
      </form>
      {message ? <p role={failed ? 'alert' : 'status'}>{message}</p> : null}
      {openOffers.length === 0 ? (
        <p>No offers are recorded.</p>
      ) : (
        <ul className="space-y-4">
          {openOffers.map((offer) => {
            const verdict = verdictFor(offer)
            const player = players.find((item) => item.id === offer.playerId)
            const bidder = clubs.find((item) => item.id === offer.bidderClubId)
            const warned = verdict?.severity === 'WARN'
            return (
              <li key={offer.id} className="space-y-2">
                <p>{player?.name ?? offer.playerId}</p>
                <p>{bidder?.name ?? offer.bidderClubId}</p>
                <p>{formatMoneyEuros(offer.feeCents)}</p>
                {verdict ? (
                  <>
                    <StatusPill
                      tone={
                        verdict.severity === 'BLOCK' ? 'blocked' : 'warning'
                      }
                    />
                    <p>{verdict.message}</p>
                    <p>{verdict.remedy}</p>
                  </>
                ) : null}
                {warned ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={reviewed.has(offer.id)}
                      onChange={(event) => {
                        const next = new Set(reviewed)
                        if (event.target.checked) next.add(offer.id)
                        else next.delete(offer.id)
                        setReviewed(next)
                      }}
                    />{' '}
                    I have reviewed this warning.
                  </label>
                ) : null}
                <Button
                  disabled={busy || (warned && !reviewed.has(offer.id))}
                  onClick={() => void reject(offer, verdict)}
                >
                  Reject offer
                </Button>
                <Button disabled={busy} onClick={() => void accept(offer)}>
                  Accept offer
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <Link to={`/app/${campaignId}/constitution`}>
        Change a rule on Constitution.
      </Link>
    </section>
  )
}
