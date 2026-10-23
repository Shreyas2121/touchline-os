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
export type GameClient = {
  health(): Promise<HealthReport>
  campaigns(page: number): Promise<CampaignPage>
  screen(query: ScreenQuery): Promise<ScreenModel>
  player(campaignId: string, playerId: string): Promise<PlayerRow>
  planning(campaignId: string, playerId: string): Promise<PlayerPlanning>
  previewPolicy(query: PreviewQuery): Promise<NativePreview>
  selectImport(): Promise<MigrationSummary | null>
  confirmImport(token: string): Promise<MigrationResult>
  cancelImport(): Promise<void>
  exportCampaign(campaignId: string): Promise<boolean>
  backupDatabase(): Promise<boolean>
  createCareer(request: CreationRequest): Promise<ManagementOutcome>
  previewCreation(request: CreationRequest): Promise<ClubChoices>
  manage(command: ManagementCommand): Promise<ManagementOutcome>
  previewTime(campaignId: string): Promise<TimePreview>
  advanceTime(request: AdvanceRequest): Promise<AdvanceOutcome>
  previewMatchday(campaignId: string): Promise<MatchdayPreview>
  simMatchday(request: SimMatchdayRequest): Promise<AdvanceOutcome>
  matchdayView(campaignId: string, round: number | null): Promise<MatchdayView>
}

export function unavailableNativeReads() {
  const reject = () =>
    Promise.reject({
      code: 'UNAVAILABLE',
      message: 'Native services require the desktop application.',
    })
  return {
    campaigns: reject,
    screen: reject,
    player: reject,
    planning: reject,
    previewPolicy: reject,
    selectImport: reject,
    confirmImport: reject,
    cancelImport: reject,
    exportCampaign: reject,
    backupDatabase: reject,
    createCareer: reject,
    previewCreation: reject,
    manage: reject,
    previewTime: reject,
    advanceTime: reject,
    previewMatchday: reject,
    simMatchday: reject,
    matchdayView: reject,
  }
}
