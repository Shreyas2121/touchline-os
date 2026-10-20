import { describe, expect, it } from 'vitest'
import {
  attributeNames,
  goalkeeperRating,
  goalkeeperWeights,
  outfieldRoleWeights,
  roleAbility,
  type AttributeRatings,
} from '../domain/player/ability'

const zeros = {
  pace: 0,
  finishing: 0,
  passing: 0,
  dribbling: 0,
  defending: 0,
  physical: 0,
} satisfies AttributeRatings

const full = {
  pace: 100,
  finishing: 100,
  passing: 100,
  dribbling: 100,
  defending: 100,
  physical: 100,
} satisfies AttributeRatings

function weightTotal(weights: Record<(typeof attributeNames)[number], number>) {
  return attributeNames.reduce((sum, name) => sum + weights[name], 0)
}

describe('role ability', () => {
  it('keeps documented weights on a 0–100 integer scale', () => {
    for (const weights of [
      outfieldRoleWeights.DEF,
      outfieldRoleWeights.MID,
      outfieldRoleWeights.FWD,
      goalkeeperWeights,
    ]) {
      expect(weightTotal(weights)).toBe(100)
    }
    expect(goalkeeperWeights.finishing).toBe(0)
    for (const group of ['DEF', 'MID', 'FWD', 'GK'] as const) {
      expect(roleAbility(zeros, group)).toBe(0)
      expect(roleAbility(full, group)).toBe(100)
    }
    expect(goalkeeperRating(zeros)).toBe(0)
    expect(goalkeeperRating(full)).toBe(100)
    expect(roleAbility({ ...zeros, finishing: 100 }, 'FWD')).toBe(35)
  })

  it('does not treat outfield finishing as goalkeeper ability', () => {
    const keeper = {
      pace: 40,
      finishing: 0,
      passing: 55,
      dribbling: 20,
      defending: 70,
      physical: 65,
    } satisfies AttributeRatings
    expect(goalkeeperRating(keeper)).toBe(
      goalkeeperRating({ ...keeper, finishing: 100 }),
    )
    const skewed = {
      pace: 10,
      finishing: 100,
      passing: 10,
      dribbling: 10,
      defending: 10,
      physical: 10,
    } satisfies AttributeRatings
    const mean =
      attributeNames.reduce((sum, name) => sum + skewed[name], 0) /
      attributeNames.length
    expect(goalkeeperRating(skewed)).not.toBe(mean)
    expect(roleAbility(skewed, 'GK')).toBe(goalkeeperRating(skewed))
  })

  it('rejects an unknown position', () => {
    expect(() => roleAbility(zeros, 'UNKNOWN')).toThrow(RangeError)
  })
})
