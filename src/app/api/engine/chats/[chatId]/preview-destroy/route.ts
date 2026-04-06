import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { updateVersionPreviewUrl } from "@/lib/db/chat-repository-pg";
import {
  clearPreviewSessionAsync,
  getActivePreviewSessionAsync,
} from "@/lib/gen/preview/session-store";
import { destroyPreviewHostSession } from "@/lib/gen/preview/preview-host-client";
import type { PreviewDestroyApiJson } from "@/lib/gen/preview/preview-contract";

const bodySchema = z.object({
  versionId: z.string().min(1),
  previewSessionId: z.string().min(1).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "preview-session:destroy", async () => {
    try {
      const { chatId } = await ctx.params;
      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json(
          { ok: false, reason: "not_found", message: "Chat not found." } satisfies PreviewDestroyApiJson,
          { status: 404 },
        );
      }

      const raw = await req.json().catch(() => ({}));
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, reason: "invalid_body", message: "Invalid request body." } satisfies PreviewDestroyApiJson,
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
          { ok: false, reason: "version_not_found", message: "Version not found for chat." } satisfies PreviewDestroyApiJson,
          { status: 404 },
        );
      }

      const session = await getActivePreviewSessionAsync(chatId);
      const requestedPreviewSessionId = parsed.data.previewSessionId?.trim() || null;
      const matchedSession =
        session &&
        session.versionId === requestedVersion.version.id &&
        (!requestedPreviewSessionId || session.sandboxId === requestedPreviewSessionId)
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
            } satisfies PreviewDestroyApiJson,
            { status: destroyed.retryable ? 502 : 400 },
          );
        }
        destroyedOnProvider = destroyed.destroyed;
      }

      if (matchedSession) {
        await clearPreviewSessionAsync(chatId);
      }

      const updated = await updateVersionPreviewUrl(requestedVersion.version.id, null);
      if (!updated) {
        return NextResponse.json(
          {
            ok: false,
            reason: "update_failed",
            message: "Failed to clear stored previewUrl for version.",
          } satisfies PreviewDestroyApiJson,
          { status: 500 },
        );
      }

      const response: PreviewDestroyApiJson = {
        ok: true,
        destroyed: destroyedOnProvider,
        clearedPreviewUrl: true,
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
        } satisfies PreviewDestroyApiJson,
        { status: 500 },
      );
    }
  });
}
