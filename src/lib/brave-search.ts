/**
 * Thin wrapper around the Brave Web Search API.
 * Returns [] on error or missing key — never throws.
 */

import { SECRETS, FEATURES } from "@/lib/config";

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

interface BraveApiResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
}

export async function braveWebSearch(
  query: string,
  count = 5,
): Promise<BraveSearchResult[]> {
  if (!FEATURES.useBraveSearch) return [];

  const apiKey = SECRETS.braveApiKey;
  if (!apiKey) return [];

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];

    const data: BraveApiResponse = await res.json();
    const results = data.web?.results;
    if (!Array.isArray(results)) return [];

    return results
      .filter((r) => r.title && r.url)
      .map((r) => ({
        title: r.title!,
        url: r.url!,
        description: r.description ?? "",
      }));
  } catch {
    return [];
  }
}
