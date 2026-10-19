export function squadCount(playerCount: number): string {
  return String(playerCount)
}

export function squadAgeSummary(
  reportedAges: readonly (number | null)[],
): string {
  const known = reportedAges.filter((age) => age !== null).sort((a, b) => a - b)
  if (known.length === 0) return 'Unknown'
  const median = known[Math.floor((known.length - 1) / 2)]
  const unknownCount = reportedAges.length - known.length
  return `${median} years${unknownCount > 0 ? ` · ${unknownCount} unknown` : ''}`
}

export function activityLines(summaries: readonly string[]): readonly string[] {
  return summaries.slice(0, 20)
}
