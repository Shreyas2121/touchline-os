import { useEffect, useState } from 'react'
import {
  nativeShellBoundary,
  nativeShellHeading,
  nativeShellRefused,
  nativeShellStatus,
} from './copy'
import type { GameClientError } from '../platform/errors'
import { mapInvokeError } from '../platform/errors'
import type { HealthReport } from '../platform/generated/HealthReport'

type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; report: HealthReport }
  | { status: 'error'; error: GameClientError }
  | { status: 'refused' }

export function NativeBootstrap({
  loadHealth = loadNativeHealth,
}: {
  loadHealth?: () => Promise<HealthReport>
}) {
  const [state, setState] = useState<BootstrapState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    loadHealth().then(
      (report) => {
        if (!active) return
        if (
          report.storage !== 'unavailable' ||
          report.features !== 'unavailable' ||
          report.dexieFallback
        ) {
          setState({ status: 'refused' })
          return
        }
        setState({ status: 'ready', report })
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', error: mapInvokeError(error) })
      },
    )
    return () => {
      active = false
    }
  }, [loadHealth])

  if (state.status === 'loading') return <p>Opening the native shell.</p>
  if (state.status === 'error') {
    return (
      <main>
        <h1>{nativeShellHeading}</h1>
        <p>{state.error.code}</p>
        <p>{state.error.message}</p>
      </main>
    )
  }
  if (state.status === 'refused') {
    return (
      <main>
        <h1>{nativeShellHeading}</h1>
        <p>{nativeShellRefused}</p>
      </main>
    )
  }

  return (
    <main>
      <h1>{nativeShellHeading}</h1>
      <p>{nativeShellStatus}</p>
      <p>Storage: {state.report.storage}</p>
      <p>Features: {state.report.features}</p>
      <p>{nativeShellBoundary}</p>
    </main>
  )
}

async function loadNativeHealth(): Promise<HealthReport> {
  const { createNativeClient } = await import('../platform/native-client')
  return createNativeClient().health()
}
