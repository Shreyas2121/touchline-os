import { Link, Outlet, useParams } from 'react-router'
import { workspaceSectionPath, workspaceSections } from '../routes'

export function WorkspaceLayout() {
  const { campaignId } = useParams()

  return (
    <>
      <a href="#main">Skip to content</a>
      {campaignId ? (
        <nav>
          <ul>
            {workspaceSections.map((section) => (
              <li key={section.id}>
                <Link to={workspaceSectionPath(campaignId, section.id)}>
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <main id="main">
        <Outlet />
      </main>
    </>
  )
}
