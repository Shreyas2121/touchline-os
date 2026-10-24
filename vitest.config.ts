import { defineConfig } from 'vitest/config'

// Pure logic and adapter contracts need neither a DOM nor IndexedDB. New .ts
// suites default to storage; add pure suites here to skip that setup as well.
const domainTests = [
  'campaign-summary',
  'capacity',
  'constitution-forms',
  'constitution-presets',
  'dates',
  'evaluate-action',
  'generate-playable-world',
  'generate-world',
  'lineup-draft',
  'money',
  'native-client',
  'player-ability',
  'schemas',
  'simulation-calendar',
  'simulation-random',
  'squad-view',
].map((name) => `src/test/${name}.test.ts`)
domainTests.push('src/test/environments/domain.test.ts')

// These older .ts suites also render React. Keep their UI coverage in jsdom.
const uiTests = [
  'src/**/*.test.tsx',
  ...[
    'crest-pitch',
    'offers',
    'record-match',
    'registration',
    'save-contract',
    'select-club',
  ].map((name) => `src/test/${name}.test.ts`),
]
const excluded = ['**/node_modules/**', '**/dist/**', 'e2e/**']

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'domain',
          environment: 'node',
          include: domainTests,
          exclude: excluded,
        },
      },
      {
        test: {
          name: 'storage',
          environment: 'node',
          setupFiles: './src/test/setup.storage.ts',
          include: ['src/**/*.test.ts'],
          exclude: [...excluded, ...domainTests, ...uiTests],
        },
      },
      {
        test: {
          name: 'ui',
          environment: 'jsdom',
          setupFiles: './src/test/setup.ui.ts',
          include: uiTests,
          exclude: excluded,
        },
      },
    ],
  },
})
