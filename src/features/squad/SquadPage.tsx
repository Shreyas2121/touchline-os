import { noRecords } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'

const columns = [
  'Name',
  'Position',
  'Age',
  'Wage',
  'Value',
  'Tier',
  'Contract end',
  'Minutes',
]

export function SquadPage() {
  return (
    <>
      <SectionPage sectionId="squad" />
      <table>
        <caption>Squad</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={8}>{noRecords}</td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
