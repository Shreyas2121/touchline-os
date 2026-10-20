import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { financeFailed, loadingFinance, staleSave } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { KpiRibbon } from '../../components/ui/KpiRibbon'
import { systemClock } from '../../data/clock'
import { createEntityId } from '../../data/ids'
import { postLedgerEntry } from '../../data/commands/post-ledger-entry'
import { getCampaign } from '../../data/repositories/campaigns'
import { getClub } from '../../data/repositories/clubs'
import { listAuditEvents } from '../../data/repositories/audit-events'
import { getActiveConstitution } from '../../data/repositories/constitutions'
import { listContractsByClub } from '../../data/repositories/contracts'
import { listLedgerEntries } from '../../data/repositories/ledger-entries'
import { getActiveSeason } from '../../data/repositories/seasons'
import { formatCapacity, transferCapacity } from '../../domain/finance/capacity'
import {
  formatWageCommitment,
  wageCommitment,
} from '../../domain/finance/wages'
import { invalidMoneyMessage, parseMoneyCents } from '../../domain/models/money'
import { dateOnlySchema, type DateOnly } from '../../domain/models/dates'
import {
  entityIdSchema,
  type Campaign,
  type Club,
  type Constitution,
  type Contract,
  type LedgerEntry,
  type Season,
} from '../../domain/validation/schemas'
import { LedgerTable } from './LedgerTable'
import { WagePyramid } from './WagePyramid'
import { ActionPreview } from './ActionPreview'

type State = {
  campaignId: string | undefined
  campaign?: Campaign
  club?: Club
  season?: Season
  constitution?: Constitution
  contracts?: Contract[]
  entries?: LedgerEntry[]
  failed?: boolean
  missing?: boolean
  chooseClub?: string
}

function PrizeForm({
  campaign,
  season,
  onSaved,
  initialDate,
}: {
  campaign: Campaign
  season: Season
  onSaved: () => void
  initialDate: DateOnly
}) {
  const database = useDatabase()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState<string>(initialDate)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  async function submit() {
    if (busy) return
    setMessage('')
    setFailed(false)
    const parsed = parseMoneyCents(amount)
    if (!parsed.ok) {
      setFailed(true)
      setMessage(invalidMoneyMessage)
      return
    }
    setBusy(true)
    try {
      const result = await postLedgerEntry(database, {
        campaignId: campaign.id,
        seasonId: season.id,
        entryId: createEntityId(),
        expectedRevision: campaign.revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        kind: 'prize_income',
        amountCents: parsed.value,
        effectiveOn: date,
        note: note.trim() || null,
      })
      if (!result.ok) {
        setFailed(true)
        setMessage(result.code === 'CONFLICT' ? staleSave : result.message)
      } else {
        setAmount('')
        setNote('')
        setMessage('Posted prize income.')
        onSaved()
      }
    } catch {
      setFailed(true)
      setMessage('The prize income could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h2>Post prize income</h2>
      <fieldset disabled={busy} className="flex flex-wrap items-end gap-3">
        <label>
          Prize amount{' '}
          <input
            className="touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label>
          Effective date{' '}
          <input
            className="touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          Note{' '}
          <input
            className="touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1"
            value={note}
            maxLength={4_000}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy}>
          Post prize income
        </Button>
      </fieldset>
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
    </form>
  )
}

export function FinancePage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const [state, setState] = useState<State | null>(null)
  const [reload, setReload] = useState(0)
  const [effectiveDate] = useState(() =>
    dateOnlySchema.parse(systemClock().slice(0, 10)),
  )
  useEffect(() => {
    let active = true
    async function load() {
      const id = entityIdSchema.safeParse(campaignId)
      if (!id.success) return
      try {
        const campaign = await getCampaign(database, id.data)
        if (!campaign) {
          if (active) setState({ campaignId, missing: true })
          return
        }
        const audits = await listAuditEvents(database, campaign.id)
        if (
          campaign.seed !== null &&
          !audits.some((audit) => audit.actionType === 'campaign.select-club')
        ) {
          if (active) setState({ campaignId, chooseClub: campaign.id })
          return
        }
        const season = await getActiveSeason(database, campaign.id)
        if (!season) throw new Error('Missing active season')
        const [club, constitution, contracts, entries] = await Promise.all([
          getClub(database, campaign.id, campaign.managedClubId),
          getActiveConstitution(database, campaign.id),
          listContractsByClub(database, campaign.id, campaign.managedClubId),
          listLedgerEntries(
            database,
            campaign.id,
            season.id,
            campaign.managedClubId,
          ),
        ])
        if (active)
          setState({
            campaignId,
            campaign,
            club,
            season,
            constitution,
            contracts,
            entries,
          })
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
  if (!state || state.campaignId !== campaignId) return <p>{loadingFinance}</p>
  if (state.missing) return null
  if (state.chooseClub)
    return <Navigate to={`/app/${state.chooseClub}/choose-club`} replace />
  if (state.failed || !state.campaign || !state.season)
    return <p role="alert">{financeFailed}</p>
  const { campaign, season, constitution } = state
  const rule = constitution?.rules.find((item) => item.id === 'SELL_TO_BUY')
  const breakdown = transferCapacity(
    state.entries ?? [],
    season.id,
    campaign.managedClubId,
    {
      salesReinvestmentPct: rule?.salesReinvestmentPct ?? 0,
      prizeReinvestmentPct: rule?.prizeReinvestmentPct ?? 0,
    },
  )
  const wages = wageCommitment(state.contracts ?? [], campaign.managedClubId)
  const onSaved = () => setReload((value) => value + 1)
  return (
    <div className="space-y-6">
      <SectionPage sectionId="finance" />
      <KpiRibbon
        items={[
          {
            label: 'Transfer capacity',
            value: formatCapacity(
              constitution ? breakdown.remainingCents : null,
            ),
          },
          { label: 'Weekly wages', value: formatWageCommitment(wages) },
        ]}
      />
      {rule?.enabled &&
        rule.initialAllocationCents !== breakdown.initialAllocationCents && (
          <p>
            Opening allocation does not match the constitution. Capacity uses
            the ledger.
          </p>
        )}
      <WagePyramid
        contracts={state.contracts ?? []}
        clubId={campaign.managedClubId}
        constitution={constitution}
      />
      <PrizeForm
        key={`prize-${campaignId}`}
        campaign={campaign}
        season={season}
        onSaved={onSaved}
        initialDate={effectiveDate}
      />
      <LedgerTable
        key={`ledger-${campaignId}`}
        entries={state.entries ?? []}
        campaign={campaign}
        onSaved={onSaved}
      />
      {constitution && (
        <ActionPreview
          key={`preview-${campaign.id}-${campaign.revision}-${constitution.id}`}
          snapshot={{
            revision: campaign.revision,
            remainingCapacityCents: breakdown.remainingCents,
          }}
          constitution={constitution}
          effectiveDate={effectiveDate}
          wages={wages}
          prestige={state.club?.prestige ?? null}
        />
      )}
    </div>
  )
}
