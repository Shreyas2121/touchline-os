import { pitchPreview } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'

export function TacticsPage() {
  return (
    <>
      <SectionPage sectionId="tactics" />
      <section aria-label="Pitch preview">
        <h2>Pitch preview</h2>
        <p>{pitchPreview}</p>
      </section>
    </>
  )
}
