import { Link } from 'react-router'
import { backToWelcome, notFoundBody, notFoundTitle } from '../copy'
import { ErrorState } from '../../components/ui/ErrorState'

export function NotFoundPage() {
  return (
    <>
      <ErrorState title={notFoundTitle} description={notFoundBody} />
      <Link className="touchline-focus" to="/">
        {backToWelcome}
      </Link>
    </>
  )
}
