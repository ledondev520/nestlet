import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/frontend-browser',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  // A failure must remain visible; retries must not consume the registration budget.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/browser.xml' }]],
  use: {
    baseURL: 'http://127.0.0.1:4199',
    browserName: 'chromium',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node test/helpers/frontend-browser-server.mjs',
    url: 'http://127.0.0.1:4199/api/health',
    reuseExistingServer: false,
    timeout: 30000
  }
});
