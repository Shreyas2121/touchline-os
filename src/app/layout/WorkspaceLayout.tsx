import { Outlet, useParams } from 'react-router'
import { disclaimer, previewBanner } from '../copy'
import { AppShell } from '../../components/ui/AppShell'

export function WorkspaceLayout() {
  const { campaignId } = useParams()

  return (
    <AppShell banner={previewBanner} campaignId={campaignId}>
      <Outlet />
      <footer>{disclaimer}</footer>
    </AppShell>
  )
}
