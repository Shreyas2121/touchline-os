import { settingsBody } from '../../app/copy'
import { PageHeader } from '../../components/ui/PageHeader'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <p>{settingsBody}</p>
    </>
  )
}
