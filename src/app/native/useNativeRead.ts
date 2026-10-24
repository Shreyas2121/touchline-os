import { useCallback, useEffect, useMemo, useState } from 'react'
import { mapInvokeError } from '../../platform/errors'

export type NativeReadState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string }

/** Automatic reads only. Memoize load with every client/input dependency and
 * include the complete request identity in key. Null waits for prerequisites.
 * Mutations and their replay/confirmation state belong to the caller.
 */
export function useNativeRead<T>(key: string, load: (() => Promise<T>) | null) {
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  // A new identity also covers A -> B -> A, retries, and client replacement.
  const request = useMemo(() => ({ key, load, attempt }), [key, load, attempt])
  const [settled, setSettled] = useState<{
    request: typeof request
    state: NativeReadState<T>
  }>()
  useEffect(() => {
    if (!request.load) return
    let active = true
    // The promise boundary also handles synchronous adapter failures.
    void Promise.resolve()
      .then(request.load)
      .then(
        (data) => {
          if (active)
            setSettled({ request, state: { status: 'success', data } })
        },
        (error: unknown) => {
          if (active)
            setSettled({
              request,
              state: { status: 'error', error: mapInvokeError(error).message },
            })
        },
      )
    return () => {
      active = false
    }
  }, [request])
  const state: NativeReadState<T> =
    settled?.request === request ? settled.state : { status: 'loading' }
  return { state, retry }
}
