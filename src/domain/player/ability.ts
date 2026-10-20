import { unknownPositionMessage, type PositionGroup } from '../models/positions'

export const attributeNames = [
  'pace',
  'finishing',
  'passing',
  'dribbling',
  'defending',
  'physical',
] as const

export type AttributeName = (typeof attributeNames)[number]
export type AttributeRatings = Record<AttributeName, number>

/**
 * Fictional gameplay heuristics, not measured football statistics.
 * Weights are integer percents and sum to 100.
 * Ability is floor(sum(attribute * weight) / 100), an integer from 0 to 100.
 * Goalkeeper weights give finishing 0 so outfield finishing is not keeper ability.
 * A goalkeeper's role ability is that rating.
 */
export const outfieldRoleWeights = {
  DEF: {
    pace: 10,
    finishing: 5,
    passing: 15,
    dribbling: 10,
    defending: 40,
    physical: 20,
  },
  MID: {
    pace: 15,
    finishing: 15,
    passing: 25,
    dribbling: 20,
    defending: 10,
    physical: 15,
  },
  FWD: {
    pace: 20,
    finishing: 35,
    passing: 10,
    dribbling: 20,
    defending: 5,
    physical: 10,
  },
} as const satisfies Record<
  'DEF' | 'MID' | 'FWD',
  Record<AttributeName, number>
>

export const goalkeeperWeights = {
  pace: 10,
  finishing: 0,
  passing: 25,
  dribbling: 5,
  defending: 30,
  physical: 30,
} as const satisfies Record<AttributeName, number>

function weighted(
  attributes: AttributeRatings,
  weights: Record<AttributeName, number>,
): number {
  let total = 0
  for (const name of attributeNames) {
    total += attributes[name] * weights[name]
  }
  return Math.floor(total / 100)
}

export function goalkeeperRating(attributes: AttributeRatings): number {
  return weighted(attributes, goalkeeperWeights)
}

export function roleAbility(
  attributes: AttributeRatings,
  group: PositionGroup,
): number {
  if (group === 'GK') return goalkeeperRating(attributes)
  if (group === 'UNKNOWN') throw new RangeError(unknownPositionMessage)
  return weighted(attributes, outfieldRoleWeights[group])
}
