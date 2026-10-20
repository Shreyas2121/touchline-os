import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { StatusPill } from '../../components/ui/StatusPill'
import {
  previewAction,
  previewOutgoingSale,
  type PreviewResult,
} from '../../domain/finance/preview'
import { formatWageCommitment } from '../../domain/finance/wages'
import { parseDateOnly, type DateOnly } from '../../domain/models/dates'
import { invalidMoneyMessage, parseMoneyCents } from '../../domain/models/money'
import { displayAge } from '../../domain/player/squad-view'
import type { PolicySnapshot, SquadTierChoice } from '../../domain/rules/types'
import type {
  Constitution,
  Contract,
  Player,
  Season,
} from '../../domain/validation/schemas'

const controlClass =
  'touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1'

type Move = 'purchase' | 'free' | 'sale'

function activeWageCents(
  contracts: readonly Contract[],
  playerId: string,
  clubId: string,
): number | null {
  const active = contracts.filter(
    (contract) =>
      contract.status === 'active' &&
      contract.playerId === playerId &&
      contract.clubId === clubId,
  )
  if (active.length !== 1) return null
  return active[0]?.weeklyWageCents ?? null
}

function unruledIncoming(input: {
  snapshot: PolicySnapshot
  wages: { knownCents: number; unknownCount: number }
  weeklyWageCents: number | null
}): PreviewResult {
  return {
    report: {
      allowed: true,
      verdicts: [],
      snapshotRevision: input.snapshot.revision,
    },
    beforeCapacity: 'Unknown',
    afterCapacity: 'Unknown',
    beforeWages: formatWageCommitment(input.wages),
    afterWages:
      input.weeklyWageCents === null
        ? 'Unknown'
        : formatWageCommitment({
            knownCents: input.wages.knownCents + input.weeklyWageCents,
            unknownCount: input.wages.unknownCount,
          }),
  }
}

export function ScenarioPreview({
  player,
  season,
  constitution,
  snapshot,
  wages,
  contracts,
  managedClubId,
  initialDate,
}: {
  player: Player | null
  season: Season
  constitution?: Constitution
  snapshot: PolicySnapshot
  wages: { knownCents: number; unknownCount: number }
  contracts: readonly Contract[]
  managedClubId: string
  initialDate: DateOnly
}) {
  const [move, setMove] = useState<Move>('purchase')
  const [fee, setFee] = useState('')
  const [wage, setWage] = useState('')
  const [tier, setTier] = useState<SquadTierChoice | ''>('')
  const [effectiveOn, setEffectiveOn] = useState<string>(initialDate)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PreviewResult | null>(null)
  const resultRegion = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (result) resultRegion.current?.focus()
  }, [result])
  function preview() {
    if (!player) return
    setError('')
    try {
      const weeklyWageCents =
        move === 'sale' ? null : wage.trim() ? money(wage) : null
      const squadTier = tier || null
      const feeCents = move === 'free' ? 0 : money(fee)
      const date = parseDateOnly(effectiveOn)
      if (!date.ok) throw new Error(date.message)
      const ageDisplay = displayAge(player, season)
      const age = ageDisplay.kind === 'unknown' ? null : ageDisplay.years
      if (move === 'sale') {
        const rule = constitution?.rules.find(
          (item) => item.id === 'SELL_TO_BUY',
        )
        setResult(
          previewOutgoingSale({
            feeCents,
            salesReinvestmentPct: rule?.salesReinvestmentPct ?? 0,
            snapshot: constitution
              ? snapshot
              : { ...snapshot, remainingCapacityCents: null },
            wages,
            activeWageCents: activeWageCents(
              contracts,
              player.id,
              managedClubId,
            ),
          }),
        )
        return
      }
      if (!constitution) {
        setResult(unruledIncoming({ snapshot, wages, weeklyWageCents }))
        return
      }
      setResult(
        previewAction({
          action: {
            type: 'incoming-transfer',
            feeCents,
            isFree: move === 'free',
            age,
            weeklyWageCents,
            squadTier,
          },
          snapshot,
          constitution,
          effectiveDate: date.value,
          wages,
        }),
      )
    } catch (cause) {
      setResult(null)
      setError(
        cause instanceof Error
          ? cause.message
          : 'The action could not be previewed.',
      )
    }
  }
  return (
    <section aria-label="Scenario" className="space-y-4">
      <h2>Scenario</h2>
      {!player ? (
        <p>Choose a player to preview a move.</p>
      ) : (
        <>
          <p>{player.name}</p>
          <form
            noValidate
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              preview()
            }}
          >
            <div>
              <label htmlFor="scenario-move">Move</label>{' '}
              <select
                id="scenario-move"
                className={controlClass}
                value={move}
                onChange={(event) => {
                  setMove(event.target.value as Move)
                  setResult(null)
                  setError('')
                }}
              >
                <option value="purchase">Incoming purchase</option>
                <option value="free">Incoming free signing</option>
                <option value="sale">Outgoing sale</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              {move !== 'free' && (
                <label>
                  Fee{' '}
                  <input
                    className={controlClass}
                    inputMode="decimal"
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                  />
                </label>
              )}
              {move !== 'sale' && (
                <label>
                  Weekly wage{' '}
                  <input
                    className={controlClass}
                    inputMode="decimal"
                    value={wage}
                    onChange={(event) => setWage(event.target.value)}
                  />
                </label>
              )}
              {move !== 'sale' && (
                <div>
                  <label htmlFor="scenario-tier">Tier</label>{' '}
                  <select
                    id="scenario-tier"
                    className={controlClass}
                    value={tier}
                    onChange={(event) =>
                      setTier(event.target.value as SquadTierChoice | '')
                    }
                  >
                    <option value=""></option>
                    <option value="key">Key</option>
                    <option value="rotation">Rotation</option>
                    <option value="youth">Youth</option>
                  </select>
                </div>
              )}
              <label>
                Effective date{' '}
                <input
                  className={controlClass}
                  type="date"
                  value={effectiveOn}
                  onChange={(event) => setEffectiveOn(event.target.value)}
                />
              </label>
            </div>
            {error && <p role="alert">{error}</p>}
            <Button type="submit" variant="primary">
              Preview scenario
            </Button>
          </form>
          {result && (
            <div
              ref={resultRegion}
              tabIndex={-1}
              role="region"
              aria-label="Preview result"
              className="touchline-focus space-y-3"
            >
              <p>Preview only — no changes recorded.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <section aria-label="Before">
                  <h3>Before</h3>
                  <p>Transfer capacity: {result.beforeCapacity}</p>
                  <p>Weekly wages: {result.beforeWages}</p>
                </section>
                <section aria-label="After">
                  <h3>After</h3>
                  <p>Transfer capacity: {result.afterCapacity}</p>
                  <p>Weekly wages: {result.afterWages}</p>
                </section>
              </div>
              {!constitution && (
                <p>No constitution is saved, so no rule was checked.</p>
              )}
              {constitution && result.report.verdicts.length > 0 && (
                <ul className="space-y-3">
                  {result.report.verdicts.map((verdict) => (
                    <li key={`${verdict.ruleId}-${verdict.code}`}>
                      <StatusPill
                        tone={
                          verdict.severity === 'BLOCK'
                            ? 'blocked'
                            : verdict.severity === 'WARN'
                              ? 'warning'
                              : 'informational'
                        }
                      />
                      <p>{verdict.message}</p>
                      <p>{verdict.remedy}</p>
                    </li>
                  ))}
                </ul>
              )}
              {constitution &&
                result.report.allowed &&
                result.report.verdicts.length === 0 && (
                  <p>No rule blocked this action.</p>
                )}
            </div>
          )}
          <Button disabled>Record this transfer</Button>
        </>
      )}
    </section>
  )
}

function money(text: string): number {
  const parsed = parseMoneyCents(text)
  if (!parsed.ok) throw new Error(invalidMoneyMessage)
  return parsed.value
}
