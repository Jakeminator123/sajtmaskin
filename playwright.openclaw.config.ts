import { defineConfig } from "@playwright/test";

const port = 3007;

export default defineConfig({
  testDir: "./tests/openclaw",
  testMatch: ["**/*.e2e.ts"],
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${port} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${port}/avatar?mode=bridge&mock=1`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NODE_ENV: "development",
      NEXT_PUBLIC_AVATAR_AGENT_ID: "test-agent",
      NEXT_PUBLIC_AVATAR_CLIENT_KEY: "test-client",
    },
  },
});
