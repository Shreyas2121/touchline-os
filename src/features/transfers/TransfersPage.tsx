import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { systemClock } from '../../data/clock'
import { listAuditEvents } from '../../data/repositories/audit-events'
import { getCampaign } from '../../data/repositories/campaigns'
import { getClub, listClubs } from '../../data/repositories/clubs'
import { getActiveConstitution } from '../../data/repositories/constitutions'
import { listContractsByClub } from '../../data/repositories/contracts'
import { listLedgerEntries } from '../../data/repositories/ledger-entries'
import { listOffers } from '../../data/repositories/offers'
import { listPlayers } from '../../data/repositories/players'
import { getActiveSeason } from '../../data/repositories/seasons'
import { listShortlist } from '../../data/repositories/shortlist'
import { listTransfers } from '../../data/repositories/transfers'
import { transferCapacity } from '../../domain/finance/capacity'
import { wageCommitment } from '../../domain/finance/wages'
import { dateOnlySchema, type DateOnly } from '../../domain/models/dates'
import { formatMoneyEuros } from '../../domain/models/money'
import {
  entityIdSchema,
  type Campaign,
  type Club,
  type Constitution,
  type Contract,
  type EntityId,
  type LedgerEntry,
  type Offer,
  type Player,
  type Season,
  type ShortlistItem,
  type Transfer,
} from '../../domain/validation/schemas'
import { OfferInbox } from './OfferInbox'
import { PlayerSearch } from './PlayerSearch'
import { ScenarioPreview } from './ScenarioPreview'

type State = {
  campaignId: string | undefined
  campaign?: Campaign
  club?: Club
  clubs?: Club[]
  season?: Season
  players?: Player[]
  shortlist?: ShortlistItem[]
  contracts?: Contract[]
  constitution?: Constitution
  entries?: LedgerEntry[]
  offers?: Offer[]
  transfers?: Transfer[]
  failed?: boolean
  missing?: boolean
  chooseClub?: string
}

export function TransfersPage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const [state, setState] = useState<State | null>(null)
  const [reload, setReload] = useState(0)
  const [selectedId, setSelectedId] = useState<EntityId | null>(null)
  const [notice, setNotice] = useState('')
  const [initialDate] = useState<DateOnly>(() =>
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
        const [
          club,
          clubs,
          players,
          shortlist,
          contracts,
          constitution,
          entries,
          offers,
          transfers,
        ] = await Promise.all([
          getClub(database, campaign.id, campaign.managedClubId),
          listClubs(database, campaign.id),
          listPlayers(database, campaign.id),
          listShortlist(database, campaign.id),
          listContractsByClub(database, campaign.id, campaign.managedClubId),
          getActiveConstitution(database, campaign.id),
          listLedgerEntries(
            database,
            campaign.id,
            season.id,
            campaign.managedClubId,
          ),
          listOffers(database, campaign.id, season.id),
          listTransfers(database, campaign.id, season.id),
        ])
        if (active)
          setState({
            campaignId,
            campaign,
            club,
            clubs,
            season,
            players,
            shortlist,
            contracts,
            constitution,
            entries,
            offers,
            transfers,
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
  if (!state || state.campaignId !== campaignId)
    return <p>Loading transfers.</p>
  if (state.missing) return null
  if (state.chooseClub)
    return <Navigate to={`/app/${state.chooseClub}/choose-club`} replace />
  if (state.failed || !state.campaign || !state.season)
    return (
      <p role="alert">Transfers could not be loaded. Reload and try again.</p>
    )
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
  const players = state.players ?? []
  const selected = players.find((player) => player.id === selectedId) ?? null
  return (
    <div className="space-y-6">
      <SectionPage sectionId="transfers" />
      <PlayerSearch
        players={players}
        clubs={state.clubs ?? []}
        shortlist={state.shortlist ?? []}
        campaignId={campaign.id}
        revision={campaign.revision}
        onSaved={() => setReload((value) => value + 1)}
        onPreview={(playerId) => {
          setNotice('')
          setSelectedId(playerId)
        }}
      />
      {notice ? <p role="status">{notice}</p> : null}
      <ScenarioPreview
        key={selected?.id ?? 'none'}
        player={selected}
        season={season}
        constitution={constitution}
        snapshot={{
          revision: campaign.revision,
          remainingCapacityCents: constitution
            ? breakdown.remainingCents
            : null,
        }}
        wages={wages}
        contracts={state.contracts ?? []}
        clubs={state.clubs ?? []}
        managedClubId={campaign.managedClubId}
        revision={campaign.revision}
        initialDate={initialDate}
        onRecorded={() => {
          setNotice('Recorded the transfer.')
          setSelectedId(null)
          setReload((value) => value + 1)
        }}
      />
      <OfferInbox
        key={campaign.id}
        campaignId={campaign.id}
        seasonId={season.id}
        revision={campaign.revision}
        managedClub={state.club}
        players={players}
        clubs={state.clubs ?? []}
        offers={state.offers ?? []}
        constitution={constitution}
        initialDate={initialDate}
        onSaved={() => setReload((value) => value + 1)}
      />
      <CompletedDeals transfers={state.transfers ?? []} players={players} />
    </div>
  )
}

function dealKind(kind: Transfer['kind']): string {
  if (kind === 'sale') return 'Sale'
  if (kind === 'purchase') return 'Purchase'
  return 'Free'
}

function CompletedDeals({
  transfers,
  players,
}: {
  transfers: readonly Transfer[]
  players: readonly Player[]
}) {
  const deals = transfers.slice().sort((left, right) => {
    if (left.effectiveOn !== right.effectiveOn)
      return left.effectiveOn < right.effectiveOn ? -1 : 1
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
  return (
    <section aria-label="Completed deals" className="space-y-3">
      <h2>Completed deals</h2>
      {deals.length === 0 ? (
        <p>No completed deals for this season.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Date</th>
              <th>Player</th>
              <th>Kind</th>
              <th>Fee</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((transfer) => (
              <tr key={transfer.id}>
                <td>{transfer.effectiveOn}</td>
                <td>
                  {players.find((player) => player.id === transfer.playerId)
                    ?.name ?? transfer.playerId}
                </td>
                <td>{dealKind(transfer.kind)}</td>
                <td>{formatMoneyEuros(transfer.feeCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
