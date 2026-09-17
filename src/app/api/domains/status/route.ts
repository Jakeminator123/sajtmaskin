import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  normalizeObservedDomain,
  unknownDomainObservation,
} from "@/lib/domains/domain-observation";
import { resolveVercelProjectForChat } from "@/lib/domains/resolve-vercel-project";
import { withRateLimit } from "@/lib/rate-limit";
import { observeVercelDomain } from "@/lib/vercel/domain-observation";

export const maxDuration = 15;

/**
 * Read current provider state for a customer-owned hostname. This route never
 * adds, verifies or activates a domain and never updates project/live URL data.
 */
export async function GET(req: NextRequest) {
  return withRateLimit(req, "read", async () => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const url = new URL(req.url);
    const chatId = (url.searchParams.get("chatId") ?? "").trim();
    const normalized = normalizeObservedDomain(url.searchParams.get("domain") ?? "");

    if (!chatId) {
      return NextResponse.json({ error: "chatId is required" }, { status: 400 });
    }
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const resolution = await resolveVercelProjectForChat(req, chatId);
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }

    try {
      const observation = await observeVercelDomain({
        projectId: resolution.vercelProjectId,
        domain: normalized.domain,
        teamId: process.env.VERCEL_TEAM_ID,
      });
      return NextResponse.json(observation, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      console.error("[domains/status] Provider observation failed:", error);
      return NextResponse.json(unknownDomainObservation(normalized.domain), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
  });
}
