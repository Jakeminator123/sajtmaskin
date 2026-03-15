import { expect, test } from "@playwright/test";

test("avatar bridge mock mode renders and handles a chat roundtrip", async ({ page }) => {
  await page.route("**/api/openclaw/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        surfaceEnabled: true,
        surfaceStatus: "enabled",
        blockers: [],
      }),
    });
  });

  await page.route("**/api/did/chat", async (route) => {
    const payload = route.request().postDataJSON() as {
      message?: string;
      recentMessages?: Array<{ role?: string; content?: string }>;
    };

    expect(payload.message).toBe("Kan du hjälpa mig vidare?");
    expect(Array.isArray(payload.recentMessages)).toBe(true);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        provider: "openclaw-avatar-bridge",
        sessionId: "sess_e2e",
        reply: "Absolut. Det här är ett mockat svar från avatar-bridgen.",
      }),
    });
  });

  await page.goto("/avatar?mode=bridge&mock=1");

  await expect(page.getByTestId("avatar-integration-mode")).toContainText("OpenClaw bridge");
  await expect(page.getByTestId("avatar-integration-mock")).toContainText(
    "Mockad avatartransport",
  );
  await expect(page.getByTestId("avatar-openclaw-health")).toContainText("Gateway: ok");

  await page.getByTestId("avatar-bridge-input").fill("Kan du hjälpa mig vidare?");
  await page.getByTestId("avatar-bridge-send").click();

  await expect(page.getByTestId("avatar-bridge-last-assistant").last()).toContainText(
    "mockat svar från avatar-bridgen",
  );
  await expect(page.getByTestId("avatar-bridge-debug")).toContainText("Senaste tal");
});

test("avatar page keeps iframe mode as the safe fallback", async ({ page }) => {
  await page.goto("/avatar?mode=iframe");

  await expect(page.getByTestId("avatar-integration-mode")).toContainText("Iframe fallback");
  await expect(page.locator("iframe")).toHaveCount(1);
});
