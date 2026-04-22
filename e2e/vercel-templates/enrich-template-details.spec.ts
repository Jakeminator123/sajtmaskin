/**
 * Resilient detail-page enrichment for Vercel templates.
 *
 * For each template in playwright-catalog-light.json, fetch the detail page
 * (bild 4 in user's screenshots) and extract real metadata:
 *   - Use Cases badges      (e.g. "Starter", "Authentication")
 *   - Stack badges          (e.g. "Next.js", "Tailwind")
 *   - Database badge        (e.g. "Postgres")
 *   - CMS badge             (e.g. "Sanity")
 *   - Authentication badge  (e.g. "NextAuth.js")
 *   - Framework badge       (filter)
 *   - GitHub Repo URL       (always shown in right column)
 *   - Demo URL              (Deploy / View Demo button)
 *
 * Why a NEW skript: e2e/vercel-templates/scrape-catalog.spec.ts has the same
 * goal but writes ALL data only after the entire loop succeeds. One timeout
 * = lost everything (verified — 20 min crash threw away 426 templates).
 *
 * This script:
 * - Uses Playwright (JS-rendering needed for badges)
 * - Writes incrementally per template to data/dossiers/_raw/_enriched/<id>.json
 * - Try/catch per template — one failure does not stop the loop
 * - Resumes — skips files that already exist on disk
 *
 * Usage:
 *   npx playwright test e2e/vercel-templates/enrich-template-details.spec.ts
 *
 * Or via npm: `npm run dossiers:enrich`
 */

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const RAW_ROOT = resolve(process.cwd(), "data", "dossiers", "_raw");
const CATALOG_PATH = join(RAW_ROOT, "playwright-catalog-light.json");
const ENRICHED_DIR = join(RAW_ROOT, "_enriched");

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

interface EnrichedTemplate {
  templateUrl: string;
  templateSlug: string;
  title: string;
  description: string;
  useCases: string[];
  stack: string[];
  database: string[];
  cms: string[];
  authentication: string[];
  framework: string[];
  repoUrl: string | null;
  demoUrl: string | null;
  enrichedAt: string;
}

function templateSlugFromUrl(url: string): string {
  const parts = url.replace(/\/+$/, "").split("/");
  return `${parts[parts.length - 2] ?? "unknown"}-${parts[parts.length - 1] ?? "unknown"}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
}

function loadCatalogTemplates(): CatalogTemplate[] {
  if (!existsSync(CATALOG_PATH)) {
    throw new Error(`Missing ${CATALOG_PATH}. Run npm run dossiers:scrape first.`);
  }
  const catalog: CatalogFile = JSON.parse(readFileSync(CATALOG_PATH, "utf-8"));
  const byUrl = new Map<string, CatalogTemplate>();
  for (const list of Object.values(catalog.byCategory)) {
    for (const t of list) {
      if (!byUrl.has(t.url)) byUrl.set(t.url, t);
    }
  }
  return [...byUrl.values()];
}

function alreadyEnriched(slug: string): boolean {
  return existsSync(join(ENRICHED_DIR, `${slug}.json`));
}

async function extractTemplateDetail(page: Page): Promise<Partial<EnrichedTemplate>> {
  return page.evaluate(() => {
    const text = (el: Element | null): string => el?.textContent?.trim() ?? "";

    // Title (h1)
    const title = text(document.querySelector("h1"));

    // Description (meta or first p in main)
    const metaDesc = document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ?? "";
    const firstP = text(document.querySelector("main p, article p"));
    const description = metaDesc || firstP;

    // Right-column metadata sections (bild 4): "GitHub Repo", "Use Cases", "Stack", "Database", "Auth", "CMS", "Framework"
    // The page uses h3-like section headers followed by anchor pills/badges.
    // We collect them by walking each section header and gathering the
    // text of all anchors immediately following it until the next header.
    function collectSection(headerText: string): string[] {
      const headers = Array.from(document.querySelectorAll("h2, h3, h4, p, span, div"))
        .filter((el) => el.textContent?.trim().toLowerCase() === headerText.toLowerCase());
      for (const header of headers) {
        // Look at next siblings' anchors until another section header appears.
        const items: string[] = [];
        let node: Element | null = header.nextElementSibling;
        let safety = 0;
        while (node && safety < 50) {
          const nodeText = node.textContent?.trim() ?? "";
          // Stop if we've hit another section header (a header-like element)
          if (
            nodeText &&
            ["GitHub Repo", "Use Cases", "Stack", "Database", "Auth", "CMS", "Framework", "Use Case"].some((h) =>
              nodeText.toLowerCase().startsWith(h.toLowerCase()) && nodeText.length < 40,
            )
          ) {
            break;
          }
          // Collect anchor texts (badges)
          const anchors = node.querySelectorAll("a");
          if (anchors.length > 0) {
            for (const a of Array.from(anchors)) {
              const t = a.textContent?.trim();
              if (t && t.length < 60) items.push(t);
            }
            if (items.length > 0) return items;
          }
          // Or direct text content of the element if it looks like a single badge
          if (node.tagName === "A") {
            if (nodeText && nodeText.length < 60) items.push(nodeText);
          }
          node = node.nextElementSibling;
          safety++;
        }
        if (items.length > 0) return items;
      }
      return [];
    }

    // Find all GitHub-repo URLs anywhere on the page; prefer the first one
    // that doesn't include /issues, /discussions, /actions, /commit, etc.
    function findRepoUrl(): string | null {
      const anchors = Array.from(document.querySelectorAll("a[href*='github.com/']"));
      for (const a of anchors) {
        const href = a.getAttribute("href") ?? "";
        if (!/^https?:\/\/github\.com\//.test(href)) continue;
        const path = href.replace(/^https?:\/\/github\.com\//, "").split(/[?#]/)[0]?.split("/") ?? [];
        if (path.length < 2) continue;
        if (["issues", "discussions", "actions", "pulls", "wiki", "blob", "tree", "commit", "releases"].includes(path[2] ?? "")) continue;
        if (["orgs", "marketplace", "search", "user-attachments"].includes(path[0] ?? "")) continue;
        return `https://github.com/${path[0]}/${path[1]}`;
      }
      return null;
    }

    function findDemoUrl(repoUrl: string | null): string | null {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      for (const a of anchors) {
        const href = a.getAttribute("href") ?? "";
        const text = a.textContent?.trim().toLowerCase() ?? "";
        if (!/^https?:\/\//.test(href)) continue;
        if (href === repoUrl) continue;
        if (/^https?:\/\/(github|gitlab|bitbucket|vercel)\.com/.test(href)) continue;
        if (/view demo|live demo/.test(text) || /\.vercel\.app/.test(href)) {
          return href;
        }
      }
      return null;
    }

    const repoUrl = findRepoUrl();
    const demoUrl = findDemoUrl(repoUrl);

    return {
      title,
      description,
      useCases: collectSection("Use Cases").length > 0 ? collectSection("Use Cases") : collectSection("Use Case"),
      stack: collectSection("Stack"),
      database: collectSection("Database"),
      cms: collectSection("CMS"),
      authentication: collectSection("Auth"),
      framework: collectSection("Framework"),
      repoUrl,
      demoUrl,
    } as Partial<EnrichedTemplate>;
  });
}

test.describe("Vercel Template Detail Enrichment", () => {
  test.setTimeout(3_600_000); // 60 min — for ~400 templates at ~5s each

  test("enrich every template with detail-page metadata, write incrementally", async ({ page }) => {
    mkdirSync(ENRICHED_DIR, { recursive: true });
    const templates = loadCatalogTemplates();
    console.log(`[enrich] ${templates.length} templates to process`);
    let done = 0;
    let skipped = 0;
    let failed = 0;
    const startTs = Date.now();

    for (const template of templates) {
      const slug = templateSlugFromUrl(template.url);
      if (alreadyEnriched(slug)) {
        skipped++;
        continue;
      }

      try {
        await page.goto(template.url, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(1500);
        const detail = await extractTemplateDetail(page);
        const enriched: EnrichedTemplate = {
          templateUrl: template.url,
          templateSlug: slug,
          title: detail.title || template.title,
          description: detail.description || template.description,
          useCases: detail.useCases ?? [],
          stack: detail.stack ?? [],
          database: detail.database ?? [],
          cms: detail.cms ?? [],
          authentication: detail.authentication ?? [],
          framework: detail.framework ?? [],
          repoUrl: detail.repoUrl ?? null,
          demoUrl: detail.demoUrl ?? null,
          enrichedAt: new Date().toISOString(),
        };
        writeFileSync(
          join(ENRICHED_DIR, `${slug}.json`),
          JSON.stringify(enriched, null, 2) + "\n",
          "utf-8",
        );
        done++;

        if (done % 25 === 0) {
          const minsElapsed = Math.round((Date.now() - startTs) / 60000);
          console.log(`[enrich] ${done}/${templates.length - skipped} done after ${minsElapsed}m (${skipped} resumed, ${failed} failed)`);
        }
      } catch (err) {
        failed++;
        console.warn(`[enrich] FAIL ${slug}: ${err instanceof Error ? err.message : err}`);
        // Write a stub so we don't retry infinitely; mark as failed.
        writeFileSync(
          join(ENRICHED_DIR, `${slug}.json`),
          JSON.stringify({
            templateUrl: template.url,
            templateSlug: slug,
            title: template.title,
            _failed: true,
            _failureReason: err instanceof Error ? err.message : String(err),
            enrichedAt: new Date().toISOString(),
          }, null, 2) + "\n",
          "utf-8",
        );
      }
    }

    console.log(`[enrich] Done. ${done} enriched, ${skipped} resumed, ${failed} failed.`);
    expect(done + skipped).toBeGreaterThan(0);
  });
});
