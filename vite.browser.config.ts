import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import baseConfig from './vite.config.ts'

// The retained browser UI has its own build; the desktop entry uses Rust IPC.
export default mergeConfig(baseConfig, {
  resolve: {
    alias: [
      {
        find: '/src/main.tsx',
        replacement: fileURLToPath(
          new URL('./src/browser-main.tsx', import.meta.url),
        ),
      },
    ],
  },
  build: { outDir: 'dist-browser' },
})
