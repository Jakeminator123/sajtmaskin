import { expect, test } from "@playwright/test";

/**
 * Opt-in smoke: POST /api/v0/deployments with precheckOnly (no Vercel, no credits).
 * Requires a real session cookie + chat/version IDs that belong to that user.
 *
 * Env (all required to run — otherwise test is skipped):
 * - SAJTMASKIN_E2E_BASE_URL — e.g. https://preview.example.com or http://127.0.0.1:3000
 * - SAJTMASKIN_E2E_SESSION_COOKIE — full Cookie header value (e.g. "session=...; Path=/")
 * - SAJTMASKIN_E2E_DEPLOY_CHAT_ID
 * - SAJTMASKIN_E2E_DEPLOY_VERSION_ID
 */
test("POST /api/v0/deployments precheckOnly returns deployReadiness", async ({ request }) => {
  const base = process.env.SAJTMASKIN_E2E_BASE_URL?.replace(/\/$/, "") ?? "";
  const cookie = process.env.SAJTMASKIN_E2E_SESSION_COOKIE?.trim() ?? "";
  const chatId = process.env.SAJTMASKIN_E2E_DEPLOY_CHAT_ID?.trim() ?? "";
  const versionId = process.env.SAJTMASKIN_E2E_DEPLOY_VERSION_ID?.trim() ?? "";

  test.skip(
    !base || !cookie || !chatId || !versionId,
    "Set SAJTMASKIN_E2E_BASE_URL, SAJTMASKIN_E2E_SESSION_COOKIE, SAJTMASKIN_E2E_DEPLOY_CHAT_ID, SAJTMASKIN_E2E_DEPLOY_VERSION_ID",
  );

  const res = await request.post(`${base}/api/v0/deployments`, {
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    data: {
      chatId,
      versionId,
      precheckOnly: true,
    },
  });

  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as {
    precheckOnly?: boolean;
    deployReadiness?: unknown;
  };
  expect(body.precheckOnly).toBe(true);
  expect(body.deployReadiness).toBeDefined();
});
