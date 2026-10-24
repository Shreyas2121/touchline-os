import { loadConstitutionScreen } from '../../data/queries/constitution-screen'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import {
  constitutionFailed,
  loadingConstitution,
  staleSave,
} from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { systemClock } from '../../data/clock'
import { createEntityId } from '../../data/ids'
import { saveConstitution } from '../../data/commands/save-constitution'
import { challengeRulesLocked } from '../../domain/simulation/career'
import {
  constitutionPreset,
  type ConstitutionPresetName,
} from '../../domain/rules/presets'
import { invalidMoneyMessage, parseMoneyCents } from '../../domain/models/money'
import {
  entityIdSchema,
  type Campaign,
  type Constitution,
  type ConstitutionRule,
} from '../../domain/validation/schemas'

const presetDescriptions = {
  balanced:
    '70% of completed sales, age cap 26, and weekly caps of €45,000.00, €20,000.00, and €5,000.00.',
  strict:
    '50% of completed sales, age cap 23, free transfers count, and lower wage caps.',
  custom: 'All five rules are saved off. You can turn a rule on before saving.',
}
const descriptions = {
  SELL_TO_BUY:
    'Paid signings are limited to the unspent transfer capacity from the opening allocation, a share of completed sales, recorded prize money, and approved carryover.',
  MAX_SIGNING_AGE:
    'A signing older than the age cap is blocked. A free transfer can be exempt when that option is on.',
  WAGE_TIER_CAP:
    'A known weekly wage above the selected tier cap is blocked. An unknown wage is blocked while this rule is on.',
  PRESTIGE_BID_SALE:
    'A qualifying bid from a higher-prestige club cannot be rejected, and a season cannot roll over while one is unresolved.',
  REGISTRATION_QUOTA:
    'Registration checks run on the Registration screen when this rule is on.',
}
type Field = {
  key: string
  label: string
  kind?: 'money' | 'checkbox' | 'text' | 'nullable'
}
const fields: Record<ConstitutionRule['id'], Field[]> = {
  SELL_TO_BUY: [
    { key: 'salesReinvestmentPct', label: 'Sales percent' },
    { key: 'prizeReinvestmentPct', label: 'Prize percent' },
    { key: 'carryoverPct', label: 'Carryover percent' },
    {
      key: 'initialAllocationCents',
      label: 'Opening allocation',
      kind: 'money',
    },
  ],
  MAX_SIGNING_AGE: [
    { key: 'maxAge', label: 'Age cap' },
    {
      key: 'freeTransfersExempt',
      label: 'Free transfers are exempt',
      kind: 'checkbox',
    },
  ],
  WAGE_TIER_CAP: [
    { key: 'keyWeeklyCapCents', label: 'Key cap', kind: 'money' },
    { key: 'rotationWeeklyCapCents', label: 'Rotation cap', kind: 'money' },
    { key: 'youthWeeklyCapCents', label: 'Youth cap', kind: 'money' },
  ],
  PRESTIGE_BID_SALE: [
    { key: 'requiredFeeNumerator', label: 'Required fee numerator' },
    { key: 'requiredFeeDenominator', label: 'Required fee denominator' },
    {
      key: 'requireHigherPrestige',
      label: 'Require higher prestige',
      kind: 'checkbox',
    },
  ],
  REGISTRATION_QUOTA: [
    { key: 'rosterLimit', label: 'Roster limit' },
    { key: 'minimumHomegrown', label: 'Minimum homegrown' },
    { key: 'ageExemptionUnder', label: 'Age exemption', kind: 'nullable' },
    { key: 'competitionKey', label: 'Competition', kind: 'text' },
  ],
}

function ConstitutionForm({
  campaign,
  constitution,
  onSaved,
}: {
  campaign: Campaign
  constitution?: Constitution
  onSaved: () => void
}) {
  const database = useDatabase()
  const [preset, setPreset] = useState<ConstitutionPresetName>('balanced')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function submit(form: HTMLFormElement) {
    if (busy) return
    setMessage('')
    const values = new FormData(form)
    const rules: unknown[] = constitution
      ? constitution.rules.map((rule) => {
          const changes: Record<string, unknown> = {
            enabled: values.has(`${rule.id}-enabled`),
          }
          for (const field of fields[rule.id]) {
            const name = `${rule.id}-${field.key}`
            const text = String(values.get(name) ?? '').trim()
            if (field.kind === 'checkbox') changes[field.key] = values.has(name)
            else if (field.kind === 'money') {
              const parsed = parseMoneyCents(text)
              if (!parsed.ok) throw new Error(invalidMoneyMessage)
              changes[field.key] = parsed.value
            } else
              changes[field.key] =
                field.kind === 'text'
                  ? text
                  : field.kind === 'nullable' && text === ''
                    ? null
                    : text === ''
                      ? NaN
                      : Number(text)
          }
          return { ...rule, ...changes }
        })
      : constitutionPreset(preset)
    setBusy(true)
    try {
      const now = systemClock()
      const result = await saveConstitution(database, {
        campaignId: campaign.id,
        constitutionId: createEntityId(),
        expectedRevision: campaign.revision,
        now,
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        ledgerEntryId: createEntityId(),
        effectiveOn: now.slice(0, 10),
        rules,
      })
      if (!result.ok)
        setMessage(result.code === 'CONFLICT' ? staleSave : result.message)
      else onSaved()
    } catch {
      setMessage('The constitution could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const ordered =
    constitution &&
    constitutionPreset('balanced').map((item) =>
      constitution.rules.find((rule) => rule.id === item.id)!,
    )
  if (campaign.mode === 'standalone' && campaign.rulesMode === 'challenge') {
    return (
      <section aria-label="Challenge rules" className="space-y-2">
        <p>{challengeRulesLocked}</p>
        <ul>
          {(ordered || []).map((rule) => (
            <li key={rule.id}>
              {descriptions[rule.id]} {rule.enabled ? 'On.' : 'Off.'}
            </li>
          ))}
        </ul>
      </section>
    )
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(event.currentTarget).catch((error: unknown) => {
          setMessage(
            error instanceof Error ? error.message : invalidMoneyMessage,
          )
        })
      }}
    >
      {!constitution ? (
        <>
          <h2>Choose a constitution</h2>
          <label htmlFor="preset">Preset</label>
          <select
            id="preset"
            className="touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1"
            disabled={busy}
            value={preset}
            onChange={(event) =>
              setPreset(event.target.value as ConstitutionPresetName)
            }
          >
            <option value="balanced">Balanced</option>
            <option value="strict">Strict Moneyball</option>
            <option value="custom">Custom</option>
          </select>
          <p>{presetDescriptions[preset]}</p>
        </>
      ) : (
        <>
          <p>Version {constitution.version}</p>
          {ordered?.map((rule) => (
            <fieldset
              key={rule.id}
              disabled={busy}
              className="space-y-2 border border-[var(--border)] p-4"
            >
              <legend>
                <h2>{rule.id}</h2>
              </legend>
              <p>{descriptions[rule.id]}</p>
              <label className="block">
                <input
                  className="touchline-focus"
                  type="checkbox"
                  name={`${rule.id}-enabled`}
                  defaultChecked={rule.enabled}
                />{' '}
                Enabled
              </label>
              {fields[rule.id].map((field) => {
                const value = (
                  rule as unknown as Record<
                    string,
                    string | number | boolean | null
                  >
                )[field.key]
                const name = `${rule.id}-${field.key}`
                return (
                  <div key={name}>
                    <label htmlFor={name}>{field.label}</label>{' '}
                    {field.kind === 'checkbox' ? (
                      <input
                        id={name}
                        name={name}
                        className="touchline-focus"
                        type="checkbox"
                        defaultChecked={Boolean(value)}
                      />
                    ) : (
                      <input
                        id={name}
                        name={name}
                        className="touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1"
                        type="text"
                        inputMode={
                          field.kind === 'text' ? undefined : 'decimal'
                        }
                        defaultValue={
                          value === null
                            ? ''
                            : field.kind === 'money'
                              ? (Number(value) / 100).toFixed(2)
                              : String(value)
                        }
                      />
                    )}
                  </div>
                )
              })}
            </fieldset>
          ))}
        </>
      )}
      <p>
        Saving writes a new version. It does not change lineups, players, or
        transfers.
      </p>
      {message && <p role="alert">{message}</p>}
      <Button type="submit" variant="primary" disabled={busy}>
        Save constitution
      </Button>
    </form>
  )
}

type State = {
  campaignId: string | undefined
  campaign?: Campaign
  constitution?: Constitution
  failed?: boolean
  chooseClub?: string
  missing?: boolean
}
export function ConstitutionPage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const [state, setState] = useState<State | null>(null)
  const [reload, setReload] = useState(0)
  const [saved, setSaved] = useState<{
    campaignId: string | undefined
    version: number
  } | null>(null)
  useEffect(() => {
    let active = true
    async function load() {
      const id = entityIdSchema.safeParse(campaignId)
      if (!id.success) return
      try {
        const snapshot = await loadConstitutionScreen(database, id.data)
        if (active) setState({ campaignId, ...snapshot })
      } catch {
        if (active) setState({ campaignId, failed: true })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [database, campaignId, reload])
  if (!entityIdSchema.safeParse(campaignId).success) return null
  if (!state || state.campaignId !== campaignId)
    return <p>{loadingConstitution}</p>
  if (state.missing) return null
  if (state.chooseClub)
    return <Navigate to={`/app/${state.chooseClub}/choose-club`} replace />
  if (state.failed || !state.campaign)
    return <p role="alert">{constitutionFailed}</p>
  return (
    <>
      <SectionPage sectionId="constitution" />
      {saved &&
        saved.campaignId === campaignId &&
        state.constitution?.version === saved.version && (
          <p role="status">Saved constitution version {saved.version}.</p>
        )}
      <ConstitutionForm
        key={`${campaignId}-${state.constitution?.version ?? 0}`}
        campaign={state.campaign}
        constitution={state.constitution}
        onSaved={() => {
          setSaved({
            campaignId,
            version: (state.constitution?.version ?? 0) + 1,
          })
          setReload((value) => value + 1)
        }}
      />
    </>
  )
}
