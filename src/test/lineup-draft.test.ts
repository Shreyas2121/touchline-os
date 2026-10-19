import { describe, expect, it } from 'vitest'
import {
  clearSlot,
  emptyDraft,
  lineupProblems,
  placeOnBench,
  placeOnSlot,
  switchFormation,
  type LineupDraft,
  type PlaceResult,
} from '../domain/player/lineup-draft'

const roster = Array.from({ length: 15 }, (_, index) => `p${index + 1}`)
function placed(result: PlaceResult): LineupDraft {
  expect(result.ok).toBe(true)
  return result.draft
}

describe('lineup drafts', () => {
  it('starts empty in 4-3-3 with independent arrays', () => {
    const draft = emptyDraft()
    expect(draft).toEqual({
      name: '',
      formation: '4-3-3',
      starters: [],
      benchPlayerIds: [],
    })
    draft.benchPlayerIds.push('p1')
    expect(emptyDraft().benchPlayerIds).toEqual([])
  })
  it('moves a player between slots and unassigns a displaced occupant', () => {
    const initial = emptyDraft()
    const first = placed(placeOnSlot(initial, 'p1', 'gk', roster))
    const moved = placed(placeOnSlot(first, 'p1', 'st', roster))
    expect(moved.starters).toEqual([{ playerId: 'p1', slot: 'st', role: null }])
    const replaced = placed(placeOnSlot(moved, 'p2', 'st', roster))
    expect(replaced.starters).toEqual([
      { playerId: 'p2', slot: 'st', role: null },
    ])
    expect(replaced.benchPlayerIds).toEqual([])
    expect(first.starters).toEqual([{ playerId: 'p1', slot: 'gk', role: null }])
    expect(initial.starters).toEqual([])
    expect(lineupProblems(replaced, roster)).toEqual([])
  })
  it('removes every other placement of a player, including the bench, on placement', () => {
    const draft: LineupDraft = {
      ...emptyDraft(),
      name: 'First team',
      starters: [
        { playerId: 'p1', slot: 'gk', role: 'old role' },
        { playerId: 'p1', slot: 'cm', role: null },
        { playerId: 'p2', slot: 'st', role: null },
      ],
      benchPlayerIds: ['p1', 'p3'],
    }
    const before = structuredClone(draft)
    const result = placed(placeOnSlot(draft, 'p1', 'st', roster))
    expect(result).toMatchObject({
      name: 'First team',
      starters: [{ playerId: 'p1', slot: 'st', role: null }],
      benchPlayerIds: ['p3'],
    })
    expect(draft).toEqual(before)
  })
  it('moves a starter to the bench once and can move them back onto the pitch', () => {
    const first = placed(placeOnSlot(emptyDraft(), 'p1', 'gk', roster))
    const bench = placed(placeOnBench(first, 'p1', roster))
    expect(bench.starters).toEqual([])
    expect(bench.benchPlayerIds).toEqual(['p1'])
    const again = placed(placeOnBench(bench, 'p1', roster))
    expect(again.benchPlayerIds).toBe(bench.benchPlayerIds)
    expect(again.benchPlayerIds).toEqual(['p1'])
    const back = placed(placeOnSlot(again, 'p1', 'gk', roster))
    expect(back.benchPlayerIds).toEqual([])
    expect(back.starters).toEqual(first.starters)
  })
  it('accepts twelve bench players and refuses a thirteenth without moving their starter', () => {
    let draft = placed(placeOnSlot(emptyDraft(), 'p13', 'st', roster))
    for (const playerId of roster.slice(0, 12))
      draft = placed(placeOnBench(draft, playerId, roster))
    expect(draft.benchPlayerIds).toHaveLength(12)
    const before = structuredClone(draft)
    const rejected = placeOnBench(draft, 'p13', roster)
    expect(rejected).toEqual({ ok: false, code: 'BENCH_FULL', draft })
    expect(rejected.draft).toBe(draft)
    expect(draft).toEqual(before)
    expect(placed(placeOnBench(draft, 'p1', roster)).benchPlayerIds).toEqual(
      draft.benchPlayerIds,
    )
  })
  it('switches formation and keeps the draft name and bench', () => {
    const draft = {
      ...placed(placeOnSlot(emptyDraft(), 'p1', 'gk', roster)),
      name: 'First team',
      benchPlayerIds: ['p2'],
    }
    const switched = switchFormation(draft, '4-4-2')
    expect(switched).toEqual({
      name: 'First team',
      formation: '4-4-2',
      starters: [],
      benchPlayerIds: ['p2'],
    })
    expect(draft.starters).toHaveLength(1)
  })
  it('rejects a slot from another formation or a player outside the roster', () => {
    const draft = emptyDraft()
    const unknownSlot = placeOnSlot(draft, 'p1', 'rst', roster)
    expect(unknownSlot).toMatchObject({ ok: false, code: 'UNKNOWN_SLOT' })
    expect(unknownSlot.draft).toBe(draft)
    for (const result of [
      placeOnSlot(draft, 'foreign', 'st', roster),
      placeOnBench(draft, 'foreign', roster),
    ]) {
      expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_PLAYER' })
      expect(result.draft).toBe(draft)
    }
  })
  it('clears only the selected slot and ignores an unknown slot', () => {
    const draft = placed(
      placeOnSlot(
        placed(placeOnSlot(emptyDraft(), 'p1', 'gk', roster)),
        'p2',
        'st',
        roster,
      ),
    )
    expect(clearSlot(draft, 'gk').starters).toEqual([
      { playerId: 'p2', slot: 'st', role: null },
    ])
    expect(draft.starters).toHaveLength(2)
    expect(clearSlot(draft, 'rst')).toBe(draft)
  })
  it('reports duplicate players across or within starters and bench', () => {
    const starter = placed(placeOnSlot(emptyDraft(), 'p1', 'gk', roster))
    expect(
      lineupProblems({ ...starter, benchPlayerIds: ['p1'] }, roster),
    ).toEqual(['DUPLICATE_PLAYER'])
    expect(
      lineupProblems({ ...emptyDraft(), benchPlayerIds: ['p1', 'p1'] }, roster),
    ).toEqual(['DUPLICATE_PLAYER'])
    expect(
      lineupProblems(
        {
          ...starter,
          starters: [
            ...starter.starters,
            { playerId: 'p1', slot: 'st', role: null },
          ],
        },
        roster,
      ),
    ).toEqual(['DUPLICATE_PLAYER'])
  })
  it('reports duplicate slots and slots outside the chosen formation', () => {
    const draft: LineupDraft = {
      ...emptyDraft(),
      starters: [
        { playerId: 'p1', slot: 'gk', role: null },
        { playerId: 'p2', slot: 'gk', role: null },
      ],
    }
    expect(lineupProblems(draft, roster)).toEqual(['DUPLICATE_SLOT'])
    expect(
      lineupProblems(
        {
          ...emptyDraft(),
          starters: [{ playerId: 'p1', slot: 'rst', role: null }],
        },
        roster,
      ),
    ).toEqual(['UNKNOWN_SLOT'])
  })
  it('reports excessive starters, bench size, and foreign players', () => {
    const draft: LineupDraft = {
      ...emptyDraft(),
      starters: Array.from({ length: 12 }, (_, index) => ({
        playerId: `p${index + 1}`,
        slot: 'gk',
        role: null,
      })),
      benchPlayerIds: [...roster.slice(0, 12), 'foreign'],
    }
    expect(lineupProblems(draft, roster)).toEqual([
      'DUPLICATE_PLAYER',
      'DUPLICATE_SLOT',
      'BENCH_TOO_LONG',
      'TOO_MANY_STARTERS',
      'UNKNOWN_PLAYER',
    ])
    expect(
      lineupProblems(
        {
          ...emptyDraft(),
          starters: [{ playerId: 'foreign', slot: 'gk', role: null }],
        },
        roster,
      ),
    ).toEqual(['UNKNOWN_PLAYER'])
    expect(
      lineupProblems({ ...emptyDraft(), benchPlayerIds: ['foreign'] }, roster),
    ).toEqual(['UNKNOWN_PLAYER'])
    expect(lineupProblems(emptyDraft(), roster)).toEqual([])
  })
})
