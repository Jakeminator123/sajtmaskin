/**
 * Domain Verify API
 * =================
 *
 * POST /api/domains/verify
 * Body: { domain: string, projectId?: string }
 *
 * Triggers domain verification on Vercel and returns the current status.
 * If the domain is not yet verified, returns DNS configuration instructions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getVercelToken } from "@/lib/vercel";

export const maxDuration = 15;

const VERCEL_API_BASE = "https://api.vercel.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const domain = (body.domain ?? "").trim().toLowerCase();
    const projectId =
      body.projectId?.trim() || process.env.VERCEL_PROJECT_ID;
    const teamId = process.env.VERCEL_TEAM_ID;

    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required (or set VERCEL_PROJECT_ID)" },
        { status: 400 },
      );
    }

    let token: string;
    try {
      token = getVercelToken();
    } catch {
      return NextResponse.json(
        { error: "Vercel is not configured (missing VERCEL_TOKEN)" },
        { status: 503 },
      );
    }

    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const verifyRes = await fetch(
      `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify${query}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = await verifyRes.json();

    if (!verifyRes.ok) {
      return NextResponse.json(
        {
          error: data?.error?.message || `Verification failed (HTTP ${verifyRes.status})`,
          code: data?.error?.code,
        },
        { status: verifyRes.status },
      );
    }

    const verified = data.verified === true;
    const verification = data.verification ?? [];

    return NextResponse.json({
      success: true,
      domain: data.name || domain,
      verified,
      verification,
    });
  } catch (error) {
    console.error("[domains/verify] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
