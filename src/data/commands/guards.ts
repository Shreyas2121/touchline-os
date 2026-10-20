import { matchSimulationUnavailable } from '../../domain/simulation/calendar'
import {
  challengeRulesLocked,
  contractEditUnavailable,
  managedClubFixed,
  manualLedgerUnavailable,
  negotiationUnavailable,
  playerEditUnavailable,
} from '../../domain/simulation/career'
import type { Campaign } from '../../domain/validation/schemas'
import { PersistenceError } from '../errors'

const standaloneMessages = {
  match: matchSimulationUnavailable,
  negotiation: negotiationUnavailable,
  player: playerEditUnavailable,
  contract: contractEditUnavailable,
  ledger: manualLedgerUnavailable,
  club: managedClubFixed,
} as const

export function rejectStandaloneWrite(
  campaign: Pick<Campaign, 'mode'>,
  action: keyof typeof standaloneMessages,
): void {
  if (campaign.mode !== 'standalone') return
  throw new PersistenceError('SCOPE', standaloneMessages[action])
}

export function rejectChallengeConstitution(
  campaign: Pick<Campaign, 'mode' | 'rulesMode'>,
): void {
  if (campaign.mode === 'standalone' && campaign.rulesMode === 'challenge')
    throw new PersistenceError('SCOPE', challengeRulesLocked)
}
