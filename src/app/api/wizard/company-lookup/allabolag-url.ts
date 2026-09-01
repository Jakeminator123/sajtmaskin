const ALLABOLAG_HOSTS = new Set(["allabolag.se", "www.allabolag.se"]);

export const ALLABOLAG_BASE = "https://www.allabolag.se";

/** Pin Cheerio/Brave follow-up fetches to allabolag.se company pages. */
export function resolveAllabolagCompanyUrl(
  raw: string,
  base: string = ALLABOLAG_BASE,
): URL | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!ALLABOLAG_HOSTS.has(host)) return null;
    if (!url.pathname.includes("/foretag/")) return null;
    url.protocol = "https:";
    return url;
  } catch {
    return null;
  }
}
