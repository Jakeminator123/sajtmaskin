/**
 * Domain Link API
 * ===============
 *
 * POST /api/domains/link
 * Body: { domain: string, chatId: string }
 *
 * Links a domain the customer already owns to their generated project.
 * DNS values come from the current Vercel config for that project — never
 * hardcoded anycast defaults. Availability / purchase is not required here.
 */

import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { isVercelConfigured } from "@/lib/vercel/vercel-client";
import { addZoneRecord, isLoopiaConfigured } from "@/lib/loopia/loopia-client";
import { getCurrentUser } from "@/lib/auth/auth";
import { db, dbConfigured } from "@/lib/db/client";
import { domainOrders } from "@/lib/db/schema";
import { withRateLimit } from "@/lib/rate-limit";
import { resolveVercelProjectForChat } from "@/lib/domains/resolve-vercel-project";
import { normalizeObservedDomain } from "@/lib/domains/domain-observation";
import {
  dnsInstructionRecords,
  linkCustomerDomain,
  type ResolvedHosting,
} from "@/lib/domains/customer-domain-flow";

export const maxDuration = 15;

async function callerOwnsRegisteredDomain(userId: string, domain: string): Promise<boolean> {
  if (!dbConfigured) return false;
  try {
    const rows = await db
      .select({ id: domainOrders.id })
      .from(domainOrders)
      .where(
        and(
          eq(domainOrders.user_id, userId),
          eq(domainOrders.status, "registered"),
          sql`lower(${domainOrders.domain}) = ${domain.toLowerCase()}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    console.error("[domains/link] Ownership lookup failed:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "domains:link", async () => {
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

      if (!isVercelConfigured()) {
        return NextResponse.json(
          { error: "Vercel is not configured (missing VERCEL_TOKEN)" },
          { status: 503 },
        );
      }

      const resolution = await resolveVercelProjectForChat(req, chatId);
      if (!resolution.ok) {
        return NextResponse.json({ error: resolution.error }, { status: resolution.status });
      }
      if (!resolution.appProjectId) {
        return NextResponse.json(
          { error: "Chatten saknar ett projekt." },
          { status: 409 },
        );
      }

      const hosting: ResolvedHosting = {
        vercelProjectId: resolution.vercelProjectId,
        appProjectId: resolution.appProjectId,
        chatId: resolution.chatId,
      };

      const linked = await linkCustomerDomain({ hosting, domain: normalized.domain });
      if (!linked.ok) {
        return NextResponse.json(
          { error: linked.error, snapshot: linked.snapshot ?? null },
          { status: linked.status },
        );
      }

      const records = dnsInstructionRecords(linked.snapshot).map((record) => ({
        type: record.type,
        host: record.host,
        value: record.value,
        ttl: 3600,
      }));

      let dnsSetup: { success: boolean; method: string; error?: string } | null = null;
      const tld = normalized.domain.split(".").pop()?.toLowerCase();
      const isSwedish = tld === "se" || tld === "nu";
      const ownsRegisteredDomain = await callerOwnsRegisteredDomain(user.id, normalized.domain);
      const configuration = records.filter((record) => record.type === "A" || record.type === "CNAME");

      if (isSwedish && isLoopiaConfigured() && ownsRegisteredDomain && configuration.length > 0) {
        try {
          const results = await Promise.all(
            configuration.map((record) => {
              const zoneHost =
                record.host === normalized.domain || record.host === "@"
                  ? "@"
                  : record.host.replace(`.${normalized.domain}`, "").replace(/\.$/, "") || "@";
              return addZoneRecord(normalized.domain, zoneHost, {
                type: record.type === "CNAME" ? "CNAME" : "A",
                data: record.value,
                ttl: record.ttl,
              });
            }),
          );
          const failed = results.find((result) => result !== "OK");
          dnsSetup = {
            success: !failed,
            method: "loopia",
            error: failed,
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

      const dnsSetupFailed = dnsSetup !== null && !dnsSetup.success;
      const dnsInstructions =
        records.length > 0
          ? {
              message:
                "Peka din domän genom att lägga till dessa poster hos din registrar. Värdena kommer från den aktuella konfigurationen för just den här sajten.",
              records,
            }
          : null;

      return NextResponse.json({
        linked: true,
        success: !dnsSetupFailed,
        domain: normalized.domain,
        verified: linked.snapshot.primary?.ownership === "verified",
        dnsSetup,
        dnsInstructions,
        snapshot: linked.snapshot,
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
