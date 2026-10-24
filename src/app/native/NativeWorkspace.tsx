import { HashRouter } from 'react-router'
import type { GameClient } from '../../platform/game-client'
import { NativeRoutes } from './NativeRoutes'
export { NativeRoutes } from './NativeRoutes'

export function NativeWorkspace({ client }: { client: GameClient }) {
  return (
    <HashRouter>
      <NativeRoutes client={client} />
    </HashRouter>
  )
}
