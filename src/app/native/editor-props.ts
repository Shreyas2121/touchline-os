import type { GameClient } from '../../platform/game-client'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import type { SendAction } from './management-forms'

export type EditorProps = {
  client: GameClient
  onReload: () => void
  model: ScreenModel
  send: SendAction
  stableId: (key: string) => string
  stamp: string
}
export const text = (data: FormData, key: string) =>
  String(data.get(key) ?? '').trim()
