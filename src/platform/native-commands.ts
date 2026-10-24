import type { HealthReport } from './generated/HealthReport'
import type { CampaignPage } from './generated/CampaignPage'
import type { ScreenQuery } from './generated/ScreenQuery'
import type { ScreenModel } from './generated/ScreenModel'
import type { PlayerRow } from './generated/PlayerRow'
import type { PreviewQuery } from './generated/PreviewQuery'
import type { NativePreview } from './generated/NativePreview'
import type { MigrationSummary } from './generated/MigrationSummary'
import type { MigrationResult } from './generated/MigrationResult'
import type { CreationRequest } from './generated/CreationRequest'
import type { ManagementCommand } from './generated/ManagementCommand'
import type { ManagementOutcome } from './generated/ManagementOutcome'
import type { ClubChoices } from './generated/ClubChoices'
import type { PlayerPlanning } from './generated/PlayerPlanning'
import type { TimePreview } from './generated/TimePreview'
import type { AdvanceRequest } from './generated/AdvanceRequest'
import type { AdvanceOutcome } from './generated/AdvanceOutcome'
import type { MatchdayPreview } from './generated/MatchdayPreview'
import type { MatchdayView } from './generated/MatchdayView'
import type { SimMatchdayRequest } from './generated/SimMatchdayRequest'
import type { SettleTransferRequest } from './generated/SettleTransferRequest'
import type { MarketPreview } from './generated/MarketPreview'
import type { RunMarketRequest } from './generated/RunMarketRequest'
import type { CloseWindowRequest } from './generated/CloseWindowRequest'
import type { ProposeTransferRequest } from './generated/ProposeTransferRequest'
import type { RespondNegotiationRequest } from './generated/RespondNegotiationRequest'
import type { RespondOfferRequest } from './generated/RespondOfferRequest'
import type { TransferBoard } from './generated/TransferBoard'
import type { EntityId } from './generated/EntityId'
import type { SafeInt } from './generated/SafeInt'
import { invoke } from '@tauri-apps/api/core'
import { mapInvokeError } from './errors'

type Command<Args, Result> = { args: Args; result: Result }

// Mirrors the Tauri handlers in src-tauri/src/lib.rs. State/AppHandle
// parameters are injected by Tauri; wire argument names use camelCase.
export type NativeCommands = {
  health: Command<undefined, HealthReport>
  list_campaigns: Command<{ page: SafeInt }, CampaignPage>
  read_screen: Command<{ query: ScreenQuery }, ScreenModel>
  read_player: Command<{ campaignId: EntityId; playerId: EntityId }, PlayerRow>
  player_planning: Command<
    { campaignId: EntityId; playerId: EntityId },
    PlayerPlanning
  >
  preview_policy: Command<{ query: PreviewQuery }, NativePreview>
  select_import: Command<undefined, MigrationSummary | null>
  confirm_import: Command<{ token: string }, MigrationResult>
  cancel_import: Command<undefined, void>
  export_campaign: Command<
    { campaignId: EntityId; exportId: EntityId; exportedAt: string },
    boolean
  >
  backup_database: Command<undefined, boolean>
  create_career: Command<{ request: CreationRequest }, ManagementOutcome>
  preview_creation: Command<{ request: CreationRequest }, ClubChoices>
  manage_campaign: Command<{ command: ManagementCommand }, ManagementOutcome>
  preview_time: Command<{ campaignId: EntityId }, TimePreview>
  advance_time: Command<{ request: AdvanceRequest }, AdvanceOutcome>
  preview_matchday: Command<{ campaignId: EntityId }, MatchdayPreview>
  sim_matchday: Command<{ request: SimMatchdayRequest }, AdvanceOutcome>
  settle_transfer: Command<{ request: SettleTransferRequest }, AdvanceOutcome>
  matchday_view: Command<
    { campaignId: EntityId; round: SafeInt | null },
    MatchdayView
  >
  preview_market: Command<{ campaignId: EntityId }, MarketPreview>
  transfer_board: Command<{ campaignId: EntityId }, TransferBoard>
  run_market: Command<{ request: RunMarketRequest }, AdvanceOutcome>
  close_window: Command<{ request: CloseWindowRequest }, AdvanceOutcome>
  propose_transfer: Command<{ request: ProposeTransferRequest }, AdvanceOutcome>
  respond_negotiation: Command<
    { request: RespondNegotiationRequest },
    AdvanceOutcome
  >
  respond_offer: Command<{ request: RespondOfferRequest }, AdvanceOutcome>
}

export async function call<K extends keyof NativeCommands>(
  command: K,
  ...args: NativeCommands[K]['args'] extends undefined
    ? []
    : [args: NativeCommands[K]['args']]
): Promise<NativeCommands[K]['result']> {
  try {
    return await invoke<NativeCommands[K]['result']>(command, args[0])
  } catch (error) {
    throw mapInvokeError(error, command)
  }
}
