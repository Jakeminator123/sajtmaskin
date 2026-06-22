import { NextResponse } from "next/server";

import { quickScrapeWebsite } from "@/lib/webscraper";

/**
 * Native-backed site scrape for the ported wizard ("Hämta & fyll i") + the
 * start-page box ("Ange din befintliga hemsida").
 *
 * Calls `quickScrapeWebsite` DIRECTLY (the same lib /api/wizard/quick-scrape
 * uses) instead of doing an internal server-to-server fetch to our own
 * deployment. On Vercel that internal hop hit the deployment-protection (SSO)
 * wall and returned the auth challenge instead of JSON, so the scrape always
 * "failed" on the preview. A direct lib call avoids that entirely.
 *
 * Translates the result into the wizard answer fields the foundation step
 * merges (companyName, offer).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: Request) {
  let body: { url?: string; companyName?: string };
  try {
    body = (await req.json()) as { url?: string; companyName?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const raw = (body.url ?? "").trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Ingen URL angiven." }, { status: 400 });
  }
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const scraped = await quickScrapeWebsite(url);
    const title = (scraped.title ?? "").trim();
    const description = (scraped.description ?? "").trim();
    const data: Record<string, unknown> = {};
    if (title && title !== "Ingen titel") data.companyName = title;
    if (description) data.offer = description;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Sajten gick att läsa men saknade titel/beskrivning att fylla i.",
      });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Kunde inte läsa sajten.",
    });
  }
}
