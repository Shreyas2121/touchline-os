import { useState } from 'react'
import { NavLink } from 'react-router'
import { workspaceSectionPath, workspaceSections } from '../../app/routes'

export function NavRail({ campaignId }: { campaignId: string }) {
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia('(max-width: 720px)').matches,
  )

  return (
    <div className="bg-[var(--surface-1)]">
      <button
        type="button"
        className="touchline-focus px-3 py-2 text-[var(--text)]"
        aria-expanded={!collapsed}
        aria-controls="section-nav"
        onClick={() => setCollapsed((current) => !current)}
      >
        {collapsed ? 'Expand navigation' : 'Collapse navigation'}
      </button>
      <nav id="section-nav" className="nav-rail" hidden={collapsed}>
        <ul className="m-0 flex list-none flex-col gap-1 p-3">
          {workspaceSections.map((section) => (
            <li key={section.id}>
              <NavLink
                to={workspaceSectionPath(campaignId, section.id)}
                className={({ isActive }) =>
                  isActive ? 'touchline-focus font-semibold' : 'touchline-focus'
                }
              >
                {section.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
