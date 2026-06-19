import { NextResponse } from "next/server";

/**
 * Native-backed site scrape for the ported wizard ("Hämta & fyll i").
 *
 * Maps the viewser `/api/scrape-site` contract onto Sajtmaskin's native
 * `/api/wizard/quick-scrape`, translating the result into the wizard answer
 * fields the foundation step merges (companyName, offer).
 */
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
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/wizard/quick-scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { title?: string; description?: string };
      error?: string;
    } | null;

    if (!res.ok || !json?.success || !json.data) {
      return NextResponse.json({
        ok: false,
        error: json?.error || "Kunde inte läsa sajten.",
      });
    }

    const title = (json.data.title ?? "").trim();
    const description = (json.data.description ?? "").trim();
    const data: Record<string, unknown> = {};
    if (title && title !== "Ingen titel") data.companyName = title;
    if (description) data.offer = description;

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Scrape misslyckades.",
    });
  }
}
