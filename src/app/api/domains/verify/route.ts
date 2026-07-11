/**
 * Domain Verify API
 * =================
 *
 * POST /api/domains/verify
 * Body: { domain: string, chatId: string }
 *
 * Triggers verification of a domain on the customer's OWN generated project
 * (resolved from the chat, cross-tenant-safe) and returns the current status.
 * If the domain is not yet verified, returns DNS configuration instructions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getVercelToken } from "@/lib/vercel";
import { getCurrentUser } from "@/lib/auth/auth";
import { withRateLimit } from "@/lib/rateLimit";
import { resolveVercelProjectForChat } from "@/lib/domains/resolve-vercel-project";
import {
  clearProjectCustomDomainVerification,
  setProjectVerifiedCustomDomain,
} from "@/lib/db/services/projects";
import { checkVercelProjectDomain } from "@/lib/vercelDeploy";
import { setLatestDeploymentLiveUrlForChat } from "@/lib/deployment";

export const maxDuration = 15;

const VERCEL_API_BASE = "https://api.vercel.com";

export async function POST(req: NextRequest) {
  return withRateLimit(req, "domains:verify", async () => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    try {
      const body = await req.json();
      const domain = (body.domain ?? "").trim().toLowerCase();
      const chatId = (body.chatId ?? "").trim();
      const teamId = process.env.VERCEL_TEAM_ID;

      if (!domain) {
        return NextResponse.json({ error: "domain is required" }, { status: 400 });
      }

      if (!chatId) {
        return NextResponse.json({ error: "chatId is required" }, { status: 400 });
      }

      const resolution = await resolveVercelProjectForChat(req, chatId);
      if (!resolution.ok) {
        return NextResponse.json({ error: resolution.error }, { status: resolution.status });
      }
      const projectId = resolution.vercelProjectId;

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

      let verified = data.verified === true;
      const verification = data.verification ?? [];
      if (verified) {
        const configured = await checkVercelProjectDomain(projectId, domain);
        if (configured === null) {
          return NextResponse.json(
            {
              error: "Domänens DNS/TLS-status kunde inte kontrolleras. Försök igen.",
            },
            { status: 503 },
          );
        }
        verified = configured;
      }
      if (verified && resolution.appProjectId) {
        // Only a provider-verified domain becomes the project's canonical
        // public URL. A manually posted/unverified domain must never poison
        // SEO or replace the branded fallback.
        let saved;
        try {
          saved = await setProjectVerifiedCustomDomain(
            resolution.appProjectId,
            domain,
          );
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "23505"
          ) {
            return NextResponse.json(
              { error: "Domänen är redan kopplad till ett annat projekt." },
              { status: 409 },
            );
          }
          throw error;
        }
        if (!saved) {
          throw new Error("Den verifierade domänen kunde inte sparas på projektet.");
        }
        await setLatestDeploymentLiveUrlForChat(chatId, domain);
      } else if (resolution.appProjectId) {
        await clearProjectCustomDomainVerification(
          resolution.appProjectId,
          domain,
        );
      }

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
  });
}
