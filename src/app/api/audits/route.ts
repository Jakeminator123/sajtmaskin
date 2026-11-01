/**
 * API Route: User Audits
 * GET /api/audits - Get user's saved audits (used by /audits page)
 * POST /api/audits - Save a new audit (triggered by the "Spara"-button in AuditModal)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getUserAuditCount, getUserAudits, saveUserAudit } from "@/lib/db/services/audits";
import { getCachedUserAuditList, cacheUserAuditList, cacheAudit } from "@/lib/data/redis";

// Maximum audits per user (to prevent abuse)
const MAX_AUDITS_PER_USER = 50;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * GET - List user's saved audits
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad." },
        { status: 401 },
      );
    }

    // Try cache first
    const cached = await getCachedUserAuditList(user.id);
    if (cached) {
      return NextResponse.json({
        success: true,
        audits: cached,
        fromCache: true,
      });
    }

    // Get from database
    const audits = await getUserAudits(user.id);

    // Transform to lightweight list format
    const auditList = audits.map((a) => ({
      id: a.id,
      url: a.url,
      domain: a.domain,
      company_name: a.company_name,
      score_overall: a.score_overall,
      score_seo: a.score_seo,
      score_ux: a.score_ux,
      score_performance: a.score_performance,
      score_security: a.score_security,
      created_at: a.created_at.toISOString(),
    }));

    // Cache the list
    await cacheUserAuditList(user.id, auditList);

    return NextResponse.json({
      success: true,
      audits: auditList,
      fromCache: false,
    });
  } catch (error) {
    console.error("[API/audits] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta audits." },
      { status: 500 },
    );
  }
}

/**
 * POST - Save a new audit
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad." },
        { status: 401 },
      );
    }

    const body = asRecord(await request.json().catch(() => null));
    if (!body) {
      return NextResponse.json({ success: false, error: "Ogiltig förfrågan." }, { status: 400 });
    }
    const { url, domain, auditResult } = body;
    const normalizedAuditResult = asRecord(auditResult);

    if (
      typeof url !== "string" ||
      !url.trim() ||
      typeof domain !== "string" ||
      !domain.trim() ||
      !normalizedAuditResult
    ) {
      return NextResponse.json(
        { success: false, error: "Saknar nödvändig data." },
        { status: 400 },
      );
    }
    let normalizedUrl: string;
    try {
      const parsedUrl = new URL(url.trim());
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error();
      normalizedUrl = parsedUrl.toString();
    } catch {
      return NextResponse.json({ success: false, error: "Ogiltig audit-URL." }, { status: 400 });
    }
    const normalizedDomain = domain.trim().toLowerCase();

    // Check audit limit
    const auditCount = await getUserAuditCount(user.id);
    if (auditCount >= MAX_AUDITS_PER_USER) {
      return NextResponse.json(
        {
          success: false,
          error: `Du har nått maxgränsen på ${MAX_AUDITS_PER_USER} sparade audits. Ta bort gamla för att spara nya.`,
        },
        { status: 400 },
      );
    }

    // Save to database
    const savedAudit = await saveUserAudit(
      user.id,
      normalizedUrl,
      normalizedDomain,
      normalizedAuditResult,
    );

    // Cache the audit
    await cacheAudit(savedAudit.id, user.id, normalizedAuditResult);

    console.info(`[API/audits] Saved audit ${savedAudit.id} for user ${user.id}: ${domain}`);

    return NextResponse.json({
      success: true,
      audit: {
        id: savedAudit.id,
        domain: savedAudit.domain,
        company_name: savedAudit.company_name,
        score_overall: savedAudit.score_overall,
        created_at: savedAudit.created_at,
      },
    });
  } catch (error) {
    console.error("[API/audits] POST error:", error);
    return NextResponse.json({ success: false, error: "Kunde inte spara audit." }, { status: 500 });
  }
}
