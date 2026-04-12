/**
 * Persona E2E test: Klara's Klipp & Styling
 * Runs through the full wizard → generation flow and captures screenshots + timing.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, "persona-screenshots");
fs.rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const BASE_URL = "http://localhost:3000";
let stepCounter = 0;

async function ss(page, label) {
  stepCounter++;
  const filename = `${String(stepCounter).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: false });
  console.log(`  📸 ${filename}`);
}

function elapsed(start) {
  const ms = Date.now() - start;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

async function clickContinue(page) {
  await page.waitForTimeout(600);
  const btn = page.locator("button").filter({ hasText: "Fortsätt" }).first();
  try {
    await btn.click({ timeout: 5000 });
    console.log("  ➡️  Fortsätt");
    await page.waitForTimeout(800);
    return true;
  } catch {
    console.log("  ⚠️  'Fortsätt' disabled or not found");
    return false;
  }
}

async function run() {
  const totalStart = Date.now();
  console.log("\n🎬 PERSONA E2E: Klara's Klipp & Styling");
  console.log("═".repeat(55));

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

  try {
    // ─── NAVIGATE ───────────────────────────────────────────
    console.log("\n📍 Navigating to builder...");
    await page.goto(`${BASE_URL}/builder`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);
    await ss(page, "initial");

    const wizardStart = Date.now();

    // ─── STEG 1: Vad bygger vi? ─────────────────────────────
    console.log("\n📋 STEG 1/9: Vad bygger vi?");
    // Click "Salong / Skönhet" since that's closer to our persona, or "Företag / Tjänster"
    const salonChip = page.locator("button").filter({ hasText: "Salong / Skönhet" });
    const foretagChip = page.locator("button").filter({ hasText: "Företag / Tjänster" });
    if (await salonChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await salonChip.click();
      console.log('  🖱️  Valde "Salong / Skönhet"');
    } else {
      await foretagChip.click({ timeout: 3000 });
      console.log('  🖱️  Valde "Företag / Tjänster"');
    }
    await ss(page, "steg1-vald");
    await clickContinue(page);

    // ─── STEG 2: Berätta om din verksamhet ──────────────────
    console.log("\n📋 STEG 2/9: Berätta om din verksamhet");
    await page.waitForTimeout(500);
    const offerArea = page.locator("textarea").first();
    await offerArea.waitFor({ state: "visible", timeout: 5000 });
    await offerArea.fill("Jag driver en frisörsalong med fokus på klippning, färgning och styling i centrala Göteborg. Vi erbjuder allt från klippning och färgning till bruduppsättningar och skäggvård. Vi använder ekologiska produkter.");
    await ss(page, "steg2-offer");
    await clickContinue(page);

    // ─── STEG 3: Befintlig hemsida ──────────────────────────
    console.log("\n📋 STEG 3/9: Befintlig hemsida");
    await page.waitForTimeout(500);
    // Check what UI we see — textarea for URL or chips
    const step3Text = await page.textContent("body");
    if (step3Text.includes("befintlig") || step3Text.includes("URL")) {
      // Skip scraping — use fictional URL that will fail, click "Börja från noll" instead
      const nollChip = page.locator("button").filter({ hasText: "Börja från noll" });
      if (await nollChip.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nollChip.click();
        console.log('  🖱️  Valde "Börja från noll"');
      } else {
        console.log("  ⚠️  No 'Börja från noll' chip, trying skip");
        const skipLink = page.locator("button, a, span").filter({ hasText: "Hoppa över" }).first();
        if (await skipLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await skipLink.click();
        }
      }
    }
    await ss(page, "steg3-befintlig");
    await clickContinue(page);

    // ─── STEG 4: Företagsuppgifter ──────────────────────────
    console.log("\n📋 STEG 4/9: Företagsuppgifter");
    await page.waitForTimeout(1000);
    await ss(page, "steg4-empty");

    // Fill in business details by label
    const fields = [
      ["Företagsnamn", "Klara's Klipp & Styling"],
      ["Telefon", "031-123 45 67"],
      ["E-post", "kontakt@klarasklipp.se"],
      ["Adress", "Avenyn 42, 411 36 Göteborg"],
      ["Öppettider", "Mån–Fre 09:00–18:00, Lör 10:00–15:00"],
    ];
    for (const [label, value] of fields) {
      // Try placeholder match
      const input = page.locator(`input[placeholder*="${label}" i], textarea[placeholder*="${label}" i]`).first();
      if (await input.isVisible({ timeout: 1500 }).catch(() => false)) {
        await input.fill(value);
        console.log(`  ✏️  ${label}: ${value}`);
      } else {
        // Try label-based
        const byLabel = page.locator(`label:has-text("${label}") + input, label:has-text("${label}") ~ input`).first();
        if (await byLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
          await byLabel.fill(value);
          console.log(`  ✏️  ${label}: ${value}`);
        }
      }
    }
    await ss(page, "steg4-filled");
    await clickContinue(page);

    // ─── STEG 5: Varumärke och stil ─────────────────────────
    console.log("\n📋 STEG 5/9: Varumärke och stil");
    await page.waitForTimeout(1000);
    const step5Text = await page.textContent("body");
    if (step5Text.includes("Varumärke") || step5Text.includes("Tagline") || step5Text.includes("stil")) {
      const taglineInput = page.locator('input[placeholder*="tagline" i], input[placeholder*="slogan" i], textarea[placeholder*="tagline" i]').first();
      if (await taglineInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await taglineInput.fill("Din salong i hjärtat av Göteborg");
        console.log('  ✏️  Tagline: "Din salong i hjärtat av Göteborg"');
      }
      // Try clicking tone chips
      for (const chip of ["Varm och personlig", "Varm", "personlig"]) {
        const el = page.locator("button").filter({ hasText: chip });
        if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
          await el.click();
          console.log(`  🖱️  Ton: "${chip}"`);
          break;
        }
      }
      // Hero image pref
      for (const chip of ["Bild från verksamheten", "Verksamhetsbild", "Bild från salongen"]) {
        const el = page.locator("button").filter({ hasText: chip });
        if (await el.isVisible({ timeout: 800 }).catch(() => false)) {
          await el.click();
          console.log(`  🖱️  Hero: "${chip}"`);
          break;
        }
      }
      // Font pref
      for (const chip of ["Modern sans-serif", "Modern", "Sans-serif"]) {
        const el = page.locator("button").filter({ hasText: chip });
        if (await el.isVisible({ timeout: 800 }).catch(() => false)) {
          await el.click();
          console.log(`  🖱️  Font: "${chip}"`);
          break;
        }
      }
    }
    await ss(page, "steg5-brand");
    await clickContinue(page);

    // ─── STEG 6: Tjänster och erbjudande ────────────────────
    console.log("\n📋 STEG 6/9: Tjänster och erbjudande");
    await page.waitForTimeout(1000);
    const step6Text = await page.textContent("body");
    if (step6Text.includes("Tjänster") || step6Text.includes("erbjudande")) {
      const serviceInput = page.locator('input, textarea').filter({ hasText: /tjänst/i }).first();
      if (await serviceInput.isVisible({ timeout: 1500 }).catch(() => false)) {
        await serviceInput.fill("Klippning, Färgning & slingor, Styling, Bruduppsättning, Skäggvård");
        console.log("  ✏️  Tjänster ifyllda");
      }
      // CTA
      for (const chip of ["Boka tid", "Boka din tid"]) {
        const el = page.locator("button").filter({ hasText: chip });
        if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
          await el.click();
          console.log(`  🖱️  CTA: "${chip}"`);
          break;
        }
      }
    }
    await ss(page, "steg6-services");
    await clickContinue(page);

    // ─── STEG 7: Mål ───────────────────────────────────────
    console.log("\n📋 STEG 7/9: Mål");
    await page.waitForTimeout(1000);
    for (const chip of ["Få fler kunder att boka tid", "Boka tid", "Få fler kunder"]) {
      const el = page.locator("button").filter({ hasText: chip });
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click();
        console.log(`  🖱️  Mål: "${chip}"`);
        break;
      }
    }
    await ss(page, "steg7-goal");
    await clickContinue(page);

    // ─── STEG 8: Målgrupp ───────────────────────────────────
    console.log("\n📋 STEG 8/9: Målgrupp");
    await page.waitForTimeout(1000);
    for (const chip of ["Kvinnor 30–55 år", "Kvinnor", "Alla målgrupper"]) {
      const el = page.locator("button").filter({ hasText: chip });
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click();
        console.log(`  🖱️  Målgrupp: "${chip}"`);
        break;
      }
    }
    await ss(page, "steg8-audience");
    await clickContinue(page);

    // ─── STEG 9: Måste finnas med ───────────────────────────
    console.log("\n📋 STEG 9/9: Vad måste finnas med?");
    await page.waitForTimeout(1000);
    for (const chip of ["Kontaktformulär", "Bokning online", "Bildgalleri", "Priser och paket"]) {
      const el = page.locator("button").filter({ hasText: chip });
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click();
        console.log(`  🖱️  Must-have: "${chip}"`);
        await page.waitForTimeout(300);
      }
    }
    await ss(page, "steg9-musthave");

    // Trigger AI suggestion if there's an AI button
    const aiBtn = page.locator("button").filter({ hasText: /AI-förslag|AI/i }).first();
    if (await aiBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await aiBtn.click();
      console.log("  🤖 Triggered AI-förslag");
      await page.waitForTimeout(5000);
    }

    await clickContinue(page);
    await page.waitForTimeout(1000);

    const wizardEnd = Date.now();
    console.log(`\n⏱️  Wizard klar: ${elapsed(wizardStart)}`);

    // ─── POST-WIZARD: Template picker / image upload ────────
    console.log("\n📍 Post-wizard steg...");
    await ss(page, "post-wizard");

    // Handle template picker if shown
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(2000);
      const bodyText = await page.textContent("body");

      if (bodyText.includes("Välj mall") || bodyText.includes("template") || bodyText.includes("inspiration")) {
        console.log("  📋 Mallval-steg — hoppar över");
        await ss(page, "template-picker");
        const skipBtn = page.locator("button, a, span").filter({ hasText: /Hoppa|Skip|Fortsätt utan/i }).first();
        if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await skipBtn.click();
        } else {
          await clickContinue(page);
        }
      } else if (bodyText.includes("Ladda upp") || bodyText.includes("bilder")) {
        console.log("  📋 Bilduppladdning — hoppar över");
        await ss(page, "image-upload");
        const skipBtn = page.locator("button").filter({ hasText: /Hoppa|Skip|Fortsätt utan|Inga bilder/i }).first();
        if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await skipBtn.click();
        } else {
          await clickContinue(page);
        }
      } else {
        break;
      }
    }

    // ─── WAIT FOR GENERATION ────────────────────────────────
    console.log("\n⏳ Väntar på AI-generering...");
    const genStart = Date.now();
    await ss(page, "generation-start");

    let previewFound = false;
    for (let i = 0; i < 72; i++) {
      await page.waitForTimeout(5000);

      const hasIframe = await page.locator("iframe").isVisible({ timeout: 500 }).catch(() => false);
      const bodyText = await page.textContent("body").catch(() => "");
      const isGenerating = bodyText.includes("Genererar") || bodyText.includes("Bygger") || bodyText.includes("Skapar");
      const hasPreviewUrl = bodyText.includes("preview") || bodyText.includes("sandbox");

      if (i % 6 === 0 || hasIframe) {
        await ss(page, `gen-${elapsed(genStart).replace(/\s/g, "")}`);
        console.log(`  ⏳ ${elapsed(genStart)} — iframe:${hasIframe} generating:${isGenerating}`);
      }

      if (hasIframe) {
        console.log(`\n✅ Preview iframe synlig efter ${elapsed(genStart)}!`);
        previewFound = true;
        await page.waitForTimeout(5000);
        await ss(page, "preview-visible");
        await page.waitForTimeout(15000);
        await ss(page, "preview-loaded");
        break;
      }

      if (i >= 71) {
        console.log("\n⚠️  Timeout — 6 minuter utan preview");
        await ss(page, "timeout");
      }
    }

    // ─── FINAL ──────────────────────────────────────────────
    await page.waitForTimeout(2000);
    await ss(page, "final");

    const totalEnd = Date.now();
    console.log("\n" + "═".repeat(55));
    console.log("📊 RESULTAT:");
    console.log(`   Wizard:       ${elapsed(wizardStart)}`);
    console.log(`   Generering:   ${previewFound ? elapsed(genStart) : "timeout"}`);
    console.log(`   Total:        ${elapsed(totalStart)}`);
    console.log(`   Preview:      ${previewFound ? "✅ Ja" : "❌ Nej"}`);
    console.log(`   Screenshots:  ${SCREENSHOTS_DIR}`);
    console.log("═".repeat(55));

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    await ss(page, "error");
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
