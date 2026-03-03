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
import { setDeploymentDomain } from "@/lib/deployment";

export async function POST(req: NextRequest) {
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

    await setDeploymentDomain(deploymentId, domain);

    return NextResponse.json({ success: true, deploymentId, domain });
  } catch (error) {
    console.error("[domains/save] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
