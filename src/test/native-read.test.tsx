import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNativeRead } from '../app/native/useNativeRead'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('native automatic read lifecycle', () => {
  it('loads once for an unchanged request and exposes a typed success', async () => {
    const pending = deferred<string>()
    const load = vi.fn(() => pending.promise)
    const { result, rerender } = renderHook(() =>
      useNativeRead('campaign:1', load),
    )
    expect(result.current.state).toEqual({ status: 'loading' })
    await act(async () => pending.resolve('saved'))
    expect(result.current.state).toEqual({ status: 'success', data: 'saved' })
    rerender()
    expect(load).toHaveBeenCalledOnce()
  })

  it.each(['resolve', 'reject'] as const)(
    'ignores %s after unmount',
    async (finish) => {
      const pending = deferred<string>()
      const load = vi.fn(() => pending.promise)
      const { result, unmount } = renderHook(() =>
        useNativeRead('campaign:1', load),
      )
      await waitFor(() => expect(load).toHaveBeenCalledOnce())
      const before = result.current
      unmount()
      await act(async () => {
        if (finish === 'resolve') pending.resolve('obsolete')
        else pending.reject({ code: 'INTERNAL', message: 'obsolete failure' })
      })
      expect(result.current).toBe(before)
    },
  )

  it.each(['resolve', 'reject'] as const)(
    'hides the old result and ignores a reversed %s after a key change',
    async (finish) => {
      const old = deferred<string>(),
        next = deferred<string>()
      const load = vi
        .fn()
        .mockResolvedValueOnce('first')
        .mockImplementationOnce(() => old.promise)
        .mockImplementationOnce(() => next.promise)
      const { result, rerender } = renderHook(
        ({ key }) => useNativeRead<string>(key, load),
        { initialProps: { key: 'campaign:1' } },
      )
      await waitFor(() =>
        expect(result.current.state).toEqual({
          status: 'success',
          data: 'first',
        }),
      )
      rerender({ key: 'campaign:2' })
      expect(result.current.state).toEqual({ status: 'loading' })
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
      rerender({ key: 'campaign:3' })
      await act(async () => next.resolve('latest'))
      await act(async () => {
        if (finish === 'resolve') old.resolve('obsolete')
        else old.reject({ code: 'INTERNAL', message: 'obsolete failure' })
      })
      expect(result.current.state).toEqual({
        status: 'success',
        data: 'latest',
      })
    },
  )

  it('does not reuse a settled result when the key returns to an earlier value', async () => {
    const pending = deferred<string>()
    const load = vi
      .fn()
      .mockResolvedValueOnce('original A')
      .mockResolvedValueOnce('B')
      .mockImplementationOnce(() => pending.promise)
    const { result, rerender } = renderHook(
      ({ key }) => useNativeRead<string>(key, load),
      { initialProps: { key: 'A' } },
    )
    await waitFor(() => expect(result.current.state.status).toBe('success'))
    rerender({ key: 'B' })
    // Return before B settles: the prior successful A must still be hidden.
    rerender({ key: 'A' })
    expect(result.current.state).toEqual({ status: 'loading' })
    await act(async () => pending.resolve('fresh A'))
    expect(result.current.state).toEqual({ status: 'success', data: 'fresh A' })
  })

  it('invalidates the same key when the client/loader changes', async () => {
    const old = deferred<string>(),
      next = deferred<string>()
    const first = vi.fn(() => old.promise),
      second = vi.fn(() => next.promise)
    const { result, rerender } = renderHook(
      ({ load }) => useNativeRead('same-key', load),
      { initialProps: { load: first } },
    )
    await waitFor(() => expect(first).toHaveBeenCalledOnce())
    rerender({ load: second })
    await act(async () => next.resolve('new client'))
    await act(async () => old.resolve('old client'))
    expect(result.current.state).toEqual({
      status: 'success',
      data: 'new client',
    })
  })

  it('maps rejection, retries the same request, and clears the prior error', async () => {
    const pending = deferred<string>()
    const load = vi
      .fn()
      .mockRejectedValueOnce({
        code: 'CONFLICT',
        message: 'Reload the saved campaign.',
      })
      .mockImplementationOnce(() => pending.promise)
    const { result } = renderHook(() => useNativeRead<string>('same-key', load))
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'error',
        error: 'Reload the saved campaign.',
      }),
    )
    act(() => result.current.retry())
    expect(result.current.state).toEqual({ status: 'loading' })
    await act(async () => pending.resolve('retried'))
    expect(result.current.state).toEqual({ status: 'success', data: 'retried' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('ignores a pending attempt when a retry completes first', async () => {
    const old = deferred<string>()
    const load = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce('retry')
    const { result } = renderHook(() => useNativeRead<string>('same-key', load))
    await waitFor(() => expect(load).toHaveBeenCalledOnce())
    act(() => result.current.retry())
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'success',
        data: 'retry',
      }),
    )
    await act(async () => old.resolve('obsolete attempt'))
    expect(result.current.state).toEqual({ status: 'success', data: 'retry' })
  })

  it('waits for prerequisites and safely handles a synchronous adapter failure', async () => {
    const load = vi.fn<() => Promise<string>>(() => {
      throw new Error('private details')
    })
    const { result, rerender } = renderHook(
      ({ enabled }) => useNativeRead('same-key', enabled ? load : null),
      { initialProps: { enabled: false } },
    )
    expect(result.current.state).toEqual({ status: 'loading' })
    expect(load).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'error',
        error: 'The native shell returned an unexpected error.',
      }),
    )
  })
})
