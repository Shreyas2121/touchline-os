export function offerQualifies(
  offer: { feeCents: number },
  marketValueCents: number | null,
  bidderPrestige: number | null,
  sellerPrestige: number | null,
  rule: {
    requiredFeeNumerator: number
    requiredFeeDenominator: number
    requireHigherPrestige: boolean
  },
): 'qualifies' | 'does-not-qualify' | 'unknown' {
  if (
    marketValueCents === null ||
    bidderPrestige === null ||
    sellerPrestige === null
  )
    return 'unknown'
  const feeQualifies =
    BigInt(offer.feeCents) * BigInt(rule.requiredFeeDenominator) >=
    BigInt(marketValueCents) * BigInt(rule.requiredFeeNumerator)
  const prestigeQualifies =
    !rule.requireHigherPrestige || bidderPrestige > sellerPrestige
  return feeQualifies && prestigeQualifies ? 'qualifies' : 'does-not-qualify'
}

export function countUnresolvedQualifyingOffers(
  offers: readonly {
    status: 'open' | 'accepted' | 'rejected'
    feeCents: number
    playerId: string
    bidderClubId: string
  }[],
  marketValueByPlayerId: ReadonlyMap<string, number | null>,
  prestigeByClubId: ReadonlyMap<string, number | null>,
  sellerPrestige: number | null,
  rule: {
    requiredFeeNumerator: number
    requiredFeeDenominator: number
    requireHigherPrestige: boolean
  },
): number {
  let count = 0
  for (const offer of offers) {
    if (offer.status !== 'open') continue
    const marketValueCents = marketValueByPlayerId.get(offer.playerId)
    const bidderPrestige = prestigeByClubId.get(offer.bidderClubId)
    if (
      offerQualifies(
        offer,
        marketValueCents === undefined ? null : marketValueCents,
        bidderPrestige === undefined ? null : bidderPrestige,
        sellerPrestige,
        rule,
      ) === 'qualifies'
    )
      count += 1
  }
  return count
}
