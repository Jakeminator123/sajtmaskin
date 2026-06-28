import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { OPENCLAW } from "@/lib/config";
import { withRateLimit } from "@/lib/rateLimit";
import {
  runBugHunt,
  DEFAULT_BUG_HUNT_BUDGET,
  type BugHuntScenario,
  type BugHuntBudget,
  type EngineErrorLogRow,
} from "@/lib/openclaw/debug/bug-hunt";
import { createHttpEngineClient } from "@/lib/openclaw/debug/engine-client";
import { createDebugFindings } from "@/lib/db/services/debug-findings";
import { getLatestEngineVersionErrorLogs } from "@/lib/db/services/version-errors";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Gated trigger for the OpenClaw debug-mode bug-hunt (Mode B).
 *
 * Hard gates:
 *  - `OPENCLAW.debugEnabled` (OC_DEBUG, production-safeguarded) must be on.
 *  - the request must carry the owner's auth (cookie/authorization), which is
 *    forwarded to the engine endpoints so generated chats belong to the owner /
 *    debug tenant. The engine endpoints enforce tenant scoping themselves.
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
}

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

    const authHeaders = forwardAuthHeaders(req);
    if (!authHeaders.cookie && !authHeaders.authorization) {
      return NextResponse.json(
        { error: "Authenticated owner session required (forward cookie or authorization)." },
        { status: 401 },
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

    const runId = typeof body.runId === "string" && body.runId.trim() ? body.runId.trim() : nanoid();
    const budget: BugHuntBudget = { ...DEFAULT_BUG_HUNT_BUDGET, ...(body.budget ?? {}) };

    const baseUrl = new URL(req.url).origin;
    const httpClient = createHttpEngineClient({ baseUrl, authHeaders });

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
