import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import {
  runWithLlmUsageContext,
  safeUsageOwnerId,
  setLlmUsageContext,
} from "@/lib/observability/llm-usage";
import { getEngineVersionForChatByIdForRequest, getRequestUserId } from "@/lib/tenant";
import { runVersionProductPostcheck } from "@/lib/gen/verify/version-product-postcheck";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  versionId: z.string().min(1),
  previewUrl: z.string().trim().optional().nullable(),
  /**
   * Exact `files_revision` the caller confirmed persisted. When set, a DB
   * mismatch is `preview_superseded` — never an attestation of a stale
   * client snapshot.
   */
  filesRevision: z.string().trim().min(1).max(160).optional(),
});


export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "engine:product-postcheck", () =>
    runWithLlmUsageContext({}, async () => {
      const { chatId } = await ctx.params;
      const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return NextResponse.json({ ok: false, error: "Validation failed", details: parsed.error.issues }, { status: 400 });
      const userId = await safeUsageOwnerId(() => getRequestUserId(req));
      setLlmUsageContext({ chatId, userId, sessionId: getSessionIdFromRequest(req) });
      const scoped = await getEngineVersionForChatByIdForRequest(req, chatId, parsed.data.versionId);
      if (!scoped) return NextResponse.json({ ok: false, error: "Version not found for chat" }, { status: 404 });
      setLlmUsageContext({ versionId: scoped.version.id });
      const execution = await runVersionProductPostcheck({ chatId: scoped.chat.id, versionId: scoped.version.id,
        userId: userId ?? "anonymous", previewUrl: parsed.data.previewUrl,
        filesRevision: parsed.data.filesRevision ?? (scoped.version.files_revision?.trim() || undefined) });
      if (execution.kind === "not_found") return NextResponse.json({ ok: false, error: "Version not found for chat" }, { status: 404 });
      if (execution.kind === "unavailable") {
        return NextResponse.json({ error: execution.code === "claim_unavailable"
          ? "Product postcheck claim unavailable (database error). Try again shortly."
          : "Product postcheck lease unavailable. Try again shortly.", code: execution.code,
          retryable: true, skipped: true, skippedReason: execution.code }, { status: 503, headers: { "Retry-After": "3" } });
      }
      return NextResponse.json(execution.result);
    }),
  );
}
