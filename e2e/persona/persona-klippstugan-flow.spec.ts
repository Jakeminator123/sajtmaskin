import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Persona: Klippstugan Nord AB — fiktiv salong i Umeå.
 * Går igenom intakewizard (alla steg inkl. mål/målgrupp), hoppar bilder, väntar på preview,
 * tar skärmdumpar av wizarden och av varje route som syns i preview-verktygsfältet.
 */

const PERSONA = {
  companyName: "Klippstugan Nord AB",
  offerShort:
    "Lokal frisörsalong med fokus på färg, klipp och hårvård i Umeå. Vi vill att fler bokar online.",
  address: "Renmarkstorget 12, 903 25 Umeå",
  phone: "090-12 34 56",
  email: "hej@klippstugannord.se",
  tagline: "Ditt hår — vårt hantverk",
  service1: "Klippning dam & herr",
  service2: "Färgning och slingor",
  usp: "Boka online — drop-in när det finns tid",
} as const;

const OUT_SUBDIR = "persona-klippstugan";

function artifactDir(): string {
  return path.join(process.cwd(), "e2e/persona/artifacts", OUT_SUBDIR);
}

function ensureOutDir() {
  fs.mkdirSync(artifactDir(), { recursive: true });
}

function shot(name: string) {
  return path.join(artifactDir(), `${name}.png`);
}

function wizardDialog(page: Page) {
  return page.getByRole("dialog", { name: "Intake-guiden" });
}

async function clickContinue(page: Page) {
  const dlg = wizardDialog(page);
  const btn = dlg.getByRole("button", { name: /Fortsätt|Bygg min sajt/ });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
}

async function screenshotWizard(page: Page, step: string) {
  await wizardDialog(page).screenshot({ path: shot(`wizard-${step}`) });
}

test.describe.configure({ mode: "serial" });

test("Klippstugan Nord: wizard → generering → skärmdumpar preview", async ({ page }) => {
  test.setTimeout(12 * 60_000);
  ensureOutDir();

  await page.goto("/builder", { waitUntil: "domcontentloaded" });

  const dialog = wizardDialog(page);
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await screenshotWizard(page, "01-site-type");

  await dialog.getByRole("button", { name: "Salong / Skönhet" }).click();
  await clickContinue(page);

  await screenshotWizard(page, "02-offer");
  await dialog.locator("textarea").fill(PERSONA.offerShort);
  await clickContinue(page);

  await screenshotWizard(page, "03-existing-site");
  await dialog.getByRole("button", { name: "Börja från noll" }).click();

  await screenshotWizard(page, "04-business-details");
  await dialog.getByPlaceholder("Mitt Företag AB").fill(PERSONA.companyName);
  await dialog.getByPlaceholder("070-123 45 67").fill(PERSONA.phone);
  await dialog.getByPlaceholder("info@mittforetag.se").fill(PERSONA.email);
  await dialog.getByPlaceholder("Storgatan 1, 123 45 Stad").fill(PERSONA.address);
  await clickContinue(page);

  await screenshotWizard(page, "05-brand");
  await dialog.getByLabel(/Tagline|slogan/i).fill(PERSONA.tagline);
  await dialog.getByRole("button", { name: "Varm och personlig" }).click();
  await dialog.getByRole("button", { name: "Modern sans-serif" }).click();
  await clickContinue(page);

  await screenshotWizard(page, "06-services");
  const svcInput = dialog.locator('input[placeholder*="Klippning"]');
  await svcInput.fill(PERSONA.service1);
  await svcInput.press("Enter");
  await svcInput.fill(PERSONA.service2);
  await svcInput.press("Enter");
  const uspInput = dialog.locator('input[placeholder*="20 års erfarenhet"]');
  await uspInput.fill(PERSONA.usp);
  await uspInput.press("Enter");
  await dialog.getByRole("button", { name: "Boka tid" }).click();
  await clickContinue(page);

  await screenshotWizard(page, "07-goal");
  await dialog.getByRole("button", { name: "Boka tid / möten" }).click();
  await clickContinue(page);

  await screenshotWizard(page, "08-audience");
  await dialog.getByRole("button", { name: "Lokala kunder" }).click();
  await clickContinue(page);

  await screenshotWizard(page, "09-must-have");
  const suggestResp = page.waitForResponse(
    (r) => r.url().includes("/api/ai/suggest-pages") && r.request().method() === "POST",
    { timeout: 60_000 },
  ).catch(() => null);
  await suggestResp;
  await dialog.getByRole("button", { name: "Startsida / Hero" }).click();
  await dialog.getByRole("button", { name: "Kontaktformulär" }).click();
  await dialog.getByRole("button", { name: "Boka tid online" }).click();
  await screenshotWizard(page, "10-must-have-filled");
  await dialog.getByRole("button", { name: "Bygg min sajt" }).click();

  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await page.screenshot({ path: shot("11-post-wizard"), fullPage: true });

  const skipImages = page.getByRole("button", { name: /Hoppa över — använd exempelbilder/ });
  await expect(skipImages).toBeVisible({ timeout: 30_000 });
  await skipImages.click();

  await page.screenshot({ path: shot("12-post-image-skip"), fullPage: true });

  const iframe = page.locator("#preview-iframe");
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#preview-iframe") as HTMLIFrameElement | null;
      if (!el?.src) return false;
      return el.src.length > 12 && !el.src.startsWith("about:blank");
    },
    { timeout: 10 * 60_000 },
  );

  await expect(iframe).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(4000);
  await iframe.screenshot({ path: shot("preview-route-root") });

  const routeTrigger = page
    .getByRole("button", { name: /\// })
    .filter({ has: page.locator("svg") })
    .first();

  if (await routeTrigger.isVisible().catch(() => false)) {
    await routeTrigger.click();
    const popover = page.locator("div.border-border.bg-popover.shadow-md").last();
    await expect(popover).toBeVisible({ timeout: 10_000 }).catch(() => {});
    const menuButtons = popover.locator("button");
    const count = await menuButtons.count();
    const routes: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = (await menuButtons.nth(i).textContent())?.trim() ?? "";
      if (t && !routes.includes(t)) routes.push(t);
    }
    await page.keyboard.press("Escape").catch(() => {});

    for (const route of routes) {
      if (route === "/") continue;
      await routeTrigger.click();
      const pop = page.locator("div.border-border.bg-popover.shadow-md").last();
      await pop.waitFor({ state: "visible", timeout: 8000 });
      await pop.getByRole("button", { name: route, exact: true }).click();
      await page.waitForTimeout(3500);
      const safe = route.replace(/[^\w-]+/g, "_").replace(/^\/+|\/+$/g, "") || "root";
      await iframe.screenshot({ path: shot(`preview-route-${safe}`) });
    }
  }
});
