import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { loadingCampaign } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { KpiRibbon } from '../../components/ui/KpiRibbon'
import { getCampaign } from '../../data/repositories/campaigns'
import { getClub } from '../../data/repositories/clubs'
import { listPlayersByClub } from '../../data/repositories/players'
import { listAuditEvents } from '../../data/repositories/audit-events'
import { awaitsClubChoice } from '../../domain/simulation/career'
import { getActiveConstitution } from '../../data/repositories/constitutions'
import { listContractsByClub } from '../../data/repositories/contracts'
import { listLedgerEntries } from '../../data/repositories/ledger-entries'
import { listOffers } from '../../data/repositories/offers'
import { listRegistrations } from '../../data/repositories/registrations'
import { getActiveSeason } from '../../data/repositories/seasons'
import { getSimulationState } from '../../data/repositories/simulation'
import { matchSimulationUnavailable } from '../../domain/simulation/calendar'
import { formatCapacity, transferCapacity } from '../../domain/finance/capacity'
import {
  formatWageCommitment,
  wageCommitment,
} from '../../domain/finance/wages'
import { entityIdSchema } from '../../domain/validation/schemas'
import { activityLines, squadAgeSummary, squadCount } from './campaign-summary'

type Summary = {
  campaignId: string | undefined
  clubName?: string
  count?: number
  ages?: readonly (number | null)[]
  activity?: readonly { id: string; summary: string }[]
  capacity?: string
  wages?: string
  activeBids?: number
  expiringContracts?: number
  registration?: string
  gameDate?: string
  missing?: boolean
  failed?: boolean
  chooseClub?: string
}

export function CommandCenterPage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const [summary, setSummary] = useState<Summary | null>(null)
  useEffect(() => {
    let active = true
    async function load() {
      const id = entityIdSchema.safeParse(campaignId)
      if (!id.success) return
      try {
        const campaign = await getCampaign(database, id.data)
        if (!campaign) {
          if (active) setSummary({ campaignId, missing: true })
          return
        }
        const audits = await listAuditEvents(database, campaign.id)
        if (awaitsClubChoice(campaign, audits)) {
          if (active) setSummary({ campaignId, chooseClub: campaign.id })
          return
        }
        const season = await getActiveSeason(database, campaign.id)
        const [club, players, constitution, contracts, entries, offers] =
          await Promise.all([
            getClub(database, campaign.id, campaign.managedClubId),
            listPlayersByClub(database, campaign.id, campaign.managedClubId),
            getActiveConstitution(database, campaign.id),
            listContractsByClub(database, campaign.id, campaign.managedClubId),
            season
              ? listLedgerEntries(
                  database,
                  campaign.id,
                  season.id,
                  campaign.managedClubId,
                )
              : Promise.resolve([]),
            season
              ? listOffers(database, campaign.id, season.id)
              : Promise.resolve([]),
          ])
        const managedPlayerIds = new Set(players.map((player) => player.id))
        const activeBids = offers.filter(
          (offer) =>
            offer.status === 'open' && managedPlayerIds.has(offer.playerId),
        ).length
        const expiringContracts = contracts.filter(
          (contract) =>
            contract.status === 'active' && contract.expiresOn !== null,
        ).length
        const registrationRule = constitution?.rules.find(
          (item) => item.id === 'REGISTRATION_QUOTA',
        )
        let registration = 'Unknown'
        if (
          registrationRule?.id === 'REGISTRATION_QUOTA' &&
          registrationRule.enabled &&
          season
        ) {
          const rows = await listRegistrations(
            database,
            campaign.id,
            season.id,
            registrationRule.competitionKey,
          )
          const count = rows.filter(
            (row) =>
              row.status === 'registered' && managedPlayerIds.has(row.playerId),
          ).length
          registration = `${count} / ${registrationRule.rosterLimit}`
        }
        const rule = constitution?.rules.find(
          (item) => item.id === 'SELL_TO_BUY',
        )
        const capacity =
          constitution && season
            ? transferCapacity(entries, season.id, campaign.managedClubId, {
                salesReinvestmentPct: rule?.salesReinvestmentPct ?? 0,
                prizeReinvestmentPct: rule?.prizeReinvestmentPct ?? 0,
              }).remainingCents
            : null
        const clock =
          campaign.mode === 'standalone'
            ? await getSimulationState(database, campaign.id)
            : undefined
        if (active)
          setSummary({
            campaignId,
            clubName: club?.name ?? 'Unknown',
            count: club ? players.length : 0,
            ages: club ? players.map((player) => player.reportedAge) : [],
            activity: audits,
            capacity: formatCapacity(capacity),
            wages: constitution
              ? formatWageCommitment(
                  wageCommitment(contracts, campaign.managedClubId),
                )
              : 'Unknown',
            activeBids,
            expiringContracts,
            registration,
            gameDate: clock?.currentDate,
          })
      } catch {
        if (active) setSummary({ campaignId, failed: true })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [database, campaignId])

  if (!entityIdSchema.safeParse(campaignId).success) return null
  if (!summary || summary.campaignId !== campaignId)
    return <p>{loadingCampaign}</p>
  if (summary.missing) return null
  if (summary.chooseClub)
    return <Navigate to={`/app/${summary.chooseClub}/choose-club`} replace />
  if (summary.failed)
    return (
      <p role="alert">
        This campaign could not be loaded. Reload and try again.
      </p>
    )
  const activity = summary.activity ?? []
  return (
    <>
      <SectionPage sectionId="command-center" />
      {summary.gameDate ? (
        <p>{`Game date ${summary.gameDate}. ${matchSimulationUnavailable}`}</p>
      ) : null}
      <h2>{summary.clubName}</h2>
      <KpiRibbon
        items={[
          { label: 'Squad', value: squadCount(summary.count ?? 0) },
          { label: 'Squad age', value: squadAgeSummary(summary.ages ?? []) },
          { label: 'Transfer capacity', value: summary.capacity ?? 'Unknown' },
          { label: 'Weekly wages', value: summary.wages ?? 'Unknown' },
          { label: 'Active bids', value: String(summary.activeBids ?? 0) },
          {
            label: 'Expiring contracts',
            value: String(summary.expiringContracts ?? 0),
          },
          { label: 'Registration', value: summary.registration ?? 'Unknown' },
        ]}
      />
      <ul aria-label="Activity">
        {activityLines(activity.map((audit) => audit.summary)).map(
          (line, index) => (
            <li key={activity[index].id}>{line}</li>
          ),
        )}
      </ul>
    </>
  )
}
