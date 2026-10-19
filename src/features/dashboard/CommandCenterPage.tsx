import { noRecords, previewValue } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { EmptyState } from '../../components/ui/EmptyState'
import { KpiRibbon } from '../../components/ui/KpiRibbon'
import { StatusPill } from '../../components/ui/StatusPill'

const previewItems = [
  { label: 'Transfer capacity', value: previewValue },
  { label: 'Weekly wages', value: previewValue },
  { label: 'Squad', value: previewValue },
  { label: 'Registration', value: previewValue },
]

export function CommandCenterPage() {
  return (
    <>
      <SectionPage sectionId="command-center" />
      <KpiRibbon items={previewItems} />
      <EmptyState title="Activity" description={noRecords} />
      <div className="flex flex-wrap gap-3">
        <StatusPill tone="blocked" />
        <StatusPill tone="warning" />
        <StatusPill tone="informational" />
        <StatusPill tone="passed" />
      </div>
    </>
  )
}
