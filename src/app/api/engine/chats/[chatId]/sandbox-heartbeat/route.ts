import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  getActiveSandboxSessionAsync,
  touchSandboxSessionAsync,
} from "@/lib/gen/sandbox/session-store";
import { logSandboxLifecycleTelemetry } from "@/lib/gen/sandbox/lifecycle-telemetry";
import { isSandboxConfigured } from "@/lib/mcp/runtime-url";
import type { SandboxHeartbeatApiJson } from "@/lib/gen/preview/preview-contract";

const bodySchema = z.object({
  versionId: z.string().min(1),
  sandboxId: z.string().min(1),
  viewerId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "sandbox:heartbeat", async () => {
    try {
      const { chatId } = await ctx.params;

      if (!isSandboxConfigured()) {
        const body: SandboxHeartbeatApiJson = { ok: false, reason: "sandbox_not_configured" };
        logSandboxLifecycleTelemetry({
          kind: "heartbeat",
          ok: false,
          chatId,
          reason: "sandbox_not_configured",
        });
        return NextResponse.json(body, { status: 503 });
      }

      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json({ ok: false, reason: "not_found" } satisfies SandboxHeartbeatApiJson, {
          status: 404,
        });
      }

      const raw = await req.json().catch(() => ({}));
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ ok: false, reason: "invalid_body" } satisfies SandboxHeartbeatApiJson, {
          status: 400,
        });
      }

      const { versionId, sandboxId, viewerId } = parsed.data;
      const session = await getActiveSandboxSessionAsync(chatId);

      if (!session) {
        logSandboxLifecycleTelemetry({
          kind: "heartbeat",
          ok: false,
          chatId,
          reason: "no_session",
          viewerId,
        });
        return NextResponse.json({ ok: false, reason: "no_session" } satisfies SandboxHeartbeatApiJson);
      }

      if ((session.versionId ?? "") !== versionId || session.sandboxId !== sandboxId) {
        logSandboxLifecycleTelemetry({
          kind: "heartbeat",
          ok: false,
          chatId,
          reason: "session_mismatch",
          viewerId,
        });
        return NextResponse.json({ ok: false, reason: "session_mismatch" } satisfies SandboxHeartbeatApiJson);
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

      return NextResponse.json({ ok: true } satisfies SandboxHeartbeatApiJson);
    } catch (err) {
      console.error("[sandbox-heartbeat] POST", err);
      return NextResponse.json(
        {
          ok: false,
          reason: err instanceof Error ? err.message : "unknown",
        } satisfies SandboxHeartbeatApiJson,
        { status: 500 },
      );
    }
  });
}
