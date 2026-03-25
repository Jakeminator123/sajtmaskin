import { defineConfig } from "@playwright/test";

/**
 * Optional HTTP smoke against a running app (staging/local).
 * Tests skip unless SAJTMASKIN_E2E_* env vars are set — safe for CI without secrets.
 */
export default defineConfig({
  testDir: "./e2e/deploy",
  testMatch: ["**/*.smoke.spec.ts"],
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.SAJTMASKIN_E2E_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
});
