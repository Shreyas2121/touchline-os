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
import { entityIdSchema } from '../../domain/validation/schemas'
import { activityLines, squadAgeSummary, squadCount } from './campaign-summary'

type Summary = {
  campaignId: string | undefined
  clubName?: string
  count?: number
  ages?: readonly (number | null)[]
  activity?: readonly { id: string; summary: string }[]
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
        if (
          campaign.seed !== null &&
          !audits.some((audit) => audit.actionType === 'campaign.select-club')
        ) {
          if (active) setSummary({ campaignId, chooseClub: campaign.id })
          return
        }
        const [club, players] = await Promise.all([
          getClub(database, campaign.id, campaign.managedClubId),
          listPlayersByClub(database, campaign.id, campaign.managedClubId),
        ])
        if (active)
          setSummary({
            campaignId,
            clubName: club?.name ?? 'Unknown',
            count: club ? players.length : 0,
            ages: club ? players.map((player) => player.reportedAge) : [],
            activity: audits,
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
      <h2>{summary.clubName}</h2>
      <KpiRibbon
        items={[
          { label: 'Squad', value: squadCount(summary.count ?? 0) },
          { label: 'Squad age', value: squadAgeSummary(summary.ages ?? []) },
          { label: 'Transfer capacity', value: 'Unknown' },
          { label: 'Weekly wages', value: 'Unknown' },
          { label: 'Registration', value: 'Unknown' },
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
