import { constitutionNote } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'

const ruleIds = [
  'SELL_TO_BUY',
  'MAX_SIGNING_AGE',
  'WAGE_TIER_CAP',
  'PRESTIGE_BID_SALE',
  'REGISTRATION_QUOTA',
]

export function ConstitutionPage() {
  return (
    <>
      <SectionPage sectionId="constitution" />
      <ul>
        {ruleIds.map((ruleId) => (
          <li key={ruleId}>{ruleId}</li>
        ))}
      </ul>
      <p>{constitutionNote}</p>
    </>
  )
}
