import { describe, expect, it } from 'vitest'
import datesSource from '../domain/models/dates.ts?raw'
import prngSource from '../domain/seed/prng.ts?raw'
import calendarSource from '../domain/simulation/calendar.ts?raw'
import randomSource from '../domain/simulation/random.ts?raw'
import { previewTimeAdvance, seasonDates } from '../domain/simulation/calendar'
import {
  createEventStream,
  deriveEventSeed,
  eventStreamKey,
  simulationEventKinds,
  type SimulationEventKind,
} from '../domain/simulation/random'
import { simulationStateSchema } from '../domain/simulation/schemas'
import { seasonSchema } from '../domain/validation/schemas'
import { seasonA } from './fixtures/campaign'
import { simulationState } from './fixtures/simulation'

const rootSeed = 'restore-safe-world'
const version = '1'
const fixtureKeys = [
  'season:2026',
  'league:01',
  'round:01',
  'club:01',
  'club:02',
] as const
const sample = (stream: () => number) =>
  Array.from({ length: 8 }, () => stream())

describe('named deterministic streams', () => {
  it('repeats a seed and stream from identical ordered inputs', () => {
    const seed = deriveEventSeed(rootSeed, version, 'fixture', fixtureKeys)
    expect(seed).toBe(1591205383)
    expect(
      deriveEventSeed(rootSeed, version, 'fixture', [...fixtureKeys]),
    ).toBe(seed)
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThanOrEqual(0xffff_ffff)
    const first = sample(
      createEventStream(rootSeed, version, 'fixture', fixtureKeys),
    )
    expect(first.slice(0, 4)).toEqual([
      0.18941857828758657, 0.14025505352765322, 0.7372963556554168,
      0.17496767896227539,
    ])
    expect(
      sample(createEventStream(rootSeed, version, 'fixture', fixtureKeys)),
    ).toEqual(first)
    for (const draw of first) {
      expect(draw).toBeGreaterThanOrEqual(0)
      expect(draw).toBeLessThan(1)
    }
  })

  it('separates namespaces and keys without sharing draw state', () => {
    const baseline = sample(
      createEventStream(rootSeed, version, 'fixture', fixtureKeys),
    )
    const seeds = simulationEventKinds.map((kind) =>
      deriveEventSeed(rootSeed, version, kind, fixtureKeys),
    )
    expect(new Set(seeds).size).toBe(simulationEventKinds.length)
    for (const kind of simulationEventKinds) {
      if (kind === 'fixture') continue
      const stream = createEventStream(rootSeed, version, kind, fixtureKeys)
      for (let draw = 0; draw < 100; draw++) stream()
    }
    const anotherFixture = createEventStream(rootSeed, version, 'fixture', [
      'season:2026',
      'round:02',
    ])
    for (let draw = 0; draw < 100; draw++) anotherFixture()
    expect(
      sample(createEventStream(rootSeed, version, 'fixture', fixtureKeys)),
    ).toEqual(baseline)
    expect(
      sample(
        createEventStream('another-world', version, 'fixture', fixtureKeys),
      ),
    ).not.toEqual(baseline)
    expect(
      sample(
        createEventStream(
          rootSeed,
          version,
          'fixture',
          [...fixtureKeys].reverse(),
        ),
      ),
    ).not.toEqual(baseline)
  })

  it.each([
    [
      ['ab', 'c'],
      ['a', 'bc'],
    ],
    [
      ['a:b', 'c'],
      ['a', 'b:c'],
    ],
    [
      ['a\0b', 'c'],
      ['a', 'b\0c'],
    ],
    [['a","b'], ['a', 'b']],
    [
      ['club:01', 'club:02'],
      ['club:02', 'club:01'],
    ],
  ])(
    'serializes ambiguous or reordered key lists independently: %j / %j',
    (left, right) => {
      expect(eventStreamKey(rootSeed, version, 'market', left)).not.toBe(
        eventStreamKey(rootSeed, version, 'market', right),
      )
      expect(deriveEventSeed(rootSeed, version, 'market', left)).not.toBe(
        deriveEventSeed(rootSeed, version, 'market', right),
      )
    },
  )

  it('also separates root seed, namespace and logical-key components', () => {
    expect(
      eventStreamKey('seed', version, 'world', ['fixture', 'key']),
    ).not.toBe(eventStreamKey('seed', version, 'fixture', ['world', 'key']))
    expect(eventStreamKey('seed:world', version, 'world', ['key'])).not.toBe(
      eventStreamKey('seed', version, 'world', ['world:key']),
    )
    expect(eventStreamKey(rootSeed, version, 'world', [])).toBe(
      JSON.stringify(['simulation-stream', '1', rootSeed, 'world', []]),
    )
  })

  it('keeps calendar seeds and previews stable across restore ID remapping and audit-time changes', () => {
    const season = seasonSchema.parse({ ...seasonA, ...seasonDates(2026) })
    const restoredSeason = seasonSchema.parse({
      ...season,
      id: 'restored-season',
      campaignId: 'restored-campaign',
      openedAt: '2099-12-31T23:59:59.999Z',
    })
    const restoredState = simulationStateSchema.parse({
      ...simulationState,
      id: 'restored-state',
      campaignId: 'restored-campaign',
      activeSeasonId: restoredSeason.id,
    })
    expect(previewTimeAdvance(restoredState, restoredSeason)).toEqual(
      previewTimeAdvance(simulationState, season),
    )
    const original = {
      campaignId: simulationState.campaignId,
      playerId: 'player-a',
      actionId: 'action-a',
      createdAt: season.openedAt,
      simulationKey: 'player:01',
    }
    const restored = {
      ...original,
      campaignId: restoredState.campaignId,
      playerId: 'restored-player',
      actionId: 'restored-action',
      createdAt: restoredSeason.openedAt,
    }
    const developmentSeed = (row: typeof original) =>
      deriveEventSeed(rootSeed, version, 'development', [
        'season:2026:midseason',
        row.simulationKey,
      ])
    expect(developmentSeed(restored)).toBe(developmentSeed(original))
  })

  it.each([
    { seed: '' },
    { seed: ' ' },
    { seed: 's'.repeat(121) },
    { version: '2' },
    { kind: 'unknown' },
    { keys: [''] },
    { keys: ['k'.repeat(201)] },
    { keys: Array.from({ length: 33 }, () => 'key') },
  ])('rejects invalid or unsupported stream inputs %j', (changes) => {
    const input = {
      seed: rootSeed,
      version,
      kind: 'world',
      keys: [] as string[],
      ...changes,
    }
    expect(() =>
      deriveEventSeed(
        input.seed,
        input.version,
        input.kind as SimulationEventKind,
        input.keys,
      ),
    ).toThrow()
    expect(() =>
      createEventStream(
        input.seed,
        input.version,
        input.kind as SimulationEventKind,
        input.keys,
      ),
    ).toThrow()
  })

  it('contains no ambient randomness, clocks or persistence dependencies', () => {
    for (const source of [
      datesSource,
      prngSource,
      calendarSource,
      randomSource,
    ]) {
      expect(source).not.toMatch(
        /Math\.random\s*\(|\bDate\s*\(|\bDate\.(?:now|parse|UTC)\s*\(|performance\.now\s*\(/,
      )
      expect(source).not.toMatch(
        /\b(?:indexedDB|localStorage|Dexie)\b|from\s+['"][^'"]*\/data\//,
      )
    }
  })
})
