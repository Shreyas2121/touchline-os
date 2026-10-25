import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Explicit names keep the unrelated, ignored save-file benchmark out of this
// gate. Release builds retain test assertions and avoid debug JSON/SQLite costs.
const certifications = [
  [
    'full_season',
    'full_season_reopens_replays_reconciles_and_exports_within_limit',
  ],
  [
    'market_certification',
    'winter_tick_and_close_leave_played_matches_unchanged',
  ],
]

for (const [target, test] of certifications) {
  const args = [
    'test',
    '-p',
    'game-app',
    '--test',
    target,
    '--release',
    '--locked',
    '--',
    test,
    '--exact',
    '--ignored',
    '--nocapture',
  ]
  console.log(`cargo ${args.join(' ')}`)
  const result = spawnSync('cargo', args, {
    cwd: path.join(root, 'src-tauri'),
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: path.join(root, 'src-tauri', 'target'),
    },
  })
  if (result.status !== 0) {
    console.error(
      result.error?.message ?? `Season certification failed: ${test}`,
    )
    process.exit(result.status ?? 1)
  }
}
