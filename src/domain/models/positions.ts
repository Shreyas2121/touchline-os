export const positionGroups = ['GK', 'DEF', 'MID', 'FWD', 'UNKNOWN'] as const

export const positions = [
  'GK',
  'CB',
  'LB',
  'RB',
  'LWB',
  'RWB',
  'CDM',
  'CM',
  'CAM',
  'LM',
  'RM',
  'LW',
  'RW',
  'ST',
  'CF',
  'UNKNOWN',
] as const

export type PositionGroup = (typeof positionGroups)[number]
export type Position = (typeof positions)[number]

export const unknownPositionMessage = 'Unknown position.'

const groupByPosition = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  LWB: 'DEF',
  RWB: 'DEF',
  CDM: 'MID',
  CM: 'MID',
  CAM: 'MID',
  LM: 'MID',
  RM: 'MID',
  LW: 'FWD',
  RW: 'FWD',
  ST: 'FWD',
  CF: 'FWD',
  UNKNOWN: 'UNKNOWN',
} as const satisfies Record<Position, PositionGroup>

export function positionGroupFor(position: Position): PositionGroup {
  const group = groupByPosition[position]
  if (group === undefined) throw new RangeError(unknownPositionMessage)
  return group
}
