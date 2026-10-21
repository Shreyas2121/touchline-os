import type { HealthReport } from './generated/HealthReport'
import type { CampaignPage } from './generated/CampaignPage'
import type { ScreenQuery } from './generated/ScreenQuery'
import type { ScreenModel } from './generated/ScreenModel'
import type { PlayerRow } from './generated/PlayerRow'
import type { PreviewQuery } from './generated/PreviewQuery'
import type { NativePreview } from './generated/NativePreview'
import type { MigrationSummary } from './generated/MigrationSummary'
import type { MigrationResult } from './generated/MigrationResult'
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
  previewPolicy(query: PreviewQuery): Promise<NativePreview>
  selectImport(): Promise<MigrationSummary | null>
  confirmImport(token: string): Promise<MigrationResult>
  cancelImport(): Promise<void>
  exportCampaign(campaignId: string): Promise<boolean>
  backupDatabase(): Promise<boolean>
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
    previewPolicy: reject,
    selectImport: reject,
    confirmImport: reject,
    cancelImport: reject,
    exportCampaign: reject,
    backupDatabase: reject,
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
