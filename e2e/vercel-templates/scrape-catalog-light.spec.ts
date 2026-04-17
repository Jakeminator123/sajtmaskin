/**
 * Resilient catalog-only scrape: collects template (title, url, category) for
 * every Vercel use-case in the broad preset, writing an incremental output
 * after each category. No detail-page extraction (that can timeout and was
 * causing the original scrape-catalog.spec.ts to crash + lose all data).
 *
 * Output: data/dossiers/_raw/playwright-catalog-light.json
 * Format: { scrapedAt, totalTemplates, byCategory: { <cat>: [{ title, url, categorySlug }] } }
 *
 * The transformer (scripts/dossiers/import-from-playwright.ts) picks this up
 * if the original `playwright-catalog.json` is missing — see the new
 * `import-from-light-catalog.ts` companion.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const BASE_URL = "https://vercel.com/templates";
const OUTPUT_PATH = resolve(process.cwd(), "data", "dossiers", "_raw", "playwright-catalog-light.json");

// Use-case slugs aligned with our integration-relevant categories.
// Skip: edge-*, cdn, firewall, web3, microfrontends, monorepos, virtual-event,
//       backend (mostly Go/Python), security (infra not UX).
const USE_CASES: Array<{ slug: string; name: string }> = [
  { slug: "starter", name: "Starter" },
  { slug: "marketing-sites", name: "Marketing Sites" },
  { slug: "saas", name: "SaaS" },
  { slug: "ecommerce", name: "Ecommerce" },
  { slug: "blog", name: "Blog" },
  { slug: "portfolio", name: "Portfolio" },
  { slug: "cms", name: "CMS" },
  { slug: "authentication", name: "Authentication" },
  { slug: "admin-dashboard", name: "Admin Dashboard" },
  { slug: "ai", name: "AI" },
  { slug: "multi-tenant-apps", name: "Multi-Tenant Apps" },
  { slug: "realtime-apps", name: "Realtime Apps" },
  { slug: "documentation", name: "Documentation" },
];

interface CatalogTemplate {
  title: string;
  url: string;
  description: string;
  categorySlug: string;
}

interface CatalogFile {
  scrapedAt: string;
  totalTemplates: number;
  byCategory: Record<string, CatalogTemplate[]>;
}

async function scrollToBottom(page: Page): Promise<void> {
  let previousHeight = 0;
  for (let i = 0; i < 12; i += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) break;
    previousHeight = currentHeight;
  }
}

async function extractCardsForCategory(
  page: Page,
  categorySlug: string,
): Promise<CatalogTemplate[]> {
  return page.evaluate((cat: string) => {
    const cards = document.querySelectorAll("a[href^='/templates/']");
    const seen = new Set<string>();
    const entries: Array<{ title: string; url: string; description: string; categorySlug: string }> = [];
    for (const card of Array.from(cards)) {
      const href = card.getAttribute("href");
      if (!href || href === "/templates" || href.split("/").length < 3) continue;
      const fullUrl = `https://vercel.com${href}`;
      if (seen.has(fullUrl)) continue;
      seen.add(fullUrl);
      const h3 = card.querySelector("h3");
      const p = card.querySelector("p");
      const title = h3?.textContent?.trim();
      if (!title) continue;
      entries.push({
        title,
        url: fullUrl,
        description: p?.textContent?.trim() ?? "",
        categorySlug: cat,
      });
    }
    return entries;
  }, categorySlug);
}

function readExisting(): CatalogFile {
  if (!existsSync(OUTPUT_PATH)) {
    return { scrapedAt: new Date().toISOString(), totalTemplates: 0, byCategory: {} };
  }
  try {
    return JSON.parse(readFileSync(OUTPUT_PATH, "utf-8")) as CatalogFile;
  } catch {
    return { scrapedAt: new Date().toISOString(), totalTemplates: 0, byCategory: {} };
  }
}

function writeIncremental(catalog: CatalogFile): void {
  catalog.totalTemplates = Object.values(catalog.byCategory).reduce((sum, list) => sum + list.length, 0);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf-8");
}

test.describe("Vercel Template Catalog (light)", () => {
  test.setTimeout(900_000); // 15 min total

  test("scrape catalog metadata only, write incrementally", async ({ page }) => {
    const catalog = readExisting();
    const seenAcrossCategories = new Set<string>();
    for (const list of Object.values(catalog.byCategory)) {
      for (const t of list) seenAcrossCategories.add(t.url);
    }

    for (const useCase of USE_CASES) {
      const url = `${BASE_URL}?type=${useCase.slug}&framework=next.js`;
      console.log(`\n[catalog] ${useCase.name} -> ${url}`);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(2500);
        await scrollToBottom(page);
      } catch (err) {
        console.warn(`[catalog] ${useCase.slug}: navigation failed -> ${err instanceof Error ? err.message : err}`);
        continue;
      }

      const cards = await extractCardsForCategory(page, useCase.slug);
      const newOnly = cards.filter((c) => !seenAcrossCategories.has(c.url));
      for (const c of newOnly) seenAcrossCategories.add(c.url);

      catalog.byCategory[useCase.slug] = cards;
      writeIncremental(catalog);
      console.log(`[catalog] ${useCase.slug}: +${newOnly.length} new (${cards.length} visible, ${seenAcrossCategories.size} unique total)`);
    }

    catalog.scrapedAt = new Date().toISOString();
    writeIncremental(catalog);
    console.log(`\n[catalog] Done. ${catalog.totalTemplates} templates across ${Object.keys(catalog.byCategory).length} categories.`);
    console.log(`[catalog] Output: ${OUTPUT_PATH}`);
    expect(catalog.totalTemplates).toBeGreaterThan(0);
  });
});
