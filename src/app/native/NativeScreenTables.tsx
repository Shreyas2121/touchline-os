import { useState, type ReactNode } from 'react'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import type { Screen } from '../../platform/generated/Screen'
import type { SnapshotTables } from '../../platform/generated/SnapshotTables'
import type { GameClient } from '../../platform/game-client'
import { NativeDevelopmentHistory } from './NativeLifecycle'

type TableName = keyof SnapshotTables
const tables: Partial<Record<Screen, TableName[]>> = {
  'command-center': ['offers', 'auditEvents'],
  squad: ['players'],
  tactics: ['lineups', 'players'],
  transfers: ['players', 'offers', 'transfers'],
  finance: ['ledgerEntries'],
  registration: ['registrations', 'players'],
  scouting: ['shortlistItems', 'scoutingReports', 'developmentPlans'],
  matches: [],
  seasons: ['seasons'],
  constitution: ['constitutions'],
}
const labels: Partial<Record<TableName, string>> = {
  players: 'Players',
  lineups: 'Saved lineups',
  offers: 'Offer inbox',
  transfers: 'Transfers',
  ledgerEntries: 'Ledger',
  registrations: 'Registration',
  shortlistItems: 'Shortlist',
  scoutingReports: 'Scouting reports',
  developmentPlans: 'Development notes',
  seasons: 'Seasons',
  constitutions: 'Constitution versions',
  clubs: 'Clubs',
  leagues: 'Leagues',
  auditEvents: 'Recent activity',
}
const columns: Partial<Record<TableName, string[]>> = {
  players: [
    'name',
    'positions',
    'age',
    'nationalityCode',
    'weeklyWageCents',
    'marketValueCents',
    'squadTier',
    'expiresOn',
    'availability',
    'minutes',
    'goals',
    'assists',
    'source',
  ],
  lineups: ['name', 'formation', 'starters', 'benchPlayerIds', 'updatedAt'],
  offers: [
    'playerId',
    'bidderClubId',
    'feeCents',
    'status',
    'receivedOn',
    'resolvedOn',
  ],
  transfers: [
    'playerId',
    'kind',
    'fromClubId',
    'toClubId',
    'feeCents',
    'effectiveOn',
  ],
  ledgerEntries: [
    'effectiveOn',
    'kind',
    'amountCents',
    'note',
    'reversesEntryId',
  ],
  registrations: [
    'playerId',
    'competitionKey',
    'status',
    'homegrownClub',
    'homegrownNation',
    'ageExempt',
    'provenance',
  ],
  shortlistItems: ['playerId', 'priority', 'status', 'notes', 'addedAt'],
  scoutingReports: [
    'playerId',
    'archetype',
    'confidence',
    'observations',
    'source',
    'createdAt',
  ],
  developmentPlans: ['playerId', 'targetRole', 'notes', 'status'],
  seasons: ['label', 'ordinal', 'status', 'startDate', 'endDate', 'closedAt'],
  constitutions: ['version', 'rules', 'updatedAt'],
  clubs: [
    'name',
    'shortName',
    'leagueId',
    'prestige',
    'academyTier',
    'scoutingRegion',
    'colors',
  ],
  leagues: ['name', 'countryCode', 'tier'],
  auditEvents: ['createdAt', 'actionType', 'summary'],
}
function label(key: string) {
  return key
    .replace(/Cents$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
}
function Value({
  value,
  field,
  names = {},
}: {
  value: unknown
  field?: string
  names?: Record<string, string>
}): ReactNode {
  if (value === null || value === undefined) return 'Unknown'
  if (field?.endsWith('Cents') && typeof value === 'number')
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value / 100)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' || typeof value === 'number')
    return names[String(value)] ?? String(value)
  if (Array.isArray(value))
    return value.length ? (
      <ul>
        {value.map((v: unknown, i: number) => (
          <li key={i}>
            <Value value={v} names={names} />
          </li>
        ))}
      </ul>
    ) : (
      'None'
    )
  if (typeof value === 'object')
    return (
      <dl>
        {Object.entries(value).map(([key, v]) => (
          <div key={key}>
            <dt>{label(key)}</dt>
            <dd>
              <Value value={v} field={key} names={names} />
            </dd>
          </div>
        ))}
      </dl>
    )
  return 'Unknown'
}
export function NativeScreenTables({
  model,
  screen,
  client,
}: {
  model: ScreenModel
  screen: Screen
  client?: GameClient
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const player = model.rows.players.find((p) => p.id === selected)
  return (
    <>
      {(tables[screen] ?? []).map((table) => {
        const rows = model.rows[table] as unknown as Record<string, unknown>[]
        const fields = columns[table] ?? []
        return (
          <section key={table} className="space-y-3 overflow-x-auto">
            <table className="w-full text-left">
              <caption className="text-left font-semibold">
                {labels[table]} ({model.totals[table] ?? rows.length})
              </caption>
              <thead>
                <tr>
                  {fields.map((field) => (
                    <th key={field} className="p-2">
                      {label(field)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const fact = model.playerFacts.find(
                    (f) => f.playerId === row.id,
                  )
                  const contract = model.rows.contracts.find(
                    (c) => c.playerId === row.id && c.clubId === row.clubId,
                  )
                  const display =
                    table === 'players' ? { ...row, ...contract, ...fact } : row
                  return (
                    <tr
                      key={String(row.id ?? i)}
                      className="border-t border-[var(--border)]"
                    >
                      {fields.map((field) => (
                        <td key={field} className="p-2 align-top">
                          {table === 'players' && field === 'name' ? (
                            <button
                              className="touchline-focus underline"
                              onClick={() => setSelected(String(row.id))}
                            >
                              {String(row.name)}
                            </button>
                          ) : (
                            <Value
                              value={display[field]}
                              field={field}
                              names={model.labels}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={fields.length} className="p-3">
                      No {labels[table]?.toLowerCase()} on this page.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )
      })}
      {player && (
        <section
          aria-label="Player profile"
          className="space-y-3 rounded-lg border border-[var(--border)] p-4"
        >
          <h2>{player.name}</h2>
          <p>
            {model.playerFacts.find((f) => f.playerId === player.id)?.age ??
              'Unknown age'}{' '}
            · {player.source}
          </p>
          <Value value={player} />
          <NativeDevelopmentHistory
            client={client}
            campaignId={model.rows.campaigns[0]!.id}
            playerId={player.id}
            revision={model.revision}
            fallback={(model.rows.developmentSnapshots ?? []).filter(
              (s) => s.playerId === player.id,
            )}
          />
          <Value
            value={model.rows.playerSimulationStates.find(
              (p) => p.playerId === player.id,
            )}
          />
          <button onClick={() => setSelected(null)}>Close profile</button>
        </section>
      )}
    </>
  )
}
