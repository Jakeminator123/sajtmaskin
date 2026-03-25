/**
 * Playwright discovery wrapper for the external-template research lane.
 *
 * Two modes:
 *
 * 1. INTERACTIVE (default, --headed):
 *    Opens vercel.com/templates and PAUSES so you can fine-tune the filters
 *    in the browser before scraping the currently visible result set.
 *
 * 2. AUTOMATED:
 *    Uses query-param presets to collect repeatable focused and second-pass sets.
 *
 * Output:
 *   research/external-templates/raw-discovery/current/summary.json
 *   research/external-templates/raw-discovery/current/catalog.json
 *   research/external-templates/raw-discovery/current/source-metadata.json
 *   research/external-templates/raw-discovery/current/playwright-catalog.json
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RAW_DISCOVERY_CURRENT_ROOT,
  normalizePlaywrightCatalog,
  writeCanonicalDiscoveryDataset,
  type PlaywrightCatalogFile,
  type PlaywrightTemplateEntry,
} from "../../scripts/template-library-discovery";

const BASE_URL = "https://vercel.com/templates";
const OUTPUT_DIR = RAW_DISCOVERY_CURRENT_ROOT;

const STACK_PRESETS: Record<string, Record<string, string[]>> = {
  sajtmaskin: {
    framework: ["next.js"],
    css: ["tailwind"],
    type: [
      "starter", "ecommerce", "saas", "blog", "portfolio", "cms",
      "authentication", "admin-dashboard", "marketing-sites", "documentation",
    ],
  },
  secondPass: {
    framework: ["next.js"],
    type: ["ai", "multi-tenant-apps", "realtime-apps", "security"],
  },
  broad: {
    framework: ["next.js"],
    type: [
      "ai", "starter", "ecommerce", "saas", "blog", "portfolio", "cms",
      "backend", "cron", "multi-tenant-apps", "realtime-apps", "documentation",
      "authentication", "marketing-sites", "admin-dashboard", "security",
    ],
  },
};

type TemplateCard = {
  title: string;
  description: string;
  url: string;
  categories: string[];
  imageUrl: string | null;
  stackTags: string[];
};

function buildFilterUrl(filters: Record<string, string[]>): string {
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(filters)) {
    for (const value of values) {
      params.append(key, value);
    }
  }
  return `${BASE_URL}?${params.toString()}`;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.replace(/\s+/g, " ").trim() ?? "")
        .filter(Boolean),
    ),
  );
}

async function scrollToBottom(page: Page) {
  let previousHeight = 0;
  let attempts = 0;
  const MAX_ATTEMPTS = 20;

  while (attempts < MAX_ATTEMPTS) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) break;
    previousHeight = currentHeight;
    attempts++;
  }
}

async function extractTemplateCards(page: Page): Promise<TemplateCard[]> {
  return page.evaluate(() => {
    const cards = document.querySelectorAll("a[href^='/templates/']");
    const entries: TemplateCard[] = [];
    const seen = new Set<string>();

    for (const card of cards) {
      const href = card.getAttribute("href");
      if (!href || href === "/templates" || href.split("/").length < 3) continue;
      const fullUrl = `https://vercel.com${href}`;
      if (seen.has(fullUrl)) continue;
      seen.add(fullUrl);

      const category = href.split("/")[2] ?? "";
      const h3 = card.querySelector("h3");
      const p = card.querySelector("p");
      const img = card.querySelector("img");

      const tagEls = card.querySelectorAll("[class*='badge'], [class*='tag'], [class*='chip']");
      const tags = Array.from(tagEls).map(el => el.textContent?.trim() ?? "").filter(Boolean);

      if (h3?.textContent?.trim()) {
        entries.push({
          title: h3.textContent.trim(),
          description: p?.textContent?.trim() ?? "",
          url: fullUrl,
          categories: category ? [category] : [],
          imageUrl: img?.getAttribute("src") ?? null,
          stackTags: tags,
        });
      }
    }

    return entries;
  });
}

async function extractTemplateDetails(
  page: Page,
  template: TemplateCard,
  fallbackFrameworkReason: string,
): Promise<PlaywrightTemplateEntry> {
  await page.goto(template.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  return page.evaluate(
    ({ template, fallbackFrameworkReason }) => {
      const makeAbsolute = (href: string) => {
        try {
          return new URL(href, window.location.href).toString();
        } catch {
          return href;
        }
      };

      const anchors = Array.from(document.querySelectorAll("a[href]")).map((anchor) => ({
        href: makeAbsolute(anchor.getAttribute("href") ?? ""),
        text: anchor.textContent?.replace(/\s+/g, " ").trim() ?? "",
      }));

      const repoUrl =
        anchors.find((anchor) => /github\.com\/|app\.netlify\.com\/start\/deploy/i.test(anchor.href))?.href ?? null;

      const demoCandidates = anchors
        .filter((anchor) => {
          if (!anchor.href || anchor.href === repoUrl) return false;
          try {
            const parsed = new URL(anchor.href);
            if (!/^https?:$/.test(parsed.protocol)) return false;
            if (["github.com", "gitlab.com", "bitbucket.org"].includes(parsed.hostname)) return false;
            if (parsed.hostname === "app.netlify.com" && parsed.pathname.startsWith("/start/deploy")) return false;
            if (parsed.hostname === "vercel.com") return false;
            return true;
          } catch {
            return false;
          }
        })
        .map((anchor) => {
          let score = 0;
          const text = anchor.text.toLowerCase();
          try {
            const parsed = new URL(anchor.href);
            if (parsed.hostname.endsWith(".vercel.app")) score += 4;
            if (/view demo|live demo/.test(text)) score += 6;
            else if (/\bdemo\b/.test(text)) score += 4;
            if (/preview|live|example/.test(text)) score += 2;
            if (parsed.hostname !== window.location.hostname) score += 1;
          } catch {
            score -= 10;
          }
          return { ...anchor, score };
        })
        .sort((a, b) => b.score - a.score);

      const demoUrl = demoCandidates[0]?.href ?? null;

      const visibleText = Array.from(
        document.querySelectorAll(
          "main h1, main h2, main h3, main p, main li, main a, main code, article h1, article h2, article h3, article p, article li, article a, article code",
        ),
      )
        .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter(Boolean);

      const stackTags = Array.from(
        document.querySelectorAll("[class*='badge'], [class*='tag'], [class*='chip'], a[href*='framework='], a[href*='css=']"),
      )
        .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter(Boolean);

      const signals = [template.title, template.description, ...template.stackTags, ...stackTags, ...visibleText]
        .join("\n")
        .toLowerCase();

      const frameworkReasons = [
        /next\.?js/.test(signals) ? "Next.js" : null,
        /\breact\b/.test(signals) ? "React" : null,
        !/next\.?js|\breact\b/.test(signals) ? fallbackFrameworkReason : null,
      ].filter(Boolean) as string[];

      const importantLines = Array.from(
        new Set(
          [template.title, template.description, ...stackTags, ...visibleText]
            .map((value) => value.replace(/\s+/g, " ").trim())
            .filter((value) => value.length >= 2)
            .slice(0, 28),
        ),
      );

      return {
        title: template.title,
        description: template.description,
        url: template.url,
        categories: template.categories,
        imageUrl: template.imageUrl,
        stackTags: Array.from(new Set([...template.stackTags, ...stackTags])),
        repoUrl,
        demoUrl,
        frameworkMatch: frameworkReasons.length > 0,
        frameworkReason: frameworkReasons.join(", ") || fallbackFrameworkReason,
        importantLines,
      };
    },
    { template, fallbackFrameworkReason },
  );
}

async function enrichTemplates(page: Page, templates: TemplateCard[], presetName: string): Promise<PlaywrightTemplateEntry[]> {
  const enriched: PlaywrightTemplateEntry[] = [];
  const fallbackFrameworkReason =
    presetName === "manual"
      ? "Collected from the currently filtered Vercel template catalog"
      : `Collected from the "${presetName}" Next.js-filtered Vercel template preset`;

  for (const [index, template] of templates.entries()) {
    console.log(`[detail ${index + 1}/${templates.length}] ${template.title}`);
    enriched.push(await extractTemplateDetails(page, template, fallbackFrameworkReason));
  }

  return enriched;
}

function writeOutputs(catalog: PlaywrightCatalogFile) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const playwrightCatalogPath = resolve(OUTPUT_DIR, "playwright-catalog.json");
  writeFileSync(playwrightCatalogPath, JSON.stringify(catalog, null, 2), "utf-8");

  const { summary, flatEntries } = normalizePlaywrightCatalog(catalog);
  writeCanonicalDiscoveryDataset({
    outputRoot: OUTPUT_DIR,
    summary,
    flatEntries,
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceKind: "playwright-catalog",
      sourceLabel: "vercel-templates-playwright",
      sourcePath: playwrightCatalogPath,
      sourceUrl: catalog.sourceUrl,
      filterPreset: catalog.filterPreset,
      totalTemplates: flatEntries.length,
      categorySlugs: Object.keys(summary).sort(),
    },
  });

  return {
    playwrightCatalogPath,
    summaryPath: resolve(OUTPUT_DIR, "summary.json"),
    catalogPath: resolve(OUTPUT_DIR, "catalog.json"),
  };
}

async function runPresetScrape(page: Page, presetName: keyof typeof STACK_PRESETS): Promise<PlaywrightCatalogFile> {
  const preset = STACK_PRESETS[presetName];
  const allTemplates: TemplateCard[] = [];
  const seen = new Set<string>();

  for (const useCase of preset.type) {
    const filters: Record<string, string[]> = {
      type: [useCase],
      framework: preset.framework,
    };
    if (preset.css) {
      filters.css = preset.css;
    }

    const url = buildFilterUrl(filters);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await scrollToBottom(page);

    const cards = await extractTemplateCards(page);
    let added = 0;
    for (const card of cards) {
      if (!seen.has(card.url)) {
        seen.add(card.url);
        if (!card.categories.includes(useCase)) {
          card.categories.push(useCase);
        }
        allTemplates.push(card);
        added++;
      } else {
        const existing = allTemplates.find((template) => template.url === card.url);
        if (existing && !existing.categories.includes(useCase)) {
          existing.categories.push(useCase);
        }
      }
    }

    console.log(`[${presetName}/${useCase}] +${added} new (${cards.length} visible, ${seen.size} total unique)`);
  }

  const enrichedTemplates = await enrichTemplates(page, allTemplates, presetName);
  return {
    scrapedAt: new Date().toISOString(),
    sourceUrl: BASE_URL,
    filterPreset: presetName,
    appliedFilters: preset,
    totalTemplates: enrichedTemplates.length,
    templates: enrichedTemplates,
  };
}

test.describe("Vercel Template Catalog Scraper", () => {
  test.setTimeout(1_200_000);

  test("interactive: pause for manual filter selection, then scrape", async ({ page }) => {
    const presetName = process.env.FILTER_PRESET ?? "";
    const preset = STACK_PRESETS[presetName];

    if (preset) {
      const url = buildFilterUrl(preset);
      console.log(`\nUsing preset "${presetName}": ${url}\n`);
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
    } else {
      console.log("\n╔══════════════════════════════════════════════════════════╗");
      console.log("║  INTERACTIVE MODE                                        ║");
      console.log("║                                                          ║");
      console.log("║  1. The browser will open vercel.com/templates            ║");
      console.log("║  2. Use the filter checkboxes on the LEFT to narrow down  ║");
      console.log("║     - Framework: Next.js                                  ║");
      console.log("║     - CSS: Tailwind                                       ║");
      console.log("║     - Use Case: the categories you want                   ║");
      console.log("║     - Database / CMS / Auth: as needed                    ║");
      console.log("║  3. Scroll down to load all visible templates             ║");
      console.log("║  4. When satisfied, press RESUME in Playwright inspector  ║");
      console.log("╚══════════════════════════════════════════════════════════╝\n");

      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);

      await page.pause();
    }

    await scrollToBottom(page);

    const currentUrl = page.url();
    const templates = await extractTemplateCards(page);
    const enrichedTemplates = await enrichTemplates(page, templates, presetName || "manual");

    const output: PlaywrightCatalogFile = {
      scrapedAt: new Date().toISOString(),
      sourceUrl: currentUrl,
      filterPreset: presetName || "manual",
      totalTemplates: enrichedTemplates.length,
      templates: enrichedTemplates,
    };

    const paths = writeOutputs(output);

    console.log(`\nScraped ${enrichedTemplates.length} templates`);
    console.log(`Filters applied: ${currentUrl}`);
    console.log(`Summary: ${paths.summaryPath}`);
    console.log(`Catalog: ${paths.catalogPath}`);
    console.log(`Playwright snapshot: ${paths.playwrightCatalogPath}\n`);

    expect(enrichedTemplates.length).toBeGreaterThan(0);
  });

  test("automated: scrape with sajtmaskin preset filters", async ({ page }) => {
    const output = await runPresetScrape(page, "sajtmaskin");
    const paths = writeOutputs(output);

    console.log(`\nTotal unique templates: ${output.totalTemplates}`);
    console.log(`Summary: ${paths.summaryPath}`);
    console.log(`Catalog: ${paths.catalogPath}`);
    console.log(`Playwright snapshot: ${paths.playwrightCatalogPath}\n`);

    expect(output.totalTemplates).toBeGreaterThan(0);
  });

  test("automated: scrape with secondPass preset filters", async ({ page }) => {
    const output = await runPresetScrape(page, "secondPass");
    const paths = writeOutputs(output);

    console.log(`\nTotal unique templates: ${output.totalTemplates}`);
    console.log(`Summary: ${paths.summaryPath}`);
    console.log(`Catalog: ${paths.catalogPath}`);
    console.log(`Playwright snapshot: ${paths.playwrightCatalogPath}\n`);

    expect(output.totalTemplates).toBeGreaterThan(0);
  });

  test("automated: scrape with broad preset filters", async ({ page }) => {
    const output = await runPresetScrape(page, "broad");
    const paths = writeOutputs(output);

    console.log(`\nTotal unique templates: ${output.totalTemplates}`);
    console.log(`Summary: ${paths.summaryPath}`);
    console.log(`Catalog: ${paths.catalogPath}`);
    console.log(`Playwright snapshot: ${paths.playwrightCatalogPath}\n`);

    expect(output.totalTemplates).toBeGreaterThan(0);
  });
});
