import { Outlet, useLocation, useParams } from 'react-router'
import { useEffect, useState } from 'react'
import { disclaimer, loadingCampaign, previewBanner, saveFailed } from '../copy'
import { AppShell } from '../../components/ui/AppShell'
import { useDatabase } from '../providers/database'
import { getCampaign } from '../../data/repositories/campaigns'
import { entityIdSchema, type Campaign } from '../../domain/validation/schemas'
import { MissingCampaignPage } from '../pages/MissingCampaignPage'

export function WorkspaceLayout() {
  const { campaignId } = useParams()
  const { pathname } = useLocation()
  const database = useDatabase()
  const [state, setState] = useState<{
    id: string | undefined
    campaign?: Campaign
    failed?: boolean
  } | null>(null)
  useEffect(() => {
    let active = true
    const id = entityIdSchema.safeParse(campaignId)
    if (!id.success) return
    getCampaign(database, id.data)
      .then((campaign) => {
        if (active) setState({ id: campaignId, campaign })
      })
      .catch(() => {
        if (active) setState({ id: campaignId, failed: true })
      })
    return () => {
      active = false
    }
  }, [database, campaignId])
  if (!entityIdSchema.safeParse(campaignId).success)
    return <MissingCampaignPage />
  if (!state || state.id !== campaignId) return <p>{loadingCampaign}</p>
  if (state.failed) return <p role="alert">{saveFailed}</p>
  if (!state.campaign) return <MissingCampaignPage />

  return (
    <AppShell
      banner={
        pathname.endsWith('/command-center') ||
        pathname.endsWith('/choose-club') ||
        pathname.endsWith('/squad') ||
        pathname.endsWith('/tactics') ||
        pathname.endsWith('/finance') ||
        pathname.endsWith('/constitution') ||
        pathname.endsWith('/transfers')
          ? undefined
          : previewBanner
      }
      campaignId={campaignId}
      campaignName={state.campaign.name}
    >
      <Outlet />
      <footer>{disclaimer}</footer>
    </AppShell>
  )
}
