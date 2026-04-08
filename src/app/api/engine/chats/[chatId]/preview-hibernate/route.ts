import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";
import { hibernatePreviewHostSession } from "@/lib/gen/preview/preview-host-client";
import { isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";
import type { PreviewHibernateApiJson } from "@/lib/gen/preview/preview-contract";

const bodySchema = z.object({
  versionId: z.string().min(1),
  previewSessionId: z.string().min(1).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "preview-session:hibernate", async () => {
    try {
      const { chatId } = await ctx.params;
      if (!isTier2PreviewConfigured()) {
        return NextResponse.json(
          {
            ok: false,
            reason: "preview_session_not_configured",
            message: "Tier-2 preview is not configured on this deployment.",
          } satisfies PreviewHibernateApiJson,
          { status: 503 },
        );
      }
      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json(
          { ok: false, reason: "not_found", message: "Chat not found." } satisfies PreviewHibernateApiJson,
          { status: 404 },
        );
      }

      const raw = await req.json().catch(() => ({}));
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, reason: "invalid_body", message: "Invalid request body." } satisfies PreviewHibernateApiJson,
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
          { ok: false, reason: "version_not_found", message: "Version not found for chat." } satisfies PreviewHibernateApiJson,
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

      if (!matchedSession) {
        return NextResponse.json(
          { ok: false, reason: "no_matching_session", message: "No active preview session matched the request." } satisfies PreviewHibernateApiJson,
          { status: 404 },
        );
      }

      const hibernated = await hibernatePreviewHostSession({
        sandboxId: matchedSession.sandboxId,
      });
      if (!hibernated.ok) {
        return NextResponse.json(
          {
            ok: false,
            reason: "hibernate_failed",
            message: hibernated.message,
          } satisfies PreviewHibernateApiJson,
          { status: hibernated.retryable ? 502 : 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        hibernated: hibernated.hibernated,
      } satisfies PreviewHibernateApiJson);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          reason: "unknown",
          message: err instanceof Error ? err.message : "Unknown error",
        } satisfies PreviewHibernateApiJson,
        { status: 500 },
      );
    }
  });
}
