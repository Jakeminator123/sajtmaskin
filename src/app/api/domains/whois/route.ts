/**
 * Domain WHOIS / RDAP API
 * =======================
 *
 * GET  /api/domains/whois?domain=example.com
 * POST /api/domains/whois  { domain: string }
 *
 * Returns RDAP-derived registration metadata: registrar, created /
 * updated / expires timestamps, status flags, nameservers, and a
 * best-effort `registered` boolean. RDAP is the modern WHOIS
 * (RFC 7480/9082) — no API key required.
 *
 * For non-RDAP TLDs the response still has shape, but `rdapSupported`
 * will be `false` and structural fields will be `null`.
 */

import { NextRequest, NextResponse } from "next/server";
import { lookupWhois } from "@/lib/domains/rdap-client";
import { withRateLimit } from "@/lib/rateLimit";

export const maxDuration = 15;

function normalizeDomain(raw: string): string {
  let value = raw.trim().toLowerCase();
  for (const prefix of ["https://", "http://"]) {
    if (value.startsWith(prefix)) value = value.slice(prefix.length);
  }
  value = value.split("/")[0]!.split("?")[0]!.split("#")[0]!;
  if (value.startsWith("www.")) value = value.slice(4);
  if (value.includes("@")) value = value.split("@", 2)[1]!;
  return value.replace(/^\.+|\.+$/g, "");
}

async function handle(domainInput: string | null) {
  if (!domainInput) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  const domain = normalizeDomain(domainInput);
  if (!domain || !domain.includes(".")) {
    return NextResponse.json({ error: "ogiltig domän" }, { status: 400 });
  }

  const result = await lookupWhois(domain);
  return NextResponse.json({
    success: result.ok || result.registered === false,
    domain: result.domain,
    registered: result.registered,
    rdapSupported: result.rdapSupported,
    registrar: result.registrarName,
    registrarHandle: result.registrarHandle,
    registrarEmails: result.registrarEmails,
    created: result.created,
    updated: result.updated,
    expires: result.expires,
    status: result.status,
    nameservers: result.nameservers,
    queryUrl: result.queryUrl,
    error: result.error,
  });
}

export async function GET(req: NextRequest) {
  return withRateLimit(req, "domains:whois", async () => {
    const url = new URL(req.url);
    return handle(url.searchParams.get("domain"));
  });
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "domains:whois", async () => {
    try {
      const body = await req.json().catch(() => ({}) as Record<string, unknown>);
      const domain = typeof body?.domain === "string" ? body.domain : null;
      return handle(domain);
    } catch (error) {
      console.error("[domains/whois] Error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
