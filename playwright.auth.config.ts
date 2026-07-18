import { defineConfig } from '@playwright/test';

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: 'list',
  retries: 0,
  testDir: './tests/e2e',
  testMatch: 'auth.spec.ts',
  use: {
    baseURL: process.env.AUTH_E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  workers: 1,
});
