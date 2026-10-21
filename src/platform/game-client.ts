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
import {
  clientOperations,
  operationMethod,
  type ClientMethod,
  type ClientOperation,
} from './operations'

type ClientCalls = {
  [Method in ClientMethod]: () => Promise<never>
}

export type GameClient = ClientCalls & {
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
  }
}

export function unavailableMethods(
  reject: (operation: ClientOperation) => Promise<never>,
): ClientCalls {
  const methods = {} as Record<ClientMethod, () => Promise<never>>
  for (const operation of clientOperations) {
    methods[operationMethod(operation)] = () => reject(operation)
  }
  return methods
}
