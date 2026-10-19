export type PitchLine = { id: string; d: string }

const lines: readonly PitchLine[] = [
  { id: 'touchline', d: 'M20 25H660V1025H20Z' },
  { id: 'halfway', d: 'M20 525H660' },
  {
    id: 'center-circle',
    d: 'M431.5 525a91.5 91.5 0 1 0-183 0a91.5 91.5 0 1 0 183 0Z',
  },
  { id: 'penalty-top', d: 'M138 25V190H542V25' },
  { id: 'penalty-bottom', d: 'M138 1025V860H542V1025' },
  { id: 'six-yard-top', d: 'M248 25V80H432V25' },
  { id: 'six-yard-bottom', d: 'M248 1025V970H432V1025' },
  { id: 'goal-top', d: 'M304 25V8H376V25' },
  { id: 'goal-bottom', d: 'M304 1025V1042H376V1025' },
]

export function pitchLinePaths(): readonly PitchLine[] {
  return lines
}

export type FormationId = '4-3-3' | '4-2-3-1' | '4-4-2' | '3-5-2'

export type FormationSlot = {
  id: string
  label: string
  group: 'GK' | 'DEF' | 'MID' | 'FWD'
  x: number
  y: number
}

function slot(
  id: string,
  group: FormationSlot['group'],
  x: number,
  y: number,
): FormationSlot {
  return { id, label: id.toUpperCase(), group, x, y }
}

const backLine = [
  slot('gk', 'GK', 50, 90),
  slot('rb', 'DEF', 82, 72),
  slot('rcb', 'DEF', 64, 76),
  slot('lcb', 'DEF', 36, 76),
  slot('lb', 'DEF', 18, 72),
]

const formations: Record<FormationId, readonly FormationSlot[]> = {
  '4-3-3': [
    ...backLine,
    slot('rcm', 'MID', 66, 52),
    slot('cm', 'MID', 50, 58),
    slot('lcm', 'MID', 34, 52),
    slot('rw', 'FWD', 78, 28),
    slot('st', 'FWD', 50, 20),
    slot('lw', 'FWD', 22, 28),
  ],
  '4-2-3-1': [
    ...backLine,
    slot('rdm', 'MID', 62, 62),
    slot('ldm', 'MID', 38, 62),
    slot('rw', 'FWD', 78, 40),
    slot('cam', 'MID', 50, 42),
    slot('lw', 'FWD', 22, 40),
    slot('st', 'FWD', 50, 20),
  ],
  '4-4-2': [
    ...backLine,
    slot('rm', 'MID', 82, 48),
    slot('rcm', 'MID', 62, 54),
    slot('lcm', 'MID', 38, 54),
    slot('lm', 'MID', 18, 48),
    slot('rst', 'FWD', 62, 22),
    slot('lst', 'FWD', 38, 22),
  ],
  '3-5-2': [
    slot('gk', 'GK', 50, 90),
    slot('rcb', 'DEF', 66, 74),
    slot('cb', 'DEF', 50, 78),
    slot('lcb', 'DEF', 34, 74),
    slot('rwb', 'DEF', 86, 48),
    slot('rcm', 'MID', 62, 54),
    slot('cm', 'MID', 50, 60),
    slot('lcm', 'MID', 38, 54),
    slot('lwb', 'DEF', 14, 48),
    slot('rst', 'FWD', 62, 22),
    slot('lst', 'FWD', 38, 22),
  ],
}

export function formationSlots(
  formation: FormationId,
): readonly FormationSlot[] {
  return formations[formation]
}
