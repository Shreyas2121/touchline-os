import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  existsSync,
  copyFileSync,
  unlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tracked = path.join(root, 'src', 'platform', 'generated')
const check = process.argv.includes('--check')
const output = mkdtempSync(path.join(tmpdir(), 'touchline-bindings-'))

const result = spawnSync(
  'cargo',
  [
    'test',
    '-p',
    'game-core',
    '--test',
    'export_bindings',
    '--locked',
    '--',
    '--exact',
    'export_bindings',
  ],
  {
    cwd: path.join(root, 'src-tauri'),
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: path.join(root, 'src-tauri', 'target'),
      TOUCHLINE_EXPORT_BINDINGS: output,
    },
  },
)

function filesIn(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((name) => name.endsWith('.ts'))
    .sort()
}

try {
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
  if (!check) {
    const actual = filesIn(output)
    for (const name of filesIn(tracked)) {
      if (!actual.includes(name)) unlinkSync(path.join(tracked, name))
    }
    for (const name of actual) {
      copyFileSync(path.join(output, name), path.join(tracked, name))
    }
  }
  const expected = filesIn(tracked)
  const actual = filesIn(output)
  const sameList = expected.join('\n') === actual.join('\n')
  const sameBytes =
    sameList &&
    expected.every((name) =>
      readFileSync(path.join(tracked, name)).equals(
        readFileSync(path.join(output, name)),
      ),
    )
  if (!sameBytes) {
    console.error('Generated bindings differ from src/platform/generated.')
    console.error(`Tracked: ${expected.join(', ') || '(none)'}`)
    console.error(`Generated: ${actual.join(', ') || '(none)'}`)
    process.exit(1)
  }
} finally {
  rmSync(output, { recursive: true, force: true })
}
