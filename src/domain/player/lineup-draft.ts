import { formationSlots, type FormationId } from '../graphics/pitch'
import { limits } from '../validation/limits'

export type LineupDraft = {
  name: string
  formation: FormationId
  starters: { playerId: string; slot: string; role: string | null }[]
  benchPlayerIds: string[]
}

export type PlaceCode = 'UNKNOWN_PLAYER' | 'UNKNOWN_SLOT' | 'BENCH_FULL'

export type PlaceResult =
  | { ok: true; draft: LineupDraft }
  | { ok: false; draft: LineupDraft; code: PlaceCode }

export function emptyDraft(): LineupDraft {
  return { name: '', formation: '4-3-3', starters: [], benchPlayerIds: [] }
}

export function placeOnSlot(
  draft: LineupDraft,
  playerId: string,
  slotId: string,
  rosterIds: readonly string[],
): PlaceResult {
  if (!rosterIds.includes(playerId))
    return { ok: false, draft, code: 'UNKNOWN_PLAYER' }
  if (!formationSlots(draft.formation).some((slot) => slot.id === slotId))
    return { ok: false, draft, code: 'UNKNOWN_SLOT' }
  return {
    ok: true,
    draft: {
      ...draft,
      starters: [
        ...draft.starters.filter(
          (starter) => starter.playerId !== playerId && starter.slot !== slotId,
        ),
        { playerId, slot: slotId, role: null },
      ],
      benchPlayerIds: draft.benchPlayerIds.filter((id) => id !== playerId),
    },
  }
}

export function placeOnBench(
  draft: LineupDraft,
  playerId: string,
  rosterIds: readonly string[],
): PlaceResult {
  if (!rosterIds.includes(playerId))
    return { ok: false, draft, code: 'UNKNOWN_PLAYER' }
  const alreadyBenched = draft.benchPlayerIds.includes(playerId)
  if (!alreadyBenched && draft.benchPlayerIds.length >= limits.benchMax)
    return { ok: false, draft, code: 'BENCH_FULL' }
  return {
    ok: true,
    draft: {
      ...draft,
      starters: draft.starters.filter(
        (starter) => starter.playerId !== playerId,
      ),
      benchPlayerIds: alreadyBenched
        ? draft.benchPlayerIds
        : [...draft.benchPlayerIds, playerId],
    },
  }
}

export function clearSlot(draft: LineupDraft, slotId: string): LineupDraft {
  if (!formationSlots(draft.formation).some((slot) => slot.id === slotId))
    return draft
  return {
    ...draft,
    starters: draft.starters.filter((starter) => starter.slot !== slotId),
  }
}

export function switchFormation(
  draft: LineupDraft,
  formation: FormationId,
): LineupDraft {
  return { ...draft, formation, starters: [] }
}

export type LineupProblem =
  | 'DUPLICATE_PLAYER'
  | 'DUPLICATE_SLOT'
  | 'UNKNOWN_SLOT'
  | 'BENCH_TOO_LONG'
  | 'TOO_MANY_STARTERS'
  | 'UNKNOWN_PLAYER'

export function lineupProblems(
  draft: LineupDraft,
  rosterIds: readonly string[],
): readonly LineupProblem[] {
  const problems: LineupProblem[] = []
  const playerIds = [
    ...draft.starters.map((starter) => starter.playerId),
    ...draft.benchPlayerIds,
  ]
  const slots = draft.starters.map((starter) => starter.slot)
  const validSlots = new Set(
    formationSlots(draft.formation).map((slot) => slot.id),
  )
  const roster = new Set(rosterIds)
  if (new Set(playerIds).size !== playerIds.length)
    problems.push('DUPLICATE_PLAYER')
  if (new Set(slots).size !== slots.length) problems.push('DUPLICATE_SLOT')
  if (slots.some((slot) => !validSlots.has(slot))) problems.push('UNKNOWN_SLOT')
  if (draft.benchPlayerIds.length > limits.benchMax)
    problems.push('BENCH_TOO_LONG')
  if (draft.starters.length > limits.startersMax)
    problems.push('TOO_MANY_STARTERS')
  if (playerIds.some((id) => !roster.has(id))) problems.push('UNKNOWN_PLAYER')
  return problems
}
