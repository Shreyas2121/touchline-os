import { execSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const capturedAtHead = execSync('git rev-parse HEAD', {
  encoding: 'utf8',
}).trim()

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const bundle = await server.ssrLoadModule('/src/domain/migration/bundle.ts')
  const files = await bundle.buildCompatibilityFiles({
    sourceCheckpoint: 'df23431abf8807cf61d2d1b63c66d6f7ef6a4cd3',
    evidenceCommit: '7b3c6a03af0999d61c722e43835ebcbd2998f4c5',
    capturedAtHead,
  })
  for (const [relativePath, text] of Object.entries(files)) {
    const target = join(root, 'compatibility', relativePath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, text)
  }
  console.log(
    `Wrote ${Object.keys(files).length} compatibility files from ${capturedAtHead}.`,
  )
} finally {
  await server.close()
}
