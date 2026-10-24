import { useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router'
import type { GameClient } from '../../platform/game-client'
import { MigrationTools } from './NativeMigrationTools'
import { Campaigns } from './NativeCampaigns'
import { ScreenPage } from './NativeScreen'
import { readOnly } from './workspace-sections'

export function NativeRoutes({ client }: { client: GameClient }) {
  const [refresh, setRefresh] = useState(0)
  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text)]">
      <header className="flex flex-wrap items-center gap-4 border-b border-[var(--border)] p-4">
        <Link to="/">Touchline OS</Link>
        <Link to="/settings">Settings</Link>
        <Link to="/help">Help</Link>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <MigrationTools
          client={client}
          onImported={() => setRefresh((v) => v + 1)}
        />
        <Routes>
          <Route
            path="/"
            element={<Campaigns key={refresh} client={client} />}
          />
          <Route
            path="/settings"
            element={
              <>
                <h1>Settings</h1>
                <p>
                  Saves use native SQLite storage. Use the migration controls
                  above to import, export or back up saves.
                </p>
                <p>{readOnly}</p>
              </>
            }
          />
          <Route
            path="/help"
            element={
              <>
                <h1>Help</h1>
                <p>
                  Import a supported standalone snapshot, review its summary,
                  then confirm. Existing files are never converted or
                  overwritten.
                </p>
                <p>
                  Challenge rules describe this fictional simulation. They do
                  not certify a real competition.
                </p>
                <p>
                  Continue on the Command Center advances a standalone career
                  from July 1 to the summer deadline and then to league kickoff.
                  At kickoff, Sim Matchday previews the opponent and asks for
                  confirmation before saving all four leagues. Fixtures &
                  Results shows saved reports and tables. Season rollover
                  arrives in Phase 10.
                </p>
              </>
            }
          />
          <Route
            path="/app/:campaignId"
            element={<Navigate to="command-center" replace />}
          />
          <Route
            path="/app/:campaignId/:section"
            element={<ScreenPage key={refresh} client={client} />}
          />
          <Route
            path="*"
            element={
              <>
                <h1>Page not found</h1>
                <Link to="/">Choose a campaign</Link>
              </>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
