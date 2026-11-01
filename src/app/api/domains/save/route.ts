/**
 * Domain Save API
 * ===============
 *
 * POST /api/domains/save
 * Body: { deploymentId: string, domain: string }
 *
 * Persists the linked domain on the deployment record.
 */

import { NextRequest, NextResponse } from "next/server";
import { setDeploymentDomainForRequest } from "@/lib/deployment";
import { getCurrentUser } from "@/lib/auth/auth";
import { normalizeObservedDomain } from "@/lib/domains/domain-observation";
import { withRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  return withRateLimit(req, "domains:save", async () => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    try {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "invalid request" }, { status: 400 });
      }
      const payload = body as Record<string, unknown>;
      const deploymentId =
        typeof payload.deploymentId === "string" ? payload.deploymentId.trim() : "";
      const rawDomain =
        typeof payload.domain === "string" ? payload.domain.trim().toLowerCase() : "";

      if (!deploymentId || deploymentId.length > 128 || !rawDomain) {
        return NextResponse.json(
          { error: "deploymentId and domain are required" },
          { status: 400 },
        );
      }
      const normalized = normalizeObservedDomain(rawDomain);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }

      const updated = await setDeploymentDomainForRequest(req, deploymentId, normalized.domain);
      if (!updated) {
        return NextResponse.json(
          { error: "Deployment not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, deploymentId, domain: normalized.domain });
    } catch (error) {
      console.error("[domains/save] Error:", error);
      return NextResponse.json(
        { error: "Could not save domain" },
        { status: 500 },
      );
    }
  });
}
