/**
 * Tiny smoke test: enrich just 5 templates so we can verify the extractor
 * picks up real Use Cases / Stack / Database / Auth badges + repo URL
 * before committing to a 30+ min full run.
 *
 * Hand-picked URLs that span auth + payments + db + ai + cms.
 */
import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const SAMPLE_URLS = [
  "https://vercel.com/templates/next.js/drizzle-postgres-auth-starter",
  "https://vercel.com/templates/next.js/clerk-authentication-starter",
  "https://vercel.com/templates/next.js/subscription-starter",
  "https://vercel.com/templates/next.js/supabase",
  "https://vercel.com/templates/next.js/pinecone-vercel-ai",
];

const OUT_DIR = resolve(process.cwd(), "data", "dossiers", "_raw", "_smoke");

test("enrich 5 sample templates", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUT_DIR, { recursive: true });
  for (const url of SAMPLE_URLS) {
    const slug = url.split("/").pop() ?? "unknown";
    console.log(`\n[smoke] ${slug}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2000);
    const detail = await page.evaluate(() => {
      const text = (el: Element | null): string => el?.textContent?.trim() ?? "";
      function collectSection(headerTexts: string[]): string[] {
        for (const headerText of headerTexts) {
          const headers = Array.from(document.querySelectorAll("h2, h3, h4, p, span, div"))
            .filter((el) => el.textContent?.trim().toLowerCase() === headerText.toLowerCase());
          for (const header of headers) {
            const items: string[] = [];
            let node: Element | null = header.nextElementSibling;
            let safety = 0;
            const STOP_HEADERS = ["GitHub Repo", "Use Cases", "Use Case", "Stack", "Database", "Auth", "CMS", "Framework"].map(s => s.toLowerCase());
            while (node && safety < 50) {
              const nodeText = node.textContent?.trim().toLowerCase() ?? "";
              if (nodeText && STOP_HEADERS.some(h => nodeText === h || nodeText.startsWith(h + " "))) break;
              const anchors = node.querySelectorAll("a");
              if (anchors.length > 0) {
                for (const a of Array.from(anchors)) {
                  const t = a.textContent?.trim();
                  if (t && t.length < 60) items.push(t);
                }
                if (items.length > 0) return items;
              }
              if (node.tagName === "A") {
                const t = node.textContent?.trim();
                if (t && t.length < 60) items.push(t);
              }
              node = node.nextElementSibling;
              safety++;
            }
            if (items.length > 0) return items;
          }
        }
        return [];
      }
      const repoAnchors = Array.from(document.querySelectorAll("a[href*='github.com/']"));
      let repoUrl: string | null = null;
      for (const a of repoAnchors) {
        const href = a.getAttribute("href") ?? "";
        const path = href.replace(/^https?:\/\/github\.com\//, "").split(/[?#]/)[0]?.split("/") ?? [];
        if (path.length < 2) continue;
        if (["orgs", "marketplace", "search", "user-attachments"].includes(path[0] ?? "")) continue;
        if (["issues", "discussions", "actions", "pulls", "wiki"].includes(path[2] ?? "")) continue;
        repoUrl = `https://github.com/${path[0]}/${path[1]}`;
        break;
      }
      return {
        title: text(document.querySelector("h1")),
        useCases: collectSection(["Use Cases", "Use Case"]),
        stack: collectSection(["Stack"]),
        database: collectSection(["Database"]),
        cms: collectSection(["CMS"]),
        auth: collectSection(["Auth"]),
        framework: collectSection(["Framework"]),
        repoUrl,
      };
    });
    writeFileSync(join(OUT_DIR, `${slug}.json`), JSON.stringify(detail, null, 2) + "\n", "utf-8");
    console.log(`  title: ${detail.title}`);
    console.log(`  repoUrl: ${detail.repoUrl}`);
    console.log(`  useCases: ${JSON.stringify(detail.useCases)}`);
    console.log(`  stack: ${JSON.stringify(detail.stack)}`);
    console.log(`  database: ${JSON.stringify(detail.database)}`);
    console.log(`  auth: ${JSON.stringify(detail.auth)}`);
  }
});
