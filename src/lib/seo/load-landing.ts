/**
 * Läser SEO-landningssidor från JSON under `src/content/seo-landings/`.
 *
 * Varje fil representerar en sida (`{family}/{slug}.json` eller för
 * `city-usecase` `{city-usecase}/{city}__{usecase}.json`). Laddaren används
 * av route-handlers (vid statisk rendering) samt av sitemap-byggaren.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { SeoLandingContent, SeoLandingFamily } from "@/content/seo/types";

const CONTENT_ROOT = path.join(process.cwd(), "src", "content", "seo-landings");

function familyDirName(family: SeoLandingFamily): string {
  return family;
}

/** För city-usecase flyttas "/" i slug till en dubbel underscore. */
function fileBaseForSlug(family: SeoLandingFamily, slug: string): string {
  if (family === "city-usecase") {
    return slug.replace(/\//g, "__");
  }
  return slug;
}

function parseFileBaseToSlug(family: SeoLandingFamily, base: string): string {
  if (family === "city-usecase") {
    return base.replace(/__/g, "/");
  }
  return base;
}

export function seoLandingFilePath(family: SeoLandingFamily, slug: string): string {
  return path.join(CONTENT_ROOT, familyDirName(family), `${fileBaseForSlug(family, slug)}.json`);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Laddar en SEO-landningssida. Returnerar `null` om JSON saknas — pagen
 * ska då anropa `notFound()`.
 */
export async function loadSeoLanding(
  family: SeoLandingFamily,
  slug: string,
): Promise<SeoLandingContent | null> {
  const filePath = seoLandingFilePath(family, slug);
  const content = await readJson<SeoLandingContent>(filePath);
  if (!content) return null;
  if (content.family !== family || content.slug !== slug) {
    return null;
  }
  return content;
}

/**
 * Returnerar slug-listan för en familj genom att läsa filsystemet.
 * Används av `generateStaticParams` och sitemap.
 */
export async function listSeoLandingSlugs(family: SeoLandingFamily): Promise<string[]> {
  const dir = path.join(CONTENT_ROOT, familyDirName(family));
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((name) => name.endsWith(".json"))
      .map((name) => parseFileBaseToSlug(family, name.replace(/\.json$/, "")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

export interface CollectedSeoLanding {
  family: SeoLandingFamily;
  slug: string;
  generatedAt: string;
}

/**
 * Samlar alla SEO-landningar (metadata) för sitemap och intern länk-graf.
 */
export async function collectAllSeoLandings(): Promise<CollectedSeoLanding[]> {
  const families: SeoLandingFamily[] = [
    "city",
    "usecase",
    "industry",
    "ai",
    "compare",
    "city-usecase",
  ];
  const result: CollectedSeoLanding[] = [];
  for (const family of families) {
    const slugs = await listSeoLandingSlugs(family);
    for (const slug of slugs) {
      const content = await loadSeoLanding(family, slug);
      if (!content) continue;
      result.push({
        family,
        slug,
        generatedAt: content.generatedAt,
      });
    }
  }
  return result;
}
