import { disclaimer, helpProvenance, pitch } from '../../app/copy'
import { PageHeader } from '../../components/ui/PageHeader'

export function HelpPage() {
  return (
    <>
      <PageHeader title="Help" />
      <p>{pitch}</p>
      <p>{disclaimer}</p>
      <p>{helpProvenance}</p>
    </>
  )
}
