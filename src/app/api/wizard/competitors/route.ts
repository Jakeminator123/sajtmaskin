/**
 * API Route: Competitor Discovery
 * POST /api/wizard/competitors
 *
 * Uses AI to identify relevant competitors for a given business,
 * returning structured data including approximate coordinates for map display.
 */

import { NextResponse } from "next/server";
import { generateText, gateway } from "ai";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { requireNotBot } from "@/lib/botProtection";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { prepareCredits } from "@/lib/credits/server";

export const runtime = "nodejs";
export const maxDuration = 25;

const requestSchema = z.object({
  companyName: z.string().min(1).max(300),
  industry: z.string().min(1).max(200),
  location: z.string().max(300).optional().default(""),
  existingWebsite: z.string().max(2048).optional().default(""),
});

export interface Competitor {
  name: string;
  description: string;
  website?: string;
  lat?: number;
  lng?: number;
  isInspiration?: boolean;
}

interface CompetitorsResponse {
  competitors: Competitor[];
  marketInsight?: string;
}

const EMPTY: CompetitorsResponse = { competitors: [] };

const competitorSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  website: z.string().max(500).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isInspiration: z.boolean().optional(),
});

const responseSchema = z.object({
  competitors: z.array(competitorSchema).max(6).default([]),
  marketInsight: z.string().max(500).optional(),
});

function normalizeResponse(raw: unknown): CompetitorsResponse {
  if (!raw || typeof raw !== "object") return EMPTY;
  const parsed = responseSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const obj = raw as Record<string, unknown>;
  const competitors = Array.isArray(obj.competitors)
    ? obj.competitors
        .map((item) => {
          const c = competitorSchema.safeParse(item);
          return c.success ? c.data : null;
        })
        .filter((c): c is Competitor => Boolean(c))
        .slice(0, 5)
    : [];

  return {
    competitors,
    marketInsight: typeof obj.marketInsight === "string" ? obj.marketInsight.slice(0, 500) : undefined,
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
        return NextResponse.json({ error: "Validation failed", ...EMPTY }, { status: 400 });
      }

      const { companyName, industry, location, existingWebsite } = parsed.data;
      debugLog("WIZARD", "Competitors request", { companyName, industry, location });

      const creditCheck = await prepareCredits(req, "wizard.enrich");
      if (!creditCheck.ok) return creditCheck.response;

      const hasGatewayApiKey = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
      const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
      const onVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
      if (!hasGatewayApiKey && !hasOidcToken && !onVercel) {
        return NextResponse.json({ error: "AI Gateway auth missing", ...EMPTY }, { status: 503 });
      }

      const locationHint = location ? `i ${location}` : "i Sverige";
      const websiteHint = existingWebsite ? `\nDeras nuvarande sajt: ${existingWebsite}` : "";

      const result = await generateText({
        model: gateway("openai/gpt-5-mini"),
        prompt: `Du är en svensk marknadsanalytiker. Analysera konkurrenter.

Företag: ${companyName}
Bransch: ${industry}
Plats: ${locationHint}${websiteHint}

Returnera BARA JSON (inget annat):
{"competitors":[{"name":"","description":"Kort beskrivning","website":"https://...","lat":59.33,"lng":18.07,"isInspiration":true}],"marketInsight":"Kort marknadsinblick"}

Regler:
- 3-5 konkurrenter som är relevanta ${locationHint}
- Minst 1-2 ska ha isInspiration:true (sajter att inspireras av)
- Inkludera ungefärliga lat/lng-koordinater för kartvisning
- website ska vara verklig URL om möjlig
- Allt på svenska
- Bara JSON, inget annat`,
        maxRetries: 1,
        providerOptions: {
          gateway: { models: ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"] },
        },
        maxOutputTokens: 600,
      });

      let parsedResponse: unknown = {};
      try {
        const text = result.text?.trim() || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsedResponse = JSON.parse(jsonMatch[0]);
      } catch {
        debugLog("WIZARD", "Failed to parse competitors JSON");
      }

      const normalized = normalizeResponse(parsedResponse);

      debugLog("WIZARD", "Competitors response", {
        count: normalized.competitors.length,
        hasInsight: Boolean(normalized.marketInsight),
      });

      try { await creditCheck.commit(); } catch (err) {
        console.error("[credits] Failed to charge competitors:", err);
      }

      return NextResponse.json(normalized);
    } catch (err) {
      errorLog("WIZARD", "Competitors error", err);
      return NextResponse.json(EMPTY);
    }
  });
}
