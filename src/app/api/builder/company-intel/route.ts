/**
 * POST /api/builder/company-intel
 *
 * Orchestrates multi-source data collection (deep scrape, Brave web search,
 * allabolag lookup) and optionally synthesizes a structured Brief via GPT.
 *
 * Returns { intel, brief? } — the client stores both and passes `brief`
 * as `meta.brief` at generation time.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectCompanyIntel, type CompanyIntelResult } from "@/lib/builder/company-intel";
import { synthesizeCompanyBrief } from "@/lib/builder/company-brief-synthesis";
import { extractTextFromDocument, isExtractableDocument } from "@/lib/builder/document-extractor";
import type { Brief } from "@/lib/gen/system-prompt";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 120;

const documentUrlSchema = z.object({
  url: z.string().url(),
  filename: z.string(),
  mimeType: z.string(),
});

const requestSchema = z.object({
  url: z.string().url().min(1),
  companyName: z.string().max(300).optional(),
  documentTexts: z.array(z.string().max(50000)).max(10).optional(),
  documentUrls: z.array(documentUrlSchema).max(10).optional(),
  siteType: z.string().max(100).optional(),
  userPreferences: z.string().max(2000).optional(),
  synthesize: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    if (!user && !sessionId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const docTexts = [...(parsed.data.documentTexts ?? [])];

    if (parsed.data.documentUrls?.length) {
      const extractions = await Promise.allSettled(
        parsed.data.documentUrls
          .filter((d) => isExtractableDocument(d.mimeType))
          .map(async (doc) => {
            const res = await fetch(doc.url, { signal: AbortSignal.timeout(15000) });
            if (!res.ok) return null;
            const buf = Buffer.from(await res.arrayBuffer());
            const extracted = await extractTextFromDocument(buf, doc.mimeType, doc.filename);
            return extracted.text;
          }),
      );
      for (const r of extractions) {
        if (r.status === "fulfilled" && r.value) docTexts.push(r.value);
      }
    }

    const intel: CompanyIntelResult = await collectCompanyIntel({
      url: parsed.data.url,
      companyName: parsed.data.companyName,
      documentTexts: docTexts.length > 0 ? docTexts : undefined,
    });

    let brief: Brief | null = null;
    if (parsed.data.synthesize && intel.rawTextCorpus.length > 20) {
      try {
        brief = await synthesizeCompanyBrief({
          intel,
          siteType: parsed.data.siteType,
          userPreferences: parsed.data.userPreferences,
        });
      } catch (err) {
        console.error("[API/builder/company-intel] Brief synthesis failed:", err);
      }
    }

    return NextResponse.json({ success: true, data: { intel, brief } });
  } catch (err) {
    console.error("[API/builder/company-intel] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
