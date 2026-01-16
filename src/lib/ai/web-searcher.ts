/**
 * Web Searcher
 * =============
 *
 * Hanterar webbsökning med OpenAI Responses API (web_search tool).
 * Används för att hämta information från externa webbplatser.
 *
 * VIKTIGT: Web search använder OpenAI API direkt, INTE v0!
 */

import OpenAI from "openai";
import { getUserSettings } from "@/lib/data/database";
import { debugLog } from "@/lib/utils/debug";
import { SECRETS } from "@/lib/config";
import { OPENAI_MODELS } from "@/lib/ai/openai-models";

// ════════════════════════════════════════════════════════════════════════════
// OPENAI CLIENT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get OpenAI client for web search.
 */
export function getSearchClient(userId?: string): OpenAI {
  if (userId) {
    try {
      const settings = getUserSettings(userId);
      if (settings?.openai_api_key) {
        debugLog("AI", "[WebSearcher] Using user's OpenAI key");
        return new OpenAI({ apiKey: settings.openai_api_key });
      }
    } catch (e) {
      console.warn("[WebSearcher] Could not get user settings:", e);
    }
  }

  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY required for web search");
  }
  return new OpenAI({ apiKey });
}

// ════════════════════════════════════════════════════════════════════════════
// WEB SEARCH
// ════════════════════════════════════════════════════════════════════════════

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  summary: string;
  results: WebSearchResult[];
}

/**
 * Perform web search using OpenAI Responses API with web_search tool.
 */
export async function searchWeb(
  query: string,
  userId?: string
): Promise<WebSearchResponse> {
  const client = getSearchClient(userId);
  const results: WebSearchResult[] = [];

  try {
    const response = await client.responses.create({
      model: OPENAI_MODELS.webSearch,
      instructions:
        "Du är en webbdesign-expert. Baserat på web search-resultaten, ge en informativ sammanfattning på svenska om designtrender, färger, layouter etc. för den nämnda webbplatsen eller konceptet.",
      input: query,
      tools: [{ type: "web_search" }],
      store: false,
    });

    // Extract web search results from output
    if (response.output) {
      for (const item of response.output) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemAny = item as any;

        if (
          itemAny.type === "web_search_call_output" &&
          itemAny.result &&
          Array.isArray(itemAny.result)
        ) {
          for (const searchItem of itemAny.result) {
            if (searchItem.title && searchItem.url) {
              results.push({
                title: searchItem.title,
                url: searchItem.url,
                snippet: searchItem.snippet || "",
              });
            }
          }
        }
      }
    }

    debugLog("AI", `[WebSearcher] Found ${results.length} results for: ${query}`);

    return {
      summary: response.output_text || "",
      results,
    };
  } catch (error) {
    console.error("[WebSearcher] Search failed:", error);
    return { summary: "", results: [] };
  }
}
