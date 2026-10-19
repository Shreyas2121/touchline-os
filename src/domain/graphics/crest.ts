import { hashSeed } from '../seed/prng'

export type CrestMark = 'shield' | 'stripe' | 'chevron' | 'monogram'

export type CrestSpec = {
  mark: CrestMark
  primary: string
  secondary: string
  monogram: string
}

const marks: readonly CrestMark[] = ['shield', 'stripe', 'chevron', 'monogram']

export function crestSpec(club: {
  id: string
  name: string
  colors: { primary: string; secondary: string }
}): CrestSpec {
  const initials = club.name
    .trim()
    .split(/\s+/)
    .map((word) => word.match(/\p{L}/u)?.[0] ?? '')
    .join('')
    .toLocaleUpperCase('en')
  return {
    mark: marks[hashSeed(club.id, 'crest-v1') % 4],
    primary: club.colors.primary,
    secondary: club.colors.secondary,
    monogram: Array.from(initials).slice(0, 3).join('') || '?',
  }
}
