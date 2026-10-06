import { defineConfig } from "@playwright/test";

// Listing is deliberately side-effect-free. Only the CI launcher may start runtime.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "project-persistence.spec.ts",
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3107",
    browserName: "chromium",
    headless: true,
    navigationTimeout: 120_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
