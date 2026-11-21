#!/usr/bin/env node
// Tells Bing (and the other IndexNow search engines) which pages to fetch again.
// Run after a production release: `npm run indexnow`. `--dry-run` prints the request only.
//
// The key is public by design: the search engine reads public/<key>.txt on the site to
// confirm that whoever sends the list also controls the domain.
import { pathToFileURL } from "node:url";

export const INDEXNOW_HOST = "sajtmaskin.se";
export const INDEXNOW_KEY = "ea26d3db1b0e560f960e899258a2589d";
export const INDEXNOW_KEY_URL = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const SITEMAP_URL = `https://${INDEXNOW_HOST}/sitemap.xml`;

/** Every <loc> in the sitemap that belongs to the production host. */
export function sitemapUrls(xml, host = INDEXNOW_HOST) {
  const urls = [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
  return [...new Set(urls)].filter((url) => {
    try {
      return new URL(url).host === host;
    } catch {
      return false;
    }
  });
}

export function indexNowPayload(urlList) {
  return { host: INDEXNOW_HOST, key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_URL, urlList };
}

export async function submitIndexNow({ dryRun = false, fetcher = fetch, log = console.log } = {}) {
  const sitemap = await fetcher(SITEMAP_URL);
  if (!sitemap.ok) throw new Error(`Sitemapen svarade ${sitemap.status}`);
  const urls = sitemapUrls(await sitemap.text());
  if (!urls.length) throw new Error("Sitemapen innehåller inga adresser för sajtmaskin.se");

  // Without the key file in production the search engine rejects the list.
  const keyFile = await fetcher(INDEXNOW_KEY_URL);
  const keyText = keyFile.ok ? (await keyFile.text()).trim() : "";
  if (keyText !== INDEXNOW_KEY) {
    throw new Error(`Nyckelfilen ${INDEXNOW_KEY_URL} finns inte i produktion än (svar ${keyFile.status})`);
  }

  const payload = indexNowPayload(urls);
  if (dryRun) {
    log(`[indexnow] torrkörning: ${urls.length} adresser skulle skickas`);
    return { submitted: 0, urls };
  }
  const response = await fetcher(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  // 200 = mottaget, 202 = mottaget och nyckeln kontrolleras senare.
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow svarade ${response.status}`);
  }
  log(`[indexnow] ${urls.length} adresser skickade (svar ${response.status})`);
  return { submitted: urls.length, urls };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  submitIndexNow({ dryRun: process.argv.includes("--dry-run") }).catch((error) => {
    console.error(`[indexnow] ${error.message}`);
    process.exitCode = 1;
  });
}
