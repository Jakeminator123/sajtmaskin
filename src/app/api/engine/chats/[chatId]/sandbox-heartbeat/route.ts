import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  getActiveSandboxSessionAsync,
  touchSandboxSessionAsync,
} from "@/lib/gen/sandbox/session-store";
import { logSandboxLifecycleTelemetry } from "@/lib/gen/sandbox/lifecycle-telemetry";
import { isTier2PreviewConfigured } from "@/lib/gen/sandbox/tier2-config";
import type { PreviewHeartbeatApiJson } from "@/lib/gen/preview/preview-contract";

const bodySchema = z.object({
  versionId: z.string().min(1),
  previewSessionId: z.string().min(1),
  viewerId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "preview-session:heartbeat", async () => {
    try {
      const { chatId } = await ctx.params;

      if (!isTier2PreviewConfigured()) {
        const body: PreviewHeartbeatApiJson = { ok: false, reason: "preview_session_not_configured" };
        logSandboxLifecycleTelemetry({
          kind: "heartbeat",
          ok: false,
          chatId,
          reason: "preview_session_not_configured",
        });
        return NextResponse.json(body, { status: 503 });
      }

      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json({ ok: false, reason: "not_found" } satisfies PreviewHeartbeatApiJson, {
          status: 404,
        });
      }

      const raw = await req.json().catch(() => ({}));
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ ok: false, reason: "invalid_body" } satisfies PreviewHeartbeatApiJson, {
          status: 400,
        });
      }

      const { versionId, previewSessionId, viewerId } = parsed.data;
      const session = await getActiveSandboxSessionAsync(chatId);

      if (!session) {
        logSandboxLifecycleTelemetry({
          kind: "heartbeat",
          ok: false,
          chatId,
          reason: "no_session",
          viewerId,
        });
        return NextResponse.json({ ok: false, reason: "no_session" } satisfies PreviewHeartbeatApiJson);
      }

      if ((session.versionId ?? "") !== versionId || session.sandboxId !== previewSessionId) {
        logSandboxLifecycleTelemetry({
          kind: "heartbeat",
          ok: false,
          chatId,
          reason: "session_mismatch",
          viewerId,
        });
        return NextResponse.json({ ok: false, reason: "session_mismatch" } satisfies PreviewHeartbeatApiJson);
      }

      await touchSandboxSessionAsync({
        chatId,
        sandboxId: session.sandboxId,
        sandboxUrl: session.sandboxUrl,
        versionId: session.versionId,
      });

      logSandboxLifecycleTelemetry({
        kind: "heartbeat",
        ok: true,
        chatId,
        viewerId,
      });

      return NextResponse.json({ ok: true } satisfies PreviewHeartbeatApiJson);
    } catch (err) {
      console.error("[preview-heartbeat] POST", err);
      return NextResponse.json(
        {
          ok: false,
          reason: err instanceof Error ? err.message : "unknown",
        } satisfies PreviewHeartbeatApiJson,
        { status: 500 },
      );
    }
  });
}
