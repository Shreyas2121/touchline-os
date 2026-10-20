export function matchResult(
  goalsFor: number,
  goalsAgainst: number,
): 'Win' | 'Draw' | 'Loss' {
  if (goalsFor > goalsAgainst) return 'Win'
  if (goalsFor < goalsAgainst) return 'Loss'
  return 'Draw'
}
