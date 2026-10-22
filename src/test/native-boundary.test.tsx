/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NativeBootstrap } from '../app/NativeBootstrap'
import { nativeShellBoundary, nativeShellRefused } from '../app/copy'
import { createBrowserClient } from '../platform/browser-client'
import { mapInvokeError } from '../platform/errors'
import { detectRuntime } from '../platform/runtime'
import type { HealthReport } from '../platform/generated/HealthReport'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function section(toml: string, heading: string): string[] {
  const match = toml.match(
    new RegExp(`\\[${heading}\\]\\r?\\n([\\s\\S]*?)(\\r?\\n\\[|$)`),
  )
  if (!match?.[1]) return []
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split('=')[0]?.trim() ?? '')
    .filter((name) => name.length > 0)
}

const unavailableReport: HealthReport = {
  product: 'Touchline OS',
  identifier: 'com.touchline.os',
  profile: 'dev',
  storage: 'unavailable',
  features: 'unavailable',
  dexieFallback: false,
}

describe('native boundary', () => {
  it('maps structured shell errors and hides unexpected payloads', () => {
    expect(
      mapInvokeError({
        code: 'UNAVAILABLE',
        message:
          'clock-advance is not available until a later migration guide.',
      }),
    ).toEqual({
      code: 'UNAVAILABLE',
      message: 'clock-advance is not available until a later migration guide.',
    })
    expect(
      mapInvokeError(
        JSON.stringify({ code: 'VALIDATION', message: 'Unknown operation.' }),
      ).code,
    ).toBe('VALIDATION')
    expect(mapInvokeError('select * from players').code).toBe('INTERNAL')
    expect(mapInvokeError({ code: 'SQL', message: 'raw' }).message).toBe(
      'The native shell returned an unexpected error.',
    )
  })

  it('keeps the native shell off the browser database', async () => {
    expect(detectRuntime({})).toBe('browser')
    expect(detectRuntime({ __TAURI_INTERNALS__: {} })).toBe('tauri')

    render(<NativeBootstrap loadHealth={async () => unavailableReport} />)
    expect(await screen.findByText('Storage: unavailable')).toBeInTheDocument()
    expect(screen.getByText('Features: unavailable')).toBeInTheDocument()
    expect(screen.getByText(nativeShellBoundary)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()

    render(
      <NativeBootstrap
        loadHealth={async () => ({
          ...unavailableReport,
          storage: 'indexeddb',
          dexieFallback: true,
        })}
      />,
    )
    expect(await screen.findByText(nativeShellRefused)).toBeInTheDocument()
  })

  it('does not give the browser client a Dexie fallback', async () => {
    const client = createBrowserClient()
    const health = await client.health()
    expect(health.storage).toBe('unavailable')
    expect(health.dexieFallback).toBe(false)
    await expect(client.selectImport()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    })
    const source = readFileSync(
      path.join(root, 'src/platform/browser-client.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/from ['"]dexie['"]/)
    expect(source).not.toContain('indexedDB')
  })

  it('points the shell at the existing frontend and keeps crate dependencies inward', () => {
    const config = JSON.parse(
      readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as {
      identifier: string
      productName: string
      build: { frontendDist: string; devUrl: string }
    }
    expect(config.identifier).toBe('com.touchline.os')
    expect(config.productName).toBe('Touchline OS')
    expect(config.build.frontendDist).toBe('../dist')
    expect(config.build.devUrl).toBe('http://localhost:5173')

    const core = section(
      readFileSync(
        path.join(root, 'src-tauri/crates/game-core/Cargo.toml'),
        'utf8',
      ),
      'dependencies',
    )
    expect(core).toEqual(['serde', 'serde_json', 'ts-rs'])
    expect(
      section(
        readFileSync(
          path.join(root, 'src-tauri/crates/game-store/Cargo.toml'),
          'utf8',
        ),
        'dependencies',
      ),
    ).toEqual(['game-core', 'rusqlite', 'serde', 'serde_json', 'sha2'])
    expect(
      section(
        readFileSync(
          path.join(root, 'src-tauri/crates/game-app/Cargo.toml'),
          'utf8',
        ),
        'dependencies',
      ),
    ).toEqual(['game-core', 'game-store', 'serde_json'])
    const shell = section(
      readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'),
      'dependencies',
    )
    expect(shell).toContain('game-app')
    expect(shell).toContain('tauri')
    expect(shell).not.toContain('game-core')
    expect(shell).not.toContain('game-store')

    const entry = readFileSync(path.join(root, 'src/app/App.tsx'), 'utf8')
    expect(entry).toContain('<NativeBootstrap />')
    expect(entry).not.toContain('DatabaseProvider')
    expect(entry).not.toContain('./router')
  })

  it('keeps generated bindings on JS-safe numbers', () => {
    const directory = path.join(root, 'src/platform/generated')
    const files = readdirSync(directory).filter((name) => name.endsWith('.ts'))
    expect(files).toContain('HealthReport.ts')
    expect(files).toContain('CampaignSnapshot.ts')
    const combined = files
      .map((name) => readFileSync(path.join(directory, name), 'utf8'))
      .join('\n')
    expect(combined).toContain('dexieFallback: boolean')
    expect(combined).not.toContain('bigint')
    expect(combined).toContain('formatVersion: FormatVersion')
  })
})
