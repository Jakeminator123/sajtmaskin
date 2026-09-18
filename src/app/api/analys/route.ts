/**
 * Public lead-magnet analysis. Same scrape/LLM engine as /api/audit,
 * without login or credits. Rate-limited to 1 run / 24h per IP.
 *
 * Order matters: cheap input validation runs BEFORE the rate limiter so a typo
 * or a probe does not spend the caller's single daily run, and the response is
 * projected onto the public contract so an anonymous caller never receives the
 * internal audit payload (`site_content`, `template_data`, cost, …).
 */
import { NextRequest, NextResponse } from "next/server";
import { validateAndNormalizeUrl, getCanonicalUrlKey } from "@/lib/webscraper";
import { validateSsrfTarget } from "@/lib/ssrf-guard";
import { withRateLimit } from "@/lib/rate-limit";
import { inFlightAudits } from "@/app/api/audit/modules/in-flight";
import type { AuditResult } from "@/types/audit";
import { toPublicAnalysReport } from "@/lib/audit/public-report";
import { mapWebsiteAuditException, runWebsiteAudit } from "@/lib/audit/run-website-audit";

export const maxDuration = 300;

/** Longer than any real site URL; keeps normalization off absurd input. */
const MAX_URL_LENGTH = 2048;

const PUBLIC_RESPONSE_HEADERS = {
  // A guest report is per-caller and must never be stored by a shared cache.
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function errorResponse(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { success: false, error, ...extra },
    { status, headers: { ...PUBLIC_RESPONSE_HEADERS } },
  );
}

export async function POST(request: NextRequest) {
  const requestId = `analys_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const requestStartTime = Date.now();

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Ogiltig JSON i förfrågan");
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return errorResponse(400, "Ange en webbadress.");
  }
  if (rawUrl.length > MAX_URL_LENGTH) {
    return errorResponse(400, "Webbadressen är för lång.");
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = validateAndNormalizeUrl(rawUrl);
  } catch (error) {
    return errorResponse(
      400,
      error instanceof Error ? error.message : "Ogiltig URL. Ange en giltig webbadress.",
    );
  }

  // Defence in depth: `scrapeWebsite` fetches through the pinned-DNS SSRF
  // guard, but rejecting private/internal targets here gives the caller a
  // clear 400 and keeps the public surface from being used as a port scanner.
  const ssrfCheck = validateSsrfTarget(new URL(normalizedUrl));
  if (!ssrfCheck.ok) {
    console.warn(`[${requestId}] Blocked public analys target: ${ssrfCheck.reason}`);
    return errorResponse(400, "Den adressen kan inte analyseras. Ange en publik webbplats.");
  }

  return withRateLimit(request, "analys:public", async () => {
    const canonicalKey = getCanonicalUrlKey(normalizedUrl);
    const inFlightKey = `public:${canonicalKey}`;
    const existing = inFlightAudits.get(inFlightKey);
    if (existing) {
      const ageMs = Date.now() - existing.startTime;
      return errorResponse(
        409,
        `En analys för denna URL pågår redan. Vänta tills den är klar (startat för ${Math.round(
          ageMs / 1000,
        )} sekunder sedan).`,
        { duplicate: true },
      );
    }

    inFlightAudits.set(inFlightKey, {
      startTime: Date.now(),
      userId: "public",
      promise: Promise.resolve({} as AuditResult),
    });

    try {
      const engine = await runWebsiteAudit({
        normalizedUrl,
        auditMode: "basic",
        promptKind: "public",
        requestId,
        requestStartTime,
      });

      if (!engine.ok) {
        return errorResponse(engine.status, engine.error);
      }

      const totalDuration = Date.now() - requestStartTime;
      return NextResponse.json(
        {
          success: true,
          report: toPublicAnalysReport(engine.result, { usedFallback: engine.usedFallback }),
          surface: "public-analys",
        },
        {
          headers: {
            ...PUBLIC_RESPONSE_HEADERS,
            "X-Request-ID": requestId,
            "X-Response-Time": `${totalDuration}ms`,
            // Which model served the run is internal; expose it outside
            // production only, so local/preview verification stays possible.
            ...(process.env.NODE_ENV === "production"
              ? {}
              : { "X-Audit-Model": engine.usedModel }),
          },
        },
      );
    } catch (error: unknown) {
      const totalDuration = Date.now() - requestStartTime;
      const mapped = mapWebsiteAuditException(error);
      console.error(`[${requestId}] Public analys error after ${totalDuration}ms:`, error);
      return errorResponse(mapped.status, mapped.error);
    } finally {
      inFlightAudits.delete(inFlightKey);
    }
  });
}
