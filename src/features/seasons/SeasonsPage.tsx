import { noRecords } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { EmptyState } from '../../components/ui/EmptyState'

export function SeasonsPage() {
  return (
    <>
      <SectionPage sectionId="seasons" />
      <EmptyState title="Timeline" description={noRecords} />
    </>
  )
}
