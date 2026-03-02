/**
 * API Route: Quick Website Scrape
 * POST /api/wizard/quick-scrape
 *
 * Lightweight scrape of a single page -- title, description, headings, word count.
 * Designed to complete in 1-2 seconds for immediate wizard feedback.
 * The full deep analysis runs separately via /api/analyze-website.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { quickScrapeWebsite } from "@/lib/webscraper";
import { debugLog } from "@/lib/utils/debug";

export const runtime = "nodejs";
export const maxDuration = 10;

const requestSchema = z.object({
  url: z.string().min(4).max(2048),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid URL" }, { status: 400 });
    }

    const { url } = parsed.data;
    const startTime = Date.now();

    const data = await quickScrapeWebsite(url);

    debugLog("WIZARD", "Quick scrape completed", {
      url,
      title: data.title,
      wordCount: data.wordCount,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    debugLog("WIZARD", "Quick scrape failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Scrape failed",
    });
  }
}
