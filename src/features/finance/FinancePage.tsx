import { noRecords } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { EmptyState } from '../../components/ui/EmptyState'

export function FinancePage() {
  return (
    <>
      <SectionPage sectionId="finance" />
      <EmptyState title="Ledger" description={noRecords} />
    </>
  )
}
