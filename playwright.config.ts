import { defineConfig, devices } from '@playwright/test'

const previewUrl = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/playwright',
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : undefined,
  globalTimeout: 15 * 60 * 1000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: previewUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      'pnpm build:browser && pnpm preview:browser --host 127.0.0.1 --port 4173',
    url: previewUrl,
    reuseExistingServer: false,
  },
})
