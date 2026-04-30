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
import { withRateLimit } from "@/lib/rateLimit";

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
      const body = await req.json();
      const deploymentId = (body.deploymentId ?? "").trim();
      const domain = (body.domain ?? "").trim().toLowerCase();

      if (!deploymentId || !domain) {
        return NextResponse.json(
          { error: "deploymentId and domain are required" },
          { status: 400 },
        );
      }

      const updated = await setDeploymentDomainForRequest(req, deploymentId, domain);
      if (!updated) {
        return NextResponse.json(
          { error: "Deployment not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, deploymentId, domain });
    } catch (error) {
      console.error("[domains/save] Error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
