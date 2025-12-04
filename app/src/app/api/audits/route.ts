/**
 * API Route: User Audits
 * GET /api/audits - Get user's saved audits
 * POST /api/audits - Save a new audit (called automatically after audit)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserAudits,
  saveUserAudit,
  getUserAuditCount,
  type SavedAudit,
} from "@/lib/database";
import {
  getCachedUserAuditList,
  cacheUserAuditList,
  cacheAudit,
} from "@/lib/redis";

// Maximum audits per user (to prevent abuse)
const MAX_AUDITS_PER_USER = 50;

/**
 * GET - List user's saved audits
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad." },
        { status: 401 }
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
    const audits = getUserAudits(user.id);

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
      created_at: a.created_at,
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
      { status: 500 }
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
        { status: 401 }
      );
    }

    const body = await request.json();
    const { url, domain, auditResult } = body;

    if (!url || !domain || !auditResult) {
      return NextResponse.json(
        { success: false, error: "Saknar nödvändig data." },
        { status: 400 }
      );
    }

    // Check audit limit
    const auditCount = getUserAuditCount(user.id);
    if (auditCount >= MAX_AUDITS_PER_USER) {
      return NextResponse.json(
        {
          success: false,
          error: `Du har nått maxgränsen på ${MAX_AUDITS_PER_USER} sparade audits. Ta bort gamla för att spara nya.`,
        },
        { status: 400 }
      );
    }

    // Save to database
    const savedAudit = saveUserAudit(user.id, url, domain, auditResult);

    // Cache the audit
    await cacheAudit(savedAudit.id, user.id, auditResult);

    console.log(
      `[API/audits] Saved audit ${savedAudit.id} for user ${user.id}: ${domain}`
    );

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
    return NextResponse.json(
      { success: false, error: "Kunde inte spara audit." },
      { status: 500 }
    );
  }
}
