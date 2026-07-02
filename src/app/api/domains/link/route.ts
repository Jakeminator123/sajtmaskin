/**
 * Domain Link API
 * ===============
 *
 * POST /api/domains/link
 * Body: { domain: string, projectId?: string }
 *
 * Links a domain to a Vercel project and optionally sets up
 * DNS records via Loopia for Swedish domains (.se/.nu).
 *
 * Flow:
 *  1. Add domain to Vercel project
 *  2. If .se/.nu + Loopia configured: create CNAME record pointing to Vercel
 *  3. Return verification status and DNS instructions
 */

import { NextRequest, NextResponse } from "next/server";
import { addDomainToProject, isVercelConfigured } from "@/lib/vercel/vercel-client";
import { addZoneRecord, isLoopiaConfigured } from "@/lib/loopia/loopia-client";
import { getCurrentUser } from "@/lib/auth/auth";
import { withRateLimit } from "@/lib/rateLimit";

export const maxDuration = 15;

const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";
const VERCEL_A_TARGET = "76.76.21.21";

export async function POST(req: NextRequest) {
  return withRateLimit(req, "domains:link", async () => {
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
      const configuredProjectId = process.env.VERCEL_PROJECT_ID?.trim() || "";
      const requestedProjectId = body.projectId?.trim() || "";
      const projectId = configuredProjectId;
      const teamId = process.env.VERCEL_TEAM_ID;

      if (!domain) {
        return NextResponse.json({ error: "domain is required" }, { status: 400 });
      }

      if (!isVercelConfigured()) {
        return NextResponse.json(
          { error: "Vercel is not configured (missing VERCEL_TOKEN)" },
          { status: 503 },
        );
      }

      if (requestedProjectId && requestedProjectId !== configuredProjectId) {
        return NextResponse.json(
          { error: "projectId is not allowed for this workspace" },
          { status: 403 },
        );
      }

      if (!projectId) {
        return NextResponse.json(
          { error: "Vercel project is not configured (missing VERCEL_PROJECT_ID)" },
          { status: 503 },
        );
      }

      let vercelResult;
      try {
        vercelResult = await addDomainToProject(projectId, domain, teamId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add domain to Vercel";
        console.error("[domains/link] Vercel addDomain error:", err);
        return NextResponse.json({ error: message }, { status: 502 });
      }

      const tld = domain.split(".").pop()?.toLowerCase();
      const isSwedish = tld === "se" || tld === "nu";
      let dnsSetup: { success: boolean; method: string; error?: string } | null = null;

      if (isSwedish && isLoopiaConfigured()) {
        try {
          const baseDomain = domain;
          // Apex (@) must be an A/ALIAS record — a CNAME on the root is invalid
          // DNS. Mirror the manual fallback below: A on @, CNAME only on www.
          const apexResult = await addZoneRecord(baseDomain, "@", {
            type: "A",
            data: VERCEL_A_TARGET,
            ttl: 3600,
          });
          const wwwResult = await addZoneRecord(baseDomain, "www", {
            type: "CNAME",
            data: VERCEL_CNAME_TARGET,
            ttl: 3600,
          });
          const failure =
            apexResult !== "OK" ? apexResult : wwwResult !== "OK" ? wwwResult : null;
          dnsSetup = {
            success: failure === null,
            method: "loopia",
            error: failure ?? undefined,
          };
        } catch (err) {
          console.error("[domains/link] Loopia DNS setup error:", err);
          dnsSetup = {
            success: false,
            method: "loopia",
            error: err instanceof Error ? err.message : "DNS setup failed",
          };
        }
      }

      const dnsInstructions = isSwedish && !dnsSetup?.success
        ? {
            message: "Peka din domän till Vercel genom att lägga till dessa DNS-poster hos din registrar:",
            records: [
              {
                type: "CNAME",
                host: "www",
                value: VERCEL_CNAME_TARGET,
                ttl: 3600,
              },
              {
                type: "A",
                host: "@",
                value: VERCEL_A_TARGET,
                ttl: 3600,
              },
            ],
          }
        : null;

      return NextResponse.json({
        success: true,
        domain: vercelResult.name,
        verified: vercelResult.verified,
        dnsSetup,
        dnsInstructions,
      });
    } catch (error) {
      console.error("[domains/link] Error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
