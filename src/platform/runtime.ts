export type AppRuntime = 'tauri' | 'browser'

export function detectRuntime(globals: object | null | undefined): AppRuntime {
  if (!globals || !('__TAURI_INTERNALS__' in globals)) return 'browser'
  return globals.__TAURI_INTERNALS__ == null ? 'browser' : 'tauri'
}
