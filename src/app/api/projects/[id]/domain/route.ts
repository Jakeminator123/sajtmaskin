import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { withRateLimit } from "@/lib/rate-limit";
import { resolveVercelProjectForAppProject } from "@/lib/domains/resolve-vercel-project";
import {
  activateCustomerDomain,
  inspectCustomerDomain,
  linkCustomerDomain,
  unlinkCustomerDomain,
  verifyCustomerDomain,
  type FlowResult,
  type ResolvedHosting,
} from "@/lib/domains/customer-domain-flow";
import { normalizeObservedDomain } from "@/lib/domains/domain-observation";
import { getProjectByIdForOwner } from "@/lib/db/services/projects";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import type { Project } from "@/lib/db/services/shared";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function toHosting(
  resolution: Extract<
    Awaited<ReturnType<typeof resolveVercelProjectForAppProject>>,
    { ok: true }
  >,
): ResolvedHosting | null {
  if (!resolution.appProjectId) return null;
  return {
    vercelProjectId: resolution.vercelProjectId,
    appProjectId: resolution.appProjectId,
    chatId: resolution.chatId,
  };
}

function jsonResult(result: FlowResult): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, snapshot: result.snapshot ?? null },
      {
        status: result.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
  return NextResponse.json(
    { success: true, snapshot: result.snapshot },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function requireOwnedProject(
  request: NextRequest,
  projectId: string,
): Promise<{ ok: true; project: Project } | { ok: false; response: NextResponse }> {
  const user = await getCurrentUser(request);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }
  const sessionId = getSessionIdFromRequest(request);
  const owned = await getProjectByIdForOwner(projectId, {
    userId: user.id,
    sessionId,
  });
  if (!owned) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 }),
    };
  }
  return { ok: true, project: owned };
}

/**
 * GET /api/projects/[id]/domain
 * Read current customer-domain status for the owned project.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withRateLimit(request, "read", async () => {
    const { id } = await params;
    const owned = await requireOwnedProject(request, id);
    if (!owned.ok) return owned.response;

    const resolution = await resolveVercelProjectForAppProject(request, owned.project.id);
    if (!resolution.ok) {
      if (resolution.status === 409) {
        return NextResponse.json(
          {
            success: true,
            snapshot: {
              primary: null,
              companion: null,
              liveDomain: null,
              candidateDomain: owned.project.custom_domain ?? null,
              canActivate: false,
              canUnlink: Boolean(owned.project.custom_domain),
              redirectArmed: false,
              publishedSlug: owned.project.published_slug ?? null,
              slugLocked: Boolean(owned.project.published_slug),
              automaticDns: null,
              message: resolution.error,
            },
          },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      }
      return NextResponse.json(
        { error: resolution.error },
        { status: resolution.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const hosting = toHosting(resolution);
    if (!hosting) {
      return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });
    }

    const url = new URL(request.url);
    const requested = (url.searchParams.get("domain") ?? "").trim();
    let domain: string | null = null;
    if (requested) {
      const normalized = normalizeObservedDomain(requested);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }
      domain = normalized.domain;
    }

    const snapshot = await inspectCustomerDomain({
      hosting,
      domain,
      checkHttps: true,
    });
    return NextResponse.json(
      { success: true, snapshot },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

/**
 * POST /api/projects/[id]/domain
 * Body: { action: "link" | "verify" | "activate" | "unlink", domain?: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withRateLimit(request, "domains:link", async () => {
    const { id } = await params;
    const owned = await requireOwnedProject(request, id);
    if (!owned.ok) return owned.response;

    const resolution = await resolveVercelProjectForAppProject(request, owned.project.id);
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }
    const hosting = toHosting(resolution);
    if (!hosting) {
      return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as {
      action?: string;
      domain?: string;
    } | null;
    const action = (body?.action ?? "").trim();
    const domain = (body?.domain ?? "").trim();

    if (action === "link") {
      return jsonResult(await linkCustomerDomain({ hosting, domain }));
    }
    if (action === "verify") {
      return jsonResult(await verifyCustomerDomain({ hosting, domain }));
    }
    if (action === "activate") {
      return jsonResult(await activateCustomerDomain({ hosting, domain }));
    }
    if (action === "unlink") {
      return jsonResult(await unlinkCustomerDomain({ hosting, domain }));
    }

    return NextResponse.json(
      { error: "action måste vara link, verify, activate eller unlink." },
      { status: 400 },
    );
  });
}
