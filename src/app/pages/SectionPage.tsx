import { PageHeader } from '../../components/ui/PageHeader'
import { workspaceSections, type WorkspaceSectionId } from '../routes'

export function SectionPage({ sectionId }: { sectionId: WorkspaceSectionId }) {
  const section = workspaceSections.find((item) => item.id === sectionId)

  if (!section) {
    throw new Error(`Unknown section: ${sectionId}`)
  }

  return <PageHeader title={section.label} />
}
