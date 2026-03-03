/**
 * API Route: Company Lookup
 * POST /api/wizard/company-lookup
 *
 * Looks up Swedish company data from allabolag.se (Cheerio scrape)
 * with AI web_search as fallback. Never blocks the wizard flow.
 */

import { NextResponse } from "next/server";
import { generateText, gateway } from "ai";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { requireNotBot } from "@/lib/botProtection";
import { debugLog } from "@/lib/utils/debug";
import { prepareCredits } from "@/lib/credits/server";
import { braveWebSearch } from "@/lib/brave-search";

export const runtime = "nodejs";
export const maxDuration = 25;

const ALLABOLAG_BASE = "https://www.allabolag.se";

const requestSchema = z.object({
  companyName: z.string().min(1).max(300),
  orgNr: z.string().max(20).optional(),
});

export interface CompanyLookupResult {
  found: boolean;
  companyName?: string;
  orgNr?: string;
  companyType?: string;
  city?: string;
  address?: string;
  industries?: string[];
  revenueKsek?: number;
  employees?: number;
  ceo?: string;
  homepage?: string;
  purpose?: string;
  source?: "allabolag" | "ai_search" | "none";
}

const EMPTY_RESULT: CompanyLookupResult = { found: false, source: "none" };

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
};

function safeInt(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function fmtOrgNr(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : raw;
}

async function lookupViaCheerio(companyName: string): Promise<CompanyLookupResult> {
  const searchUrl = `${ALLABOLAG_BASE}/bransch-sok?q=${encodeURIComponent(companyName)}`;
  const searchRes = await fetch(searchUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!searchRes.ok) throw new Error(`Search returned ${searchRes.status}`);

  const cheerio = await import("cheerio");
  const searchHtml = await searchRes.text();
  const $search = cheerio.load(searchHtml);

  const firstLink = $search('a[href*="/foretag/"]')
    .toArray()
    .map((el) => $search(el).attr("href") || "")
    .find((href) => href.split("/").length > 4);

  if (!firstLink) throw new Error("No company link found");

  const companyUrl = firstLink.startsWith("http") ? firstLink : `${ALLABOLAG_BASE}${firstLink}`;
  const companyRes = await fetch(companyUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!companyRes.ok) throw new Error(`Company page returned ${companyRes.status}`);

  const companyHtml = await companyRes.text();
  const $company = cheerio.load(companyHtml);
  const nextDataScript = $company("#__NEXT_DATA__").html();
  if (!nextDataScript) throw new Error("No __NEXT_DATA__ found");

  const nextData = JSON.parse(nextDataScript);
  const c = nextData?.props?.pageProps?.company;
  if (!c) throw new Error("No company object in __NEXT_DATA__");

  const addr = c.visitorAddress || {};
  const cp = c.contactPerson || {};

  return {
    found: true,
    companyName: c.name || companyName,
    orgNr: fmtOrgNr(c.orgnr || ""),
    companyType: c.companyType?.name,
    city: addr.postPlace || undefined,
    address: [addr.addressLine, addr.zipCode, addr.postPlace].filter(Boolean).join(", "),
    industries: (c.industries || []).map((i: { name?: string }) => i.name).filter(Boolean),
    revenueKsek: safeInt(c.revenue),
    employees: safeInt(c.employees),
    ceo: cp.name ? `${cp.name}${cp.role ? ` (${cp.role})` : ""}` : undefined,
    homepage: (c.homePage || "").trim() || undefined,
    purpose: (c.purpose || "").slice(0, 300) || undefined,
    source: "allabolag",
  };
}

/**
 * Step 2: Brave Search → find allabolag URL → Cheerio-scrape it.
 * Searches for the company on Brave, extracts the first allabolag.se
 * company page link, then scrapes that page with Cheerio.
 */
async function lookupViaBraveSearch(companyName: string): Promise<CompanyLookupResult> {
  const results = await braveWebSearch(`företag ${companyName} allabolag`, 5);
  if (results.length === 0) throw new Error("Brave returned no results");

  const allabolagUrl = results
    .map((r) => r.url)
    .find((u) => u.includes("allabolag.se/foretag/"));

  if (!allabolagUrl) throw new Error("No allabolag company URL in Brave results");

  const cheerio = await import("cheerio");
  const companyRes = await fetch(allabolagUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!companyRes.ok) throw new Error(`Company page returned ${companyRes.status}`);

  const companyHtml = await companyRes.text();
  const $company = cheerio.load(companyHtml);
  const nextDataScript = $company("#__NEXT_DATA__").html();
  if (!nextDataScript) throw new Error("No __NEXT_DATA__ found on Brave-discovered URL");

  const nextData = JSON.parse(nextDataScript);
  const c = nextData?.props?.pageProps?.company;
  if (!c) throw new Error("No company object in __NEXT_DATA__");

  const addr = c.visitorAddress || {};
  const cp = c.contactPerson || {};

  return {
    found: true,
    companyName: c.name || companyName,
    orgNr: fmtOrgNr(c.orgnr || ""),
    companyType: c.companyType?.name,
    city: addr.postPlace || undefined,
    address: [addr.addressLine, addr.zipCode, addr.postPlace].filter(Boolean).join(", "),
    industries: (c.industries || []).map((i: { name?: string }) => i.name).filter(Boolean),
    revenueKsek: safeInt(c.revenue),
    employees: safeInt(c.employees),
    ceo: cp.name ? `${cp.name}${cp.role ? ` (${cp.role})` : ""}` : undefined,
    homepage: (c.homePage || "").trim() || undefined,
    purpose: (c.purpose || "").slice(0, 300) || undefined,
    source: "allabolag",
  };
}

async function lookupViaAiSearch(companyName: string): Promise<CompanyLookupResult> {
  const result = await generateText({
    model: gateway("openai/gpt-5-mini"),
    prompt: `Sök upp det svenska företaget "${companyName}" på allabolag.se eller liknande källa.
Returnera BARA JSON (inget annat):
{"found":true,"companyName":"","orgNr":"","companyType":"AB","city":"","industries":[""],"employees":0,"revenueKsek":0,"purpose":"","homepage":""}

Om du inte hittar företaget: {"found":false}
Bara JSON, inget annat.`,
    maxRetries: 1,
    providerOptions: {
      gateway: { models: ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"] },
    },
    maxOutputTokens: 350,
  });

  const text = result.text?.trim() || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return EMPTY_RESULT;

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  if (!parsed.found) return EMPTY_RESULT;

  return {
    found: true,
    companyName: String(parsed.companyName || companyName),
    orgNr: String(parsed.orgNr || ""),
    companyType: String(parsed.companyType || ""),
    city: String(parsed.city || ""),
    industries: Array.isArray(parsed.industries) ? parsed.industries.map(String).filter(Boolean) : [],
    revenueKsek: safeInt(parsed.revenueKsek),
    employees: safeInt(parsed.employees),
    purpose: String(parsed.purpose || "").slice(0, 300) || undefined,
    homepage: String(parsed.homepage || "") || undefined,
    source: "ai_search",
  };
}

export async function POST(req: Request) {
  return withRateLimit(req, "ai:chat", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      const body = await req.json().catch(() => null);
      const parsed = requestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Validation failed", ...EMPTY_RESULT }, { status: 400 });
      }

      const { companyName } = parsed.data;
      debugLog("WIZARD", "Company lookup", { companyName });

      const creditCheck = await prepareCredits(req, "wizard.enrich");
      if (!creditCheck.ok) return creditCheck.response;

      let result: CompanyLookupResult = EMPTY_RESULT;

      // Step 1: Direct Cheerio scrape of allabolag.se
      try {
        result = await lookupViaCheerio(companyName);
        debugLog("WIZARD", "Cheerio lookup succeeded", { name: result.companyName, orgNr: result.orgNr });
      } catch (cheerioErr) {
        debugLog("WIZARD", "Cheerio lookup failed", {
          error: cheerioErr instanceof Error ? cheerioErr.message : String(cheerioErr),
        });

        // Step 2: Brave Search → find allabolag URL → Cheerio that
        try {
          result = await lookupViaBraveSearch(companyName);
          debugLog("WIZARD", "Brave+Cheerio lookup succeeded", { name: result.companyName });
        } catch (braveErr) {
          debugLog("WIZARD", "Brave lookup failed, trying AI search", {
            error: braveErr instanceof Error ? braveErr.message : String(braveErr),
          });

          // Step 3: AI fallback (only if both Cheerio and Brave fail)
          try {
            result = await lookupViaAiSearch(companyName);
            debugLog("WIZARD", "AI search lookup result", { found: result.found });
          } catch (aiErr) {
            debugLog("WIZARD", "AI search also failed", {
              error: aiErr instanceof Error ? aiErr.message : String(aiErr),
            });
          }
        }
      }

      try { await creditCheck.commit(); } catch (err) {
        console.error("[credits] Failed to charge company-lookup:", err);
      }

      return NextResponse.json(result);
    } catch (err) {
      console.error("[API/wizard/company-lookup] Error:", err);
      return NextResponse.json(EMPTY_RESULT);
    }
  });
}
