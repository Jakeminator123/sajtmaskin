import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  getActivePreviewSessionAsync,
  touchPreviewSessionAsync,
} from "@/lib/gen/preview/session-store";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";
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
        logPreviewLifecycleTelemetry({
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
      const session = await getActivePreviewSessionAsync(chatId);

      if (!session) {
        logPreviewLifecycleTelemetry({
          kind: "heartbeat",
          ok: false,
          chatId,
          reason: "no_session",
          viewerId,
        });
        return NextResponse.json({ ok: false, reason: "no_session" } satisfies PreviewHeartbeatApiJson);
      }

      if ((session.versionId ?? "") !== versionId || session.previewSessionId !== previewSessionId) {
        logPreviewLifecycleTelemetry({
          kind: "heartbeat",
          ok: false,
          chatId,
          reason: "session_mismatch",
          viewerId,
        });
        return NextResponse.json({ ok: false, reason: "session_mismatch" } satisfies PreviewHeartbeatApiJson);
      }

      await touchPreviewSessionAsync({
        chatId,
        previewSessionId: session.previewSessionId,
        previewUrl: session.previewUrl,
        versionId: session.versionId,
      });

      logPreviewLifecycleTelemetry({
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
