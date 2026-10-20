import { RouterProvider } from 'react-router'
import { bootstrapPlan, detectRuntime } from '../platform/runtime'
import { NativeBootstrap } from './NativeBootstrap'
import { DatabaseProvider } from './providers/database'
import { router } from './router'

export function App() {
  const runtime =
    typeof window === 'undefined' ? 'browser' : detectRuntime(window)
  if (bootstrapPlan(runtime) === 'native-shell') {
    return <NativeBootstrap />
  }
  return (
    <DatabaseProvider>
      <RouterProvider router={router} />
    </DatabaseProvider>
  )
}
