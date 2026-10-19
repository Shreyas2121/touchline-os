import { noRecords } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { EmptyState } from '../../components/ui/EmptyState'

export function TransfersPage() {
  return (
    <>
      <SectionPage sectionId="transfers" />
      <EmptyState title="Shortlist" description={noRecords} />
      <EmptyState title="Offers" description={noRecords} />
    </>
  )
}
