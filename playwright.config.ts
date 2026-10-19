import { defineConfig, devices } from '@playwright/test'

const previewUrl = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: 'e2e',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: previewUrl,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173',
    url: previewUrl,
    reuseExistingServer: false,
  },
})
