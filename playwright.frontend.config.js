import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/frontend-browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4199',
    browserName: 'chromium',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node test/helpers/frontend-test-server.mjs',
    url: 'http://127.0.0.1:4199/api/health',
    reuseExistingServer: false,
    timeout: 30000
  }
});
