/**
 * Public lead-magnet analysis. Same scrape/LLM engine as /api/audit,
 * without login or credits. Rate-limited to 1 run / 24h per IP.
 */
import { NextRequest, NextResponse } from "next/server";
import { validateAndNormalizeUrl, getCanonicalUrlKey } from "@/lib/webscraper";
import { withRateLimit } from "@/lib/rate-limit";
import { inFlightAudits } from "@/app/api/audit/modules/in-flight";
import type { AuditResult } from "@/types/audit";
import { mapWebsiteAuditException, runWebsiteAudit } from "@/lib/audit/run-website-audit";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return withRateLimit(request, "analys:public", async () => {
    const requestId = `analys_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const requestStartTime = Date.now();
    let inFlightKey: string | null = null;

    try {
      let body: { url?: unknown };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { success: false, error: "Ogiltig JSON i förfrågan" },
          { status: 400 },
        );
      }

      const url = typeof body.url === "string" ? body.url : "";
      let normalizedUrl: string;
      try {
        normalizedUrl = validateAndNormalizeUrl(url);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error:
              error instanceof Error ? error.message : "Ogiltig URL. Ange en giltig webbadress.",
          },
          { status: 400 },
        );
      }

      const canonicalKey = getCanonicalUrlKey(normalizedUrl);
      inFlightKey = `public:${canonicalKey}`;
      const existing = inFlightAudits.get(inFlightKey);
      if (existing) {
        const ageMs = Date.now() - existing.startTime;
        return NextResponse.json(
          {
            success: false,
            error: `En analys för denna URL pågår redan. Vänta tills den är klar (startat för ${Math.round(
              ageMs / 1000,
            )} sekunder sedan).`,
            duplicate: true,
          },
          { status: 409 },
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
          return NextResponse.json(
            { success: false, error: engine.error },
            { status: engine.status },
          );
        }

        const totalDuration = Date.now() - requestStartTime;
        return NextResponse.json(
          {
            success: true,
            result: engine.result,
            surface: "public-analys",
            usedModel: engine.usedModel,
          },
          {
            headers: {
              "X-Request-ID": requestId,
              "X-Response-Time": `${totalDuration}ms`,
              "X-Audit-Model": engine.usedModel,
              ...(engine.usedFallback ? { "X-Audit-Fallback": "true" } : {}),
            },
          },
        );
      } finally {
        if (inFlightKey) {
          inFlightAudits.delete(inFlightKey);
        }
      }
    } catch (error: unknown) {
      const totalDuration = Date.now() - requestStartTime;
      const mapped = mapWebsiteAuditException(error);
      console.error(`[${requestId}] Public analys error after ${totalDuration}ms:`, error);
      return NextResponse.json(
        { success: false, error: mapped.error },
        {
          status: mapped.status,
          headers: {
            "X-Request-ID": requestId,
            "X-Response-Time": `${totalDuration}ms`,
          },
        },
      );
    }
  });
}
