import { ageInWholeYears, estimateAge, type DateOnly } from '../models/dates'
import type { PositionGroup } from '../models/positions'
import type { Player } from '../validation/schemas'

export type AgeDisplay =
  | { kind: 'exact'; years: number }
  | { kind: 'estimated'; years: number }
  | { kind: 'unknown' }
type AgeSeason = { startDate: DateOnly | null; ordinal: number }
export function displayAge(
  player: Pick<
    Player,
    'birthDate' | 'reportedAge' | 'ageReferenceSeasonOrdinal'
  >,
  season: AgeSeason,
): AgeDisplay {
  try {
    if (
      player.birthDate !== null &&
      season.startDate !== null &&
      player.birthDate <= season.startDate
    )
      return {
        kind: 'exact',
        years: ageInWholeYears(player.birthDate, season.startDate),
      }
    if (
      player.reportedAge !== null &&
      player.ageReferenceSeasonOrdinal !== null
    )
      return {
        kind: 'estimated',
        years: estimateAge(
          player.reportedAge,
          player.ageReferenceSeasonOrdinal,
          season.ordinal,
        ),
      }
  } catch {
    return { kind: 'unknown' }
  }
  return { kind: 'unknown' }
}
export function ageText(display: AgeDisplay): string {
  if (display.kind === 'unknown') return 'Unknown'
  return `${display.years} years${display.kind === 'estimated' ? ', estimated' : ''}`
}
export function sourceLabel(source: Player['source']): string {
  return {
    fictional: 'Fictional',
    imported: 'Imported',
    'user-entered': 'User-entered',
    estimated: 'Estimated',
    generated: 'Generated',
  }[source]
}
export type SquadSortKey = 'name' | 'position' | 'age' | 'value'
export type SortDirection = 'asc' | 'desc'
export function filterSquad(
  players: readonly Player[],
  query: string,
  group: 'all' | PositionGroup,
): Player[] {
  const search = query.trim().toLocaleLowerCase('en')
  return players.filter(
    (player) =>
      player.name.toLocaleLowerCase('en').includes(search) &&
      (group === 'all' || player.positionGroup === group),
  )
}
function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' })
}
export function compareSquadRows(
  left: Player,
  right: Player,
  key: SquadSortKey,
  direction: SortDirection,
  season: AgeSeason,
): number {
  let comparison = 0
  if (key === 'name') comparison = compareText(left.name, right.name)
  if (key === 'position')
    comparison =
      compareText(left.positionGroup, right.positionGroup) ||
      compareText(left.positions[0], right.positions[0])
  if (key === 'age' || key === 'value') {
    const leftAge = displayAge(left, season)
    const rightAge = displayAge(right, season)
    const a =
      key === 'value'
        ? left.marketValueCents
        : leftAge.kind === 'unknown'
          ? null
          : leftAge.years
    const b =
      key === 'value'
        ? right.marketValueCents
        : rightAge.kind === 'unknown'
          ? null
          : rightAge.years
    if (a === null && b !== null) return 1
    if (a !== null && b === null) return -1
    if (a !== null && b !== null) comparison = a - b
  }
  return (
    comparison * (direction === 'desc' ? -1 : 1) ||
    compareText(left.name, right.name) ||
    left.id.localeCompare(right.id, 'en')
  )
}
