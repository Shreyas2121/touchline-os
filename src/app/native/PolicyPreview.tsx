import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { GameClient } from '../../platform/game-client'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import type { NativePreview } from '../../platform/generated/NativePreview'
import { mapInvokeError } from '../../platform/errors'
import { Button } from '../../components/ui/Button'

export function PolicyPreview({
  client,
  model,
  campaignId,
}: {
  client: GameClient
  model: ScreenModel
  campaignId: string
}) {
  const [fee, setFee] = useState('0')
  const [wage, setWage] = useState('0')
  const [age, setAge] = useState('')
  const [date, setDate] = useState(
    model.rows.simulationStates[0]?.currentDate ??
      model.rows.seasons[0]?.startDate ??
      '',
  )
  const [tier, setTier] = useState<'key' | 'rotation' | 'youth'>('rotation')
  const inputKey = JSON.stringify([
    campaignId,
    model.revision,
    fee,
    wage,
    age,
    date,
    tier,
  ])
  const [submitted, setSubmitted] = useState<{
    key: string
    value: NativePreview | string
  } | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current += 1
      setPendingKey(null)
    },
    [inputKey, client],
  )
  const state = submitted?.key === inputKey ? submitted.value : null
  const busy = pendingKey === inputKey
  async function submit() {
    const requestId = ++request.current
    setPendingKey(inputKey)
    setSubmitted(null)
    try {
      const result = await client.previewPolicy({
        campaignId,
        expectedRevision: model.revision,
        effectiveDate: date,
        action: {
          type: 'incoming-transfer',
          feeCents: Number(fee),
          weeklyWageCents: wage === '' ? null : Number(wage),
          age: age === '' ? null : Number(age),
          isFree: Number(fee) === 0,
          squadTier: tier,
        },
      })
      if (request.current === requestId)
        setSubmitted({ key: inputKey, value: result })
    } catch (error) {
      if (request.current === requestId)
        setSubmitted({ key: inputKey, value: mapInvokeError(error).message })
    } finally {
      if (request.current === requestId) setPendingKey(null)
    }
  }
  const field = (label: string, node: ReactNode) => (
    <label className="flex flex-col gap-1">
      {label}
      {node}
    </label>
  )
  return (
    <section className="space-y-3">
      <h2>Action preview</h2>
      <p>
        Checks the saved constitution in Rust. This preview does not record a
        transfer.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {field(
          'Fee (cents)',
          <input
            type="number"
            min="0"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            required
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />,
        )}
        {field(
          'Weekly wage (cents)',
          <input
            type="number"
            min="0"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            value={wage}
            onChange={(e) => setWage(e.target.value)}
          />,
        )}
        {field(
          'Age (blank means unknown)',
          <input
            type="number"
            min="0"
            max="99"
            step="1"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />,
        )}
        {field(
          'Tier',
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as typeof tier)}
          >
            <option value="key">Key</option>
            <option value="rotation">Rotation</option>
            <option value="youth">Youth</option>
          </select>,
        )}
        {field(
          'Effective date',
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />,
        )}
        <Button
          type="submit"
          disabled={busy || !model.rows.constitutions.length}
        >
          Preview action
        </Button>
      </form>
      {typeof state === 'string' ? (
        <p role="alert">{state}</p>
      ) : (
        state && (
          <div role="status">
            <p>
              {state.report.allowed
                ? 'Allowed by saved rules'
                : 'Blocked by saved rules'}{' '}
              · revision {state.revision}
            </p>
            <p>
              Capacity: {state.beforeCapacity} → {state.afterCapacity}
            </p>
            <p>
              Wages: {state.beforeWages} → {state.afterWages}
            </p>
            {state.report.verdicts.map((v, i) => (
              <p key={i}>
                {v.message} {v.remedy}
              </p>
            ))}
          </div>
        )
      )}
    </section>
  )
}
