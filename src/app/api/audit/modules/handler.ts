import { NextRequest, NextResponse } from "next/server";
import { prepareCredits, remainingCreditsAfterCharge } from "@/lib/credits/server";
import { getCreditCost, type CreditAction } from "@/lib/credits/pricing";
import { resolvePricingSettings } from "@/lib/db/services/pricing-settings";
import { validateAndNormalizeUrl, getCanonicalUrlKey } from "@/lib/webscraper";
import { withRateLimit } from "@/lib/rate-limit";
import type { AuditMode, AuditRequest, AuditResult } from "@/types/audit";
import { inFlightAudits } from "./in-flight";
import { mapWebsiteAuditException, runWebsiteAudit } from "@/lib/audit/run-website-audit";

export async function POST(request: NextRequest) {
  return withRateLimit(request, "audit:create", async () => {
    const requestId = `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const requestStartTime = Date.now();

    let inFlightKey: string | null = null;

    try {
      let body: AuditRequest;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { success: false, error: "Ogiltig JSON i förfrågan" },
          { status: 400 },
        );
      }

      const { url, auditMode } = body;
      const resolvedAuditMode: AuditMode = auditMode === "advanced" ? "advanced" : "basic";
      const auditAction: CreditAction =
        resolvedAuditMode === "advanced" ? "audit.advanced" : "audit.basic";
      const auditPricing = await resolvePricingSettings();
      const auditCost = getCreditCost(auditAction, {}, auditPricing.creditActionPrices);

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

      console.info(`[${requestId}] Audit request for: ${normalizedUrl}`);

      const canonicalKey = getCanonicalUrlKey(normalizedUrl);

      const creditCheck = await prepareCredits(request, auditAction);
      if (!creditCheck.ok) {
        return creditCheck.response;
      }

      const user = creditCheck.user;
      if (!user) {
        return NextResponse.json(
          { success: false, error: "Användare hittades inte." },
          { status: 404 },
        );
      }

      console.info(
        `[${requestId}] User ${user.id} has ${user.diamonds} diamonds (test: ${creditCheck.isTest})`,
      );

      inFlightKey = `${user.id}:${canonicalKey}`;
      const existingAudit = inFlightAudits.get(inFlightKey);
      if (existingAudit) {
        const ageMs = Date.now() - existingAudit.startTime;
        console.info(
          `[${requestId}] Duplicate audit request detected (in-flight for ${Math.round(
            ageMs / 1000,
          )}s)`,
        );
        return NextResponse.json(
          {
            success: false,
            error: `En audit för denna URL pågår redan. Vänta tills den är klar (startat för ${Math.round(
              ageMs / 1000,
            )} sekunder sedan).`,
            duplicate: true,
          },
          { status: 409 },
        );
      }

      inFlightAudits.set(inFlightKey, {
        startTime: Date.now(),
        userId: user.id,
        promise: Promise.resolve({} as AuditResult),
      });

      try {
        const engine = await runWebsiteAudit({
          normalizedUrl,
          auditMode: resolvedAuditMode,
          promptKind: "product",
          requestId,
          requestStartTime,
        });

        if (!engine.ok) {
          return NextResponse.json(
            { success: false, error: engine.error },
            { status: engine.status },
          );
        }

        try {
          await creditCheck.commit();
          if (creditCheck.isTest) {
            console.info(`[${requestId}] Test user - no diamonds deducted`);
          } else {
            console.info(`[${requestId}] Deducted ${auditCost} diamonds from user ${user.id}`);
          }
        } catch (txError) {
          console.error(`[${requestId}] Failed to deduct diamonds:`, txError);
          return NextResponse.json(
            {
              success: false,
              error: "Debiteringen misslyckades. Försök igen om en stund.",
            },
            {
              status: 500,
              headers: {
                "X-Request-ID": requestId,
                "X-Response-Time": `${Date.now() - requestStartTime}ms`,
              },
            },
          );
        }

        const totalDuration = Date.now() - requestStartTime;
        console.info(`[${requestId}] Audit completed in ${totalDuration}ms`);

        return NextResponse.json(
          {
            success: true,
            result: engine.result,
            creditsRemaining: remainingCreditsAfterCharge({
              diamonds: user.diamonds,
              cost: creditCheck.cost,
              charged:
                !creditCheck.isTest &&
                !creditCheck.usingFreeGeneration &&
                !creditCheck.usingExistingEntitlement &&
                creditCheck.cost > 0,
            }),
          },
          {
            headers: {
              "X-Request-ID": requestId,
              "X-Response-Time": `${totalDuration}ms`,
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
      console.error(`[${requestId}] Audit error after ${totalDuration}ms:`, error);
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
