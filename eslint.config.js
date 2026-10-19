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
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'domain modules stay free of React and Dexie.',
            },
            {
              name: 'react-dom',
              message: 'domain modules stay free of React and Dexie.',
            },
            {
              name: 'react-router',
              message: 'domain modules stay free of React and Dexie.',
            },
            {
              name: 'dexie',
              message: 'domain modules stay free of React and Dexie.',
            },
            {
              name: 'fake-indexeddb',
              message:
                'domain modules stay free of the test IndexedDB polyfill.',
            },
          ],
          patterns: [
            {
              group: [
                '../../app/**',
                '../../features/**',
                '../../components/**',
                '../../data/**',
                '../app/**',
                '../features/**',
                '../components/**',
                '../data/**',
              ],
              message:
                'domain modules cannot import the app shell, features, components, or the data layer.',
            },
            {
              group: ['fake-indexeddb', 'fake-indexeddb/**'],
              message:
                'domain modules stay free of the test IndexedDB polyfill.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'domain code takes explicit inputs and does not call Date.now, new Date, or Math.random.',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'domain code takes explicit inputs and does not call Date.now, new Date, or Math.random.',
        },
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'domain code takes explicit inputs and does not call Date.now, new Date, or Math.random.',
        },
      ],
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'data modules stay free of React and the test IndexedDB polyfill.',
            },
            {
              name: 'react-dom',
              message:
                'data modules stay free of React and the test IndexedDB polyfill.',
            },
            {
              name: 'react-router',
              message:
                'data modules stay free of React and the test IndexedDB polyfill.',
            },
            {
              name: 'fake-indexeddb',
              message:
                'data modules stay free of React and the test IndexedDB polyfill.',
            },
          ],
          patterns: [
            {
              group: ['fake-indexeddb', 'fake-indexeddb/**'],
              message:
                'data modules stay free of React and the test IndexedDB polyfill.',
            },
          ],
        },
      ],
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: [
      'src/main.tsx',
      'src/app/**/*.{ts,tsx}',
      'src/features/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'dexie',
              message:
                'the shell cannot import Dexie, the data layer, or the domain during Phase 2.',
            },
            {
              name: 'fake-indexeddb',
              message:
                'the shell cannot import Dexie, the data layer, or the domain during Phase 2.',
            },
          ],
          patterns: [
            {
              group: [
                './data',
                './data/**',
                './domain',
                './domain/**',
                '../data',
                '../data/**',
                '../domain',
                '../domain/**',
                '../../data',
                '../../data/**',
                '../../domain',
                '../../domain/**',
                '../../../data',
                '../../../data/**',
                '../../../domain',
                '../../../domain/**',
                'fake-indexeddb',
                'fake-indexeddb/**',
              ],
              message:
                'the shell cannot import Dexie, the data layer, or the domain during Phase 2.',
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
)
