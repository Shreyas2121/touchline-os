import { noRecords } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { EmptyState } from '../../components/ui/EmptyState'

export function MatchJournalPage() {
  return (
    <>
      <SectionPage sectionId="matches" />
      <EmptyState title="Journal" description={noRecords} />
    </>
  )
}
