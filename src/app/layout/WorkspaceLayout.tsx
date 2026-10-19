import { Outlet, useParams } from 'react-router'
import { AppShell } from '../../components/ui/AppShell'

export function WorkspaceLayout() {
  const { campaignId } = useParams()

  return (
    <AppShell campaignId={campaignId}>
      <Outlet />
    </AppShell>
  )
}
