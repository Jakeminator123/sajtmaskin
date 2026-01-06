/**
 * API Route: Single Audit Operations
 * GET /api/audits/[id] - Get a specific audit
 * DELETE /api/audits/[id] - Delete an audit
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getUserAuditById, deleteUserAudit } from "@/lib/data/database";
import { getCachedAudit, invalidateUserAuditCache } from "@/lib/data/redis";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET - Get a specific audit with full data
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad." },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const auditId = parseInt(id, 10);

    if (isNaN(auditId)) {
      return NextResponse.json(
        { success: false, error: "Ogiltigt audit-ID." },
        { status: 400 }
      );
    }

    // Try cache first for the audit result
    const cachedResult = await getCachedAudit(auditId);

    // Get audit metadata from database (to verify ownership)
    const audit = getUserAuditById(auditId, user.id);

    if (!audit) {
      return NextResponse.json(
        { success: false, error: "Audit hittades inte." },
        { status: 404 }
      );
    }

    // Parse audit result - use cache if available, otherwise from DB
    let auditResult;
    if (cachedResult) {
      auditResult = cachedResult;
    } else {
      try {
        auditResult = JSON.parse(audit.audit_result);
      } catch {
        auditResult = null;
      }
    }

    return NextResponse.json({
      success: true,
      audit: {
        id: audit.id,
        url: audit.url,
        domain: audit.domain,
        company_name: audit.company_name,
        score_overall: audit.score_overall,
        score_seo: audit.score_seo,
        score_ux: audit.score_ux,
        score_performance: audit.score_performance,
        score_security: audit.score_security,
        created_at: audit.created_at,
        result: auditResult,
      },
      fromCache: !!cachedResult,
    });
  } catch (error) {
    console.error("[API/audits/[id]] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta audit." },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete an audit
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad." },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const auditId = parseInt(id, 10);

    if (isNaN(auditId)) {
      return NextResponse.json(
        { success: false, error: "Ogiltigt audit-ID." },
        { status: 400 }
      );
    }

    const deleted = deleteUserAudit(auditId, user.id);

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          error: "Audit hittades inte eller kunde inte tas bort.",
        },
        { status: 404 }
      );
    }

    // Invalidate cache
    await invalidateUserAuditCache(user.id);

    console.log(
      `[API/audits/[id]] Deleted audit ${auditId} for user ${user.id}`
    );

    return NextResponse.json({
      success: true,
      message: "Audit borttagen.",
    });
  } catch (error) {
    console.error("[API/audits/[id]] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte ta bort audit." },
      { status: 500 }
    );
  }
}
