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
import { normalizeDomainHostname } from "@/lib/live-site-url";
import { withRateLimit } from "@/lib/rate-limit";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";

export const maxDuration = 15;
const MAX_DOMAIN_INPUT_CHARS = 512;
const MAX_WHOIS_BODY_BYTES = 2_048;

function normalizeDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  for (const prefix of ["https://", "http://"]) {
    if (value.startsWith(prefix)) value = value.slice(prefix.length);
  }
  value = value.split("/")[0]!.split("?")[0]!.split("#")[0]!;
  if (value.startsWith("www.")) value = value.slice(4);
  if (value.includes("@")) value = value.split("@", 2)[1]!;
  return normalizeDomainHostname(value.replace(/^\.+|\.+$/g, ""));
}

async function handle(domainInput: string | null) {
  if (!domainInput) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }
  if (domainInput.length > MAX_DOMAIN_INPUT_CHARS) {
    return NextResponse.json({ error: "ogiltig domän" }, { status: 400 });
  }

  const domain = normalizeDomain(domainInput);
  if (!domain || !domain.includes(".")) {
    return NextResponse.json({ error: "ogiltig domän" }, { status: 400 });
  }

  try {
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
  } catch (error) {
    console.error("[domains/whois] Lookup failed:", error);
    return NextResponse.json({ error: "WHOIS lookup failed" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return withRateLimit(req, "domains:whois", async () => {
    const url = new URL(req.url);
    return handle(url.searchParams.get("domain"));
  });
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "domains:whois", async () => {
    const bodyResult = await readRequestJsonWithLimit<Record<string, unknown>>(
      req,
      MAX_WHOIS_BODY_BYTES,
    );
    if (!bodyResult.ok && bodyResult.reason === "too_large") {
      return NextResponse.json({ error: "request body too large" }, { status: 413 });
    }
    const body = bodyResult.ok ? bodyResult.value : {};
    const domain = typeof body?.domain === "string" ? body.domain : null;
    return handle(domain);
  });
}
