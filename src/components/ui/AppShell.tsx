import type { ReactNode } from 'react'
import { Banner } from './Banner'
import { NavRail } from './NavRail'
import { TopBar } from './TopBar'

export function AppShell({
  campaignId,
  banner,
  children,
}: {
  campaignId?: string
  banner?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="grid min-h-screen grid-cols-[auto_1fr]">
        {campaignId ? <NavRail campaignId={campaignId} /> : null}
        <div>
          <TopBar campaignId={campaignId} />
          {banner ? <Banner>{banner}</Banner> : null}
          <main id="main" tabIndex={-1} className="grid grid-cols-12 gap-4 p-4">
            <div className="col-span-12">{children}</div>
          </main>
        </div>
      </div>
    </>
  )
}
