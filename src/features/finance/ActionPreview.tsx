import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { StatusPill } from '../../components/ui/StatusPill'
import { previewAction, type PreviewResult } from '../../domain/finance/preview'
import type { DateOnly } from '../../domain/models/dates'
import { invalidMoneyMessage, parseMoneyCents } from '../../domain/models/money'
import type {
  PolicyAction,
  PolicySnapshot,
  SquadTierChoice,
} from '../../domain/rules/types'
import type { Constitution } from '../../domain/validation/schemas'

type Choice = 'paid-signing' | 'free-signing' | 'wage-change' | 'reject-offer'
const controlClass =
  'touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1'

function money(text: string): number {
  const parsed = parseMoneyCents(text)
  if (!parsed.ok) throw new Error(invalidMoneyMessage)
  return parsed.value
}
function optionalInteger(
  text: string,
  maximum: number,
  message: string,
): number | null {
  if (!text.trim()) return null
  const value = Number(text)
  if (!Number.isInteger(value) || value < 0 || value > maximum)
    throw new Error(message)
  return value
}

export function ActionPreview({
  snapshot,
  constitution,
  effectiveDate,
  wages,
  prestige,
}: {
  snapshot: PolicySnapshot
  constitution: Constitution
  effectiveDate: DateOnly
  wages: { knownCents: number; unknownCount: number }
  prestige: number | null
}) {
  const [choice, setChoice] = useState<Choice>('paid-signing')
  const [fee, setFee] = useState('')
  const [age, setAge] = useState('')
  const [wage, setWage] = useState('')
  const [tier, setTier] = useState<SquadTierChoice | ''>('')
  const [bid, setBid] = useState('')
  const [value, setValue] = useState('')
  const [bidder, setBidder] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<PreviewResult | null>(null)
  const resultRegion = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (result) resultRegion.current?.focus()
  }, [result])
  function preview() {
    setError('')
    try {
      let action: PolicyAction
      if (choice === 'reject-offer') {
        action = {
          type: 'reject-offer',
          feeCents: money(bid),
          marketValueCents: value.trim() ? money(value) : null,
          bidderPrestige: optionalInteger(
            bidder,
            100,
            'Enter a prestige from 0 to 100 or leave it blank.',
          ),
          sellerPrestige: prestige,
        }
      } else {
        const weeklyWageCents = wage.trim() ? money(wage) : null
        const squadTier = tier || null
        action =
          choice === 'wage-change'
            ? { type: 'wage-change', weeklyWageCents, squadTier }
            : {
                type: 'incoming-transfer',
                feeCents: choice === 'free-signing' ? 0 : money(fee),
                isFree: choice === 'free-signing',
                age: optionalInteger(
                  age,
                  99,
                  'Enter a whole number of years or leave age blank.',
                ),
                weeklyWageCents,
                squadTier,
              }
      }
      setResult(
        previewAction({ action, snapshot, constitution, effectiveDate, wages }),
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The action could not be previewed.',
      )
    }
  }
  return (
    <section
      aria-label="Action preview"
      className="space-y-4 border border-[var(--border)] p-4"
    >
      <h2>Action preview</h2>
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          preview()
        }}
      >
        <div>
          <label htmlFor="preview-action">Action</label>{' '}
          <select
            id="preview-action"
            className={controlClass}
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value as Choice)
              setResult(null)
              setError('')
            }}
          >
            <option value="paid-signing">Paid signing</option>
            <option value="free-signing">Free signing</option>
            <option value="wage-change">Wage change</option>
            <option value="reject-offer">Reject offer</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          {choice === 'paid-signing' && (
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
          {(choice === 'paid-signing' || choice === 'free-signing') && (
            <label>
              Age{' '}
              <input
                className={controlClass}
                inputMode="numeric"
                value={age}
                onChange={(event) => setAge(event.target.value)}
              />
            </label>
          )}
          {choice !== 'reject-offer' ? (
            <>
              <label>
                Weekly wage{' '}
                <input
                  className={controlClass}
                  inputMode="decimal"
                  value={wage}
                  onChange={(event) => setWage(event.target.value)}
                />
              </label>
              <div>
                <label htmlFor="preview-tier">Tier</label>{' '}
                <select
                  id="preview-tier"
                  className={controlClass}
                  value={tier}
                  onChange={(event) =>
                    setTier(event.target.value as SquadTierChoice | '')
                  }
                >
                  <option value="">Unknown</option>
                  <option value="key">Key</option>
                  <option value="rotation">Rotation</option>
                  <option value="youth">Youth</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <label>
                Bid{' '}
                <input
                  className={controlClass}
                  inputMode="decimal"
                  value={bid}
                  onChange={(event) => setBid(event.target.value)}
                />
              </label>
              <label>
                Market value{' '}
                <input
                  className={controlClass}
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
              <label>
                Bidder prestige{' '}
                <input
                  className={controlClass}
                  inputMode="numeric"
                  value={bidder}
                  onChange={(event) => setBidder(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" variant="primary">
          Preview action
        </Button>
      </form>
      {result && (
        <div
          ref={resultRegion}
          tabIndex={-1}
          role="region"
          aria-label="Preview result"
          aria-live="polite"
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
          {result.report.verdicts.length > 0 && (
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
          {result.report.allowed && result.report.verdicts.length === 0 && (
            <p>No rule blocked this action.</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled>Record this action</Button>
        <p>Choose a player on Transfers to record a move.</p>
      </div>
    </section>
  )
}
