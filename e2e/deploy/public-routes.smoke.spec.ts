import { expect, test, type Page } from "@playwright/test";

const shouldRun =
  process.env.SAJTMASKIN_E2E_PUBLIC_SMOKE === "1" ||
  Boolean(process.env.SAJTMASKIN_E2E_BASE_URL?.trim());

const publicRoutes = ["/", "/faq", "/templates"] as const;

test.describe("public routes smoke", () => {
  test.skip(!shouldRun, "Set SAJTMASKIN_E2E_PUBLIC_SMOKE=1 or SAJTMASKIN_E2E_BASE_URL to run public route smoke.");

  for (const route of publicRoutes) {
    test(`GET ${route} renders without console/page errors`, async ({ page }) => {
      const errors: string[] = [];
      attachBrowserErrorCapture(page, errors);

      const response = await page.goto(route, { waitUntil: "domcontentloaded" });

      expect(response?.status() ?? 0).toBeLessThan(400);
      await expect(page.locator("body")).toBeVisible();
      expect(await page.locator("main, [role='main'], body").count()).toBeGreaterThan(0);

      expect(errors).toEqual([]);
    });
  }

  test("root route sends a CSP header", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBeLessThan(400);

    const csp =
      response.headers()["content-security-policy"] ??
      response.headers()["content-security-policy-report-only"];

    expect(csp).toBeTruthy();
  });
});

function attachBrowserErrorCapture(page: Page, errors: string[]): void {
  page.on("console", (message) => {
    if (message.type() === "error" && !isKnownNoise(message.text())) {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    if (!isKnownNoise(error.message)) {
      errors.push(`pageerror: ${error.message}`);
    }
  });
}

function isKnownNoise(message: string): boolean {
  return /favicon|ResizeObserver loop/i.test(message);
}
