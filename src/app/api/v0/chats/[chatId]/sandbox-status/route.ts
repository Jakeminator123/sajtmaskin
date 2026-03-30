import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  getActiveSandboxSessionAsync,
  SANDBOX_SESSION_HARD_CAP_MS,
  SANDBOX_SESSION_IDLE_MS,
  type SandboxSessionEntry,
} from "@/lib/gen/sandbox-session-store";
import { logSandboxLifecycleTelemetry } from "@/lib/gen/sandbox-lifecycle-telemetry";
import { isSandboxConfigured, tryResumeSandboxById } from "@/lib/mcp/runtime-url";
import type { SandboxStatusApiJson } from "@/lib/gen/preview-contract";

function sessionSoftExpiryAt(entry: SandboxSessionEntry, now: number): number {
  return Math.min(entry.createdAt + SANDBOX_SESSION_HARD_CAP_MS, entry.lastUsedAt + SANDBOX_SESSION_IDLE_MS);
}

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "sandbox:status", async () => {
    try {
      const { chatId } = await ctx.params;
      const url = new URL(req.url);
      const versionId = url.searchParams.get("versionId")?.trim();
      const clientSandboxId = url.searchParams.get("sandboxId")?.trim() || null;

      if (!versionId) {
        return NextResponse.json({ ok: false, message: "versionId query parameter is required." }, { status: 400 });
      }

      if (!isSandboxConfigured()) {
        const body: SandboxStatusApiJson = {
          ok: true,
          status: "missing",
          sandboxId: null,
          sandboxUrl: null,
          versionId: null,
          sessionExpiresAt: null,
          reason: "sandbox_not_configured",
        };
        return NextResponse.json(body);
      }

      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json({ ok: false, message: "Chat not found." }, { status: 404 });
      }

      const now = Date.now();
      const session = await getActiveSandboxSessionAsync(chatId);

      if (!session) {
        const body: SandboxStatusApiJson = {
          ok: true,
          status: "missing",
          sandboxId: null,
          sandboxUrl: null,
          versionId: null,
          sessionExpiresAt: null,
          reason: "no_session",
        };
        logSandboxLifecycleTelemetry({
          kind: "sandbox_status",
          chatId,
          status: "missing",
          versionId,
          sandboxId: null,
        });
        return NextResponse.json(body);
      }

      const sessionVid = session.versionId ?? null;
      if (sessionVid !== versionId) {
        const body: SandboxStatusApiJson = {
          ok: true,
          status: "version_mismatch",
          sandboxId: session.sandboxId,
          sandboxUrl: session.sandboxUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session, now),
          reason: "session_bound_to_other_version",
        };
        logSandboxLifecycleTelemetry({
          kind: "sandbox_status",
          chatId,
          status: "version_mismatch",
          versionId,
          sandboxId: session.sandboxId,
        });
        return NextResponse.json(body);
      }

      if (clientSandboxId && session.sandboxId !== clientSandboxId) {
        const body: SandboxStatusApiJson = {
          ok: true,
          status: "stopped",
          sandboxId: session.sandboxId,
          sandboxUrl: session.sandboxUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session, now),
          reason: "sandbox_id_mismatch",
        };
        logSandboxLifecycleTelemetry({
          kind: "sandbox_status",
          chatId,
          status: "stopped",
          versionId,
          sandboxId: session.sandboxId,
        });
        return NextResponse.json(body);
      }

      const resumed = await tryResumeSandboxById(session.sandboxId);
      if (!resumed) {
        const body: SandboxStatusApiJson = {
          ok: true,
          status: "stopped",
          sandboxId: session.sandboxId,
          sandboxUrl: session.sandboxUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session, now),
          reason: "provider_not_running_or_unreachable",
        };
        logSandboxLifecycleTelemetry({
          kind: "sandbox_status",
          chatId,
          status: "stopped",
          versionId,
          sandboxId: session.sandboxId,
        });
        return NextResponse.json(body);
      }

      const body: SandboxStatusApiJson = {
        ok: true,
        status: "running",
        sandboxId: resumed.sandboxId,
        sandboxUrl: resumed.primaryUrl,
        versionId: sessionVid,
        sessionExpiresAt: sessionSoftExpiryAt(session, now),
      };
      logSandboxLifecycleTelemetry({
        kind: "sandbox_status",
        chatId,
        status: "running",
        versionId,
        sandboxId: resumed.sandboxId,
      });
      return NextResponse.json(body);
    } catch (err) {
      console.error("[sandbox-status] GET", err);
      return NextResponse.json(
        {
          ok: false,
          message: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  });
}
