import { NextResponse } from "next/server";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";
import { getCurrentUser } from "@/lib/auth/auth";
import { withRateLimit } from "@/lib/rate-limit";
import { validateSsrfTarget } from "@/lib/ssrf-guard";
import { readPublicSourcePage } from "@/lib/webscraper";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function POST(request: Request) {
  return withRateLimit(request, "openclaw:source-page", async () => {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Logga in för att läsa en källa." }, { status: 401 });
    }

    const body = await readRequestJsonWithLimit<{ url?: unknown }>(request, 12_000);
    if (!body.ok) {
      return NextResponse.json(
        { error: "Ogiltig förfrågan." },
        { status: body.reason === "too_large" ? 413 : 400 },
      );
    }
    const rawUrl = body.value?.url;
    const url = typeof rawUrl === "string" && rawUrl.length <= 2_048 ? URL.parse(rawUrl.trim()) : null;
    if (!url || url.username || url.password || !validateSsrfTarget(url).ok) {
      return NextResponse.json({ error: "Ange en publik http- eller https-länk." }, { status: 400 });
    }
    url.hash = "";

    try {
      return NextResponse.json(await readPublicSourcePage(url.href));
    } catch {
      return NextResponse.json({ error: "Sidan gick inte att läsa. Kontrollera länken." }, { status: 422 });
    }
  });
}
