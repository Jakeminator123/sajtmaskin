/**
 * Domain Verify API
 * =================
 *
 * POST /api/domains/verify
 * Body: { domain: string, chatId: string }
 *
 * Re-checks ownership, DNS and HTTPS as three separate facts. A transient
 * provider error is unknown status — it does not revoke a previously live
 * custom domain.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { withRateLimit } from "@/lib/rate-limit";
import { resolveVercelProjectForChat } from "@/lib/domains/resolve-vercel-project";
import { normalizeObservedDomain } from "@/lib/domains/domain-observation";
import {
  verifyCustomerDomain,
  type ResolvedHosting,
} from "@/lib/domains/customer-domain-flow";

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  return withRateLimit(req, "domains:verify", async () => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    try {
      const body = await req.json();
      const rawDomain = (body.domain ?? "").trim().toLowerCase();
      const chatId = (body.chatId ?? "").trim();

      if (!rawDomain) {
        return NextResponse.json({ error: "domain is required" }, { status: 400 });
      }
      if (!chatId) {
        return NextResponse.json({ error: "chatId is required" }, { status: 400 });
      }

      const normalized = normalizeObservedDomain(rawDomain);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }

      const resolution = await resolveVercelProjectForChat(req, chatId);
      if (!resolution.ok) {
        return NextResponse.json({ error: resolution.error }, { status: resolution.status });
      }
      if (!resolution.appProjectId) {
        return NextResponse.json({ error: "Chatten saknar ett projekt." }, { status: 409 });
      }

      const hosting: ResolvedHosting = {
        vercelProjectId: resolution.vercelProjectId,
        appProjectId: resolution.appProjectId,
        chatId: resolution.chatId,
      };

      const result = await verifyCustomerDomain({ hosting, domain: normalized.domain });
      if (!result.ok) {
        return NextResponse.json(
          {
            error: result.error,
            ...(result.code ? { code: result.code } : {}),
            snapshot: result.snapshot ?? null,
          },
          { status: result.status },
        );
      }

      const primary = result.snapshot.primary;
      const verified =
        primary?.connection === "connected" &&
        primary.ownership === "verified" &&
        primary.dns === "valid" &&
        primary.https === "valid";

      return NextResponse.json({
        success: true,
        domain: normalized.domain,
        verified,
        ownership: primary?.ownership ?? "unknown",
        dns: primary?.dns ?? "unknown",
        https: primary?.https ?? "unknown",
        status: primary?.status ?? "unknown",
        statusLabel: primary?.statusLabel ?? "Okänd status",
        snapshot: result.snapshot,
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
