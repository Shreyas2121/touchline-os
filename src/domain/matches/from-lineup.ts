export function appearancesFromLineup(
  lineup: {
    starters: readonly { playerId: string }[]
    benchPlayerIds: readonly string[]
  },
  managedPlayerIds: ReadonlySet<string>,
): {
  drafts: {
    playerId: string
    minutes: number | null
    started: boolean
    played: boolean
  }[]
  skipped: number
} {
  const seen = new Set<string>()
  const drafts: {
    playerId: string
    minutes: number | null
    started: boolean
    played: boolean
  }[] = []
  let skipped = 0

  for (const starter of lineup.starters) {
    if (seen.has(starter.playerId)) continue
    seen.add(starter.playerId)
    if (!managedPlayerIds.has(starter.playerId)) {
      skipped += 1
      continue
    }
    drafts.push({
      playerId: starter.playerId,
      minutes: 90,
      started: true,
      played: true,
    })
  }

  for (const playerId of lineup.benchPlayerIds) {
    if (seen.has(playerId)) continue
    seen.add(playerId)
    if (!managedPlayerIds.has(playerId)) {
      skipped += 1
      continue
    }
    drafts.push({
      playerId,
      minutes: null,
      started: false,
      played: false,
    })
  }

  return { drafts, skipped }
}
