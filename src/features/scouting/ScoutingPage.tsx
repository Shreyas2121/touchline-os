import { noRecords } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { EmptyState } from '../../components/ui/EmptyState'

export function ScoutingPage() {
  return (
    <>
      <SectionPage sectionId="scouting" />
      <EmptyState title="Signals" description={noRecords} />
    </>
  )
}
