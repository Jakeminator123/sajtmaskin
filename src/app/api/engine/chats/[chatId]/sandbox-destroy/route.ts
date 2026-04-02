import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { updateVersionSandboxUrl } from "@/lib/db/chat-repository-pg";
import {
  clearSandboxSessionAsync,
  getActiveSandboxSessionAsync,
} from "@/lib/gen/sandbox/session-store";
import { destroyPreviewHostSession } from "@/lib/gen/sandbox/preview-host-client";
import type { SandboxDestroyApiJson } from "@/lib/gen/preview/preview-contract";

const bodySchema = z.object({
  versionId: z.string().min(1),
  sandboxId: z.string().min(1).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "sandbox:destroy", async () => {
    try {
      const { chatId } = await ctx.params;
      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json(
          { ok: false, reason: "not_found", message: "Chat not found." } satisfies SandboxDestroyApiJson,
          { status: 404 },
        );
      }

      const raw = await req.json().catch(() => ({}));
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, reason: "invalid_body", message: "Invalid request body." } satisfies SandboxDestroyApiJson,
          { status: 400 },
        );
      }

      const requestedVersion = await getEngineVersionForChatByIdForRequest(
        req,
        chatId,
        parsed.data.versionId,
      );
      if (!requestedVersion) {
        return NextResponse.json(
          { ok: false, reason: "version_not_found", message: "Version not found for chat." } satisfies SandboxDestroyApiJson,
          { status: 404 },
        );
      }

      const session = await getActiveSandboxSessionAsync(chatId);
      const requestedSandboxId = parsed.data.sandboxId?.trim() || null;
      const matchedSession =
        session &&
        session.versionId === requestedVersion.version.id &&
        (!requestedSandboxId || session.sandboxId === requestedSandboxId)
          ? session
          : null;

      let destroyedOnProvider = false;
      if (matchedSession?.tier2Provider === "preview_host") {
        const destroyed = await destroyPreviewHostSession({
          sandboxId: matchedSession.sandboxId,
        });
        if (!destroyed.ok) {
          return NextResponse.json(
            {
              ok: false,
              reason: "destroy_failed",
              message: destroyed.message,
              tier2Provider: "preview_host",
            } satisfies SandboxDestroyApiJson,
            { status: destroyed.retryable ? 502 : 400 },
          );
        }
        destroyedOnProvider = destroyed.destroyed;
      }

      if (matchedSession) {
        await clearSandboxSessionAsync(chatId);
      }

      const updated = await updateVersionSandboxUrl(requestedVersion.version.id, null);
      if (!updated) {
        return NextResponse.json(
          {
            ok: false,
            reason: "update_failed",
            message: "Failed to clear stored sandboxUrl for version.",
          } satisfies SandboxDestroyApiJson,
          { status: 500 },
        );
      }

      const response: SandboxDestroyApiJson = {
        ok: true,
        destroyed: destroyedOnProvider,
        clearedSandboxUrl: true,
        tier2Provider: matchedSession?.tier2Provider ?? null,
        ...(matchedSession ? {} : { reason: "no_matching_session" }),
      };
      return NextResponse.json(response);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          reason: "unknown",
          message: err instanceof Error ? err.message : "Unknown error",
        } satisfies SandboxDestroyApiJson,
        { status: 500 },
      );
    }
  });
}
