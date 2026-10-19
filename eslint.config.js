import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
      'blob-report',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite(),
    ],
  },
  eslintConfigPrettier,
)
