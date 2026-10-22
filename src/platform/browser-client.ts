import { unavailableNativeReads, type GameClient } from './game-client'

// Non-native test/development client: no browser storage or gameplay fallback.
export function createBrowserClient(): GameClient {
  return {
    async health() {
      return {
        product: 'Touchline OS',
        identifier: 'com.touchline.os',
        profile: 'browser',
        storage: 'unavailable',
        features: 'unavailable',
        dexieFallback: false,
      }
    },
    ...unavailableNativeReads(),
  }
}
