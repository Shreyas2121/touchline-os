import { SectionPage } from '../../app/pages/SectionPage'
import { StatusPill } from '../../components/ui/StatusPill'

export function CommandCenterPage() {
  return (
    <>
      <SectionPage sectionId="command-center" />
      <div className="flex flex-wrap gap-3">
        <StatusPill tone="blocked" />
        <StatusPill tone="warning" />
        <StatusPill tone="informational" />
        <StatusPill tone="passed" />
      </div>
    </>
  )
}
