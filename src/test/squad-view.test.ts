import { describe, expect, it } from 'vitest'
import { dateOnlySchema } from '../domain/models/dates'
import { playerSchema } from '../domain/validation/schemas'
import {
  ageText,
  compareSquadRows,
  displayAge,
  filterSquad,
  sourceLabel,
} from '../domain/player/squad-view'
const season = { startDate: null, ordinal: 1 }
function player(overrides: Record<string, unknown> = {}) {
  return playerSchema.parse({
    id: 'player-a',
    campaignId: 'campaign-a',
    clubId: 'club-a',
    name: 'Ashbridge',
    positionGroup: 'MID',
    positions: ['CM'],
    nationalityCode: null,
    birthDate: null,
    reportedAge: 21,
    ageReferenceSeasonOrdinal: 1,
    marketValueCents: null,
    attributes: {},
    potential: null,
    source: 'fictional',
    externalSourceId: null,
    isNewgen: false,
    ...overrides,
  })
}
describe('squad display', () => {
  it('estimates age without inventing a birth date or requiring a season date', () => {
    const age = displayAge(player(), season)
    expect(age).toEqual({ kind: 'estimated', years: 21 })
    expect(ageText(age)).toBe('21 years, estimated')
  })
  it('uses exact age at the season start before a birthday', () => {
    const age = displayAge(player({ birthDate: '2000-10-20' }), {
      startDate: dateOnlySchema.parse('2026-10-19'),
      ordinal: 1,
    })
    expect(age).toEqual({ kind: 'exact', years: 25 })
    expect(ageText(age)).toBe('25 years')
  })
  it('handles missing and invalid age inputs as unknown', () => {
    expect(
      displayAge(
        player({
          birthDate: '2000-10-20',
          reportedAge: null,
          ageReferenceSeasonOrdinal: null,
        }),
        season,
      ),
    ).toEqual({ kind: 'unknown' })
    expect(
      displayAge(player({ ageReferenceSeasonOrdinal: 3 }), season),
    ).toEqual({ kind: 'unknown' })
    expect(ageText({ kind: 'unknown' })).toBe('Unknown')
  })
  it('filters trimmed names and position groups without mutating the roster', () => {
    const ash = player()
    const wind = player({
      id: 'wind',
      name: 'Windgate',
      positionGroup: 'GK',
      positions: ['GK'],
    })
    expect(filterSquad([ash, wind], ' ASH ', 'all')).toEqual([ash])
    expect(filterSquad([ash, wind], '', 'GK')).toEqual([wind])
    expect(filterSquad([ash, wind], '  ', 'all')).toEqual([ash, wind])
  })
  it.each(['asc', 'desc'] as const)(
    'keeps missing values and ages last for %s sorts',
    (direction) => {
      const known = player({ marketValueCents: 1050 })
      const missing = player({
        id: 'missing',
        name: 'A',
        reportedAge: null,
        ageReferenceSeasonOrdinal: null,
      })
      expect(
        compareSquadRows(missing, known, 'value', direction, season),
      ).toBeGreaterThan(0)
      expect(
        compareSquadRows(known, missing, 'value', direction, season),
      ).toBeLessThan(0)
      expect(
        compareSquadRows(missing, known, 'age', direction, season),
      ).toBeGreaterThan(0)
    },
  )
  it('compares display ages and uses ascending name and id ties', () => {
    const older = player({ reportedAge: 20, ageReferenceSeasonOrdinal: 1 })
    const younger = player({
      id: 'younger',
      reportedAge: 21,
      ageReferenceSeasonOrdinal: 3,
    })
    expect(
      compareSquadRows(older, younger, 'age', 'asc', {
        startDate: null,
        ordinal: 3,
      }),
    ).toBeGreaterThan(0)
    expect(
      compareSquadRows(
        player({ name: 'Player 2' }),
        player({ name: 'Player 10' }),
        'name',
        'asc',
        season,
      ),
    ).toBeLessThan(0)
    expect(
      compareSquadRows(
        player(),
        player({ id: 'player-b' }),
        'value',
        'desc',
        season,
      ),
    ).toBeLessThan(0)
  })
  it('labels every stored source', () => {
    expect(
      ['fictional', 'imported', 'user-entered', 'estimated', 'generated'].map(
        (source) => sourceLabel(player({ source }).source),
      ),
    ).toEqual([
      'Fictional',
      'Imported',
      'User-entered',
      'Estimated',
      'Generated',
    ])
  })
})
