import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { OPENCLAW } from "@/lib/config";
import { withRateLimit } from "@/lib/rateLimit";
import {
  runBugHunt,
  clampBugHuntBudget,
  type BugHuntScenario,
  type BugHuntBudget,
  type EngineErrorLogRow,
} from "@/lib/openclaw/debug/bug-hunt";
import { createHttpEngineClient } from "@/lib/openclaw/debug/engine-client";
import { matchesOpenClawDebugToken } from "@/lib/openclaw/debug/owner-token";
import { createDebugFindings } from "@/lib/db/services/debug-findings";
import { getLatestEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { getRequestUserId } from "@/lib/tenant";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Gated trigger for the OpenClaw debug-mode bug-hunt (Mode B).
 *
 * Hard gates (defense in depth):
 *  - `OPENCLAW.debugEnabled` (OC_DEBUG, production-safeguarded) must be on.
 *  - the OWNER gate: `OC_DEBUG_RUN_TOKEN` must be set AND the request must send a
 *    matching `x-oc-debug-token` header (constant-time compared). This is the
 *    operator secret — not mere header presence.
 *  - OWNER identity: the forwarded session must resolve to a real authenticated
 *    user (a guest `session` is rejected). The bug-hunt creates and operates ONLY
 *    on chats it mints under THIS forwarded session (createChat/sendFollowUp), and
 *    the DB-backed `getErrorLogs` reads error logs only for version ids minted by
 *    the run — it never touches another tenant's pre-existing resources. The token
 *    is NEVER forwarded to the engine endpoints; the session cookie/bearer is the
 *    tenant scope.
 *  - budget overrides are clamped to server-owned ceilings.
 *
 * Intended to be driven by scripts/openclaw/bug-hunt.mjs one scenario at a time
 * so no single serverless invocation exceeds its budget; the script provides the
 * unbounded outer loop + kill-switch (Ctrl+C).
 */

interface RunRequestBody {
  runId?: string;
  scenarios?: BugHuntScenario[];
  scenario?: BugHuntScenario;
  budget?: Partial<BugHuntBudget>;
  /**
   * App project id that minted debug chats are created under. Required because
   * the real create-chat route resolves the chat's project from
   * `meta.appProjectId`/`projectId` and 400s otherwise. Must be owned by the
   * forwarded session.
   */
  appProjectId?: string;
  projectId?: string;
}

/** Tenant-scoping headers forwarded to the engine endpoints (NOT the debug token). */
function forwardAuthHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  const authorization = req.headers.get("authorization");
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  return headers;
}

export async function POST(req: Request) {
  return withRateLimit(req, "openclaw:debug-run", async () => {
    if (!OPENCLAW.debugEnabled) {
      return NextResponse.json(
        { error: "OpenClaw debug-mode is disabled (set OC_DEBUG; not allowed in production without OC_DEBUG_ALLOW_PROD)." },
        { status: 403 },
      );
    }

    // Owner gate: a real shared secret, not mere header presence.
    if (!matchesOpenClawDebugToken(req)) {
      return NextResponse.json(
        { error: "Forbidden: set OC_DEBUG_RUN_TOKEN and send a matching x-oc-debug-token header." },
        { status: 403 },
      );
    }

    const authHeaders = forwardAuthHeaders(req);
    if (!authHeaders.cookie && !authHeaders.authorization) {
      return NextResponse.json(
        { error: "Authenticated owner session required (forward cookie or authorization for tenant scoping)." },
        { status: 401 },
      );
    }

    // Owner identity (Codex P1): require a real authenticated user, not a mere
    // guest session. Combined with the operator token this binds the expensive
    // run to a logged-in owner; the run only ever touches chats it mints under
    // this same session.
    const ownerUserId = await getRequestUserId(req);
    if (!ownerUserId || ownerUserId.startsWith("guest:")) {
      return NextResponse.json(
        { error: "Authenticated owner account required (a guest session cannot trigger a bug-hunt)." },
        { status: 403 },
      );
    }

    let body: RunRequestBody;
    try {
      body = (await req.json()) as RunRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const scenarios = body.scenarios ?? (body.scenario ? [body.scenario] : []);
    if (scenarios.length === 0) {
      return NextResponse.json({ error: "No scenarios provided" }, { status: 400 });
    }

    const appProjectId =
      typeof body.appProjectId === "string" && body.appProjectId.trim()
        ? body.appProjectId.trim()
        : undefined;
    const projectId =
      typeof body.projectId === "string" && body.projectId.trim()
        ? body.projectId.trim()
        : undefined;
    if (!appProjectId && !projectId) {
      return NextResponse.json(
        {
          error:
            "appProjectId (or projectId) is required: minted debug chats need an owned project. Pass --app-project-id to scripts/openclaw/bug-hunt.mjs.",
        },
        { status: 400 },
      );
    }

    const runId = typeof body.runId === "string" && body.runId.trim() ? body.runId.trim() : nanoid();
    // Clamp any client-supplied budget to server-owned ceilings (anti-runaway).
    const budget: BugHuntBudget = clampBugHuntBudget(body.budget);

    const baseUrl = new URL(req.url).origin;
    const httpClient = createHttpEngineClient({ baseUrl, authHeaders, appProjectId, projectId });

    // The HTTP client's getErrorLogs is chat-scoped and can't read by versionId
    // alone, so back it with the DB service server-side (we run with DB access).
    const client = {
      ...httpClient,
      async getErrorLogs(versionId: string): Promise<EngineErrorLogRow[]> {
        if (!versionId) return [];
        const rows = await getLatestEngineVersionErrorLogs(versionId, 80).catch(() => []);
        return rows.map((row) => ({
          level: row.level,
          category: row.category ?? null,
          message: row.message,
          meta: row.meta ?? null,
          createdAt:
            row.created_at instanceof Date
              ? row.created_at.toISOString()
              : typeof row.created_at === "string"
                ? row.created_at
                : undefined,
        }));
      },
    };

    try {
      const result = await runBugHunt(
        {
          client,
          writeFindings: (findings) => createDebugFindings(findings),
          log: (event, detail) => {
            console.warn(`[oc-debug-run] ${event}`, detail ?? {});
          },
        },
        { runId, scenarios, budget },
      );
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "bug-hunt failed", runId },
        { status: 500 },
      );
    }
  });
}
