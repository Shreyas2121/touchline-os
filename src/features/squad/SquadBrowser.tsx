import { useMemo, useState } from 'react'
import {
  flexRender,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  positionGroups,
  type PositionGroup,
} from '../../domain/models/positions'
import { formatMoneyUnknown } from '../../domain/models/money'
import {
  ageText,
  compareSquadRows,
  displayAge,
  filterSquad,
  sourceLabel,
  type SortDirection,
  type SquadSortKey,
} from '../../domain/player/squad-view'
import type { Player, Season } from '../../domain/validation/schemas'
const features = tableFeatures({})
export function SquadBrowser({
  players,
  season,
}: {
  players: readonly Player[]
  season?: Pick<Season, 'startDate' | 'ordinal'>
}) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<'all' | PositionGroup>('all')
  const [sort, setSort] = useState<{
    key: SquadSortKey
    direction: SortDirection
  }>({ key: 'name', direction: 'asc' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const data = useMemo(
    () =>
      filterSquad(players, query, group).sort((left, right) =>
        compareSquadRows(
          left,
          right,
          sort.key,
          sort.direction,
          season ?? { startDate: null, ordinal: 0 },
        ),
      ),
    [players, query, group, sort, season],
  )
  const columns = useMemo<ColumnDef<typeof features, Player>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => row.original.name,
      },
      {
        id: 'position',
        header: 'Position',
        cell: ({ row }) => row.original.positions.join(', '),
      },
      {
        id: 'age',
        header: 'Age',
        cell: ({ row }) =>
          ageText(
            season ? displayAge(row.original, season) : { kind: 'unknown' },
          ),
      },
      { id: 'wage', header: 'Wage', cell: () => 'Unknown' },
      {
        id: 'value',
        header: 'Value',
        cell: ({ row }) => formatMoneyUnknown(row.original.marketValueCents),
      },
      { id: 'tier', header: 'Tier', cell: () => 'Unknown' },
      { id: 'contract', header: 'Contract end', cell: () => 'Unknown' },
      { id: 'minutes', header: 'Minutes', cell: () => 'Unknown' },
      {
        id: 'source',
        header: 'Source',
        cell: ({ row }) => sourceLabel(row.original.source),
      },
    ],
    [season],
  )
  const table = useTable({
    features,
    data,
    columns,
    getRowId: (player) => player.id,
  })
  const selected = players.find((player) => player.id === selectedId)
  function changeSort(key: SquadSortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }
  return (
    <>
      <label>
        Search players
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label>
        Position group
        <select
          value={group}
          onChange={(event) =>
            setGroup(event.target.value as 'all' | PositionGroup)
          }
        >
          <option value="all">All</option>
          {positionGroups.map((position) => (
            <option key={position}>{position}</option>
          ))}
        </select>
      </label>
      <table>
        <caption>Squad</caption>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const key = header.column.id
                const sortable =
                  key === 'name' ||
                  key === 'position' ||
                  key === 'age' ||
                  key === 'value'
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sortable
                        ? sort.key === key
                          ? sort.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                        : undefined
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        aria-label={`Sort by ${key}`}
                        onClick={() => changeSort(key)}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td key={cell.id}>
                  {cell.column.id === 'name' ? (
                    <button
                      type="button"
                      aria-label={`Select ${row.original.name}`}
                      aria-pressed={selectedId === row.original.id}
                      onClick={() => setSelectedId(row.original.id)}
                    >
                      {row.original.name}
                    </button>
                  ) : (
                    flexRender(cell.column.columnDef.cell, cell.getContext())
                  )}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={9}>
                {players.length === 0
                  ? 'No players at this club.'
                  : 'No players match this search.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {selected && (
        <section aria-label="Selected player">
          <h2>{selected.name}</h2>
          <p>{selected.positions[0]}</p>
          <p>This build does not edit players yet.</p>
        </section>
      )}
    </>
  )
}
