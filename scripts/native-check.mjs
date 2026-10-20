import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestDir = path.join(root, 'src-tauri')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: manifestDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: path.join(manifestDir, 'target'),
    },
  })
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed`)
  }
}

function capture(command, args) {
  return spawnSync(command, args, {
    cwd: manifestDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: path.join(manifestDir, 'target'),
    },
  })
}

const rustc = capture('rustc', ['-vV'])
if (rustc.status !== 0) {
  fail('rustc is not available for the pinned src-tauri toolchain')
}
if (!rustc.stdout.includes('host: x86_64-pc-windows-msvc')) {
  fail(
    `The native workspace must use the MSVC toolchain. rustc reported:\n${rustc.stdout}`,
  )
}

if (process.platform === 'win32') {
  const webview = capture('reg', [
    'query',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    '/v',
    'pv',
  ])
  if (webview.status !== 0 || !webview.stdout.includes('pv')) {
    fail(
      'WebView2 Runtime is not installed. Install it before building the native shell.',
    )
  }
  const vswhere = capture(
    path.join(
      process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      'Microsoft Visual Studio',
      'Installer',
      'vswhere.exe',
    ),
    [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ],
  )
  if (vswhere.status !== 0 || vswhere.stdout.trim() === '') {
    fail(
      'Visual Studio with the MSVC C++ tools was not found. Install the Desktop development with C++ workload.',
    )
  }
}

run('cargo', ['fmt', '--all', '--check'])
run('cargo', [
  'clippy',
  '--workspace',
  '--all-targets',
  '--locked',
  '--',
  '-D',
  'warnings',
])
run('cargo', ['test', '--workspace', '--locked'])
