import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const artifactsDir = path.join(process.cwd(), "e2e/persona/artifacts");
fs.mkdirSync(artifactsDir, { recursive: true });

/**
 * Persona E2E: wizard → bilduppladdning (hoppa) → generation → skärmdumpar av preview.
 * Kräver lokal dev (eller staging) med fungerande own-engine + preview.
 */
export default defineConfig({
  testDir: "./e2e/persona",
  testMatch: ["**/*.spec.ts"],
  timeout: 12 * 60_000,
  expect: { timeout: 30_000 },
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.SAJTMASKIN_E2E_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
});
