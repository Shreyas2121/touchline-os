import { Link } from 'react-router'
import {
  backToWelcome,
  missingCampaignBody,
  missingCampaignTitle,
} from '../copy'
import { ErrorState } from '../../components/ui/ErrorState'

export function MissingCampaignPage() {
  return (
    <>
      <ErrorState
        title={missingCampaignTitle}
        description={missingCampaignBody}
      />
      <Link className="touchline-focus" to="/">
        {backToWelcome}
      </Link>
    </>
  )
}
