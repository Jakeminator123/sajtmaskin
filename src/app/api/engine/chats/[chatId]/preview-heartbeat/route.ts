import { after, NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  getActivePreviewSessionAsync,
  touchPreviewSessionAsync,
} from "@/lib/gen/preview/session-store";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";
import { tryResumeTier2Runtime } from "@/lib/gen/preview/tier2-resume";
import {
  fetchPreviewHostReadinessVerdict,
} from "@/lib/gen/preview/preview-host-client";
import { shouldVerifyPreviewRuntimeReceipt } from "@/lib/db/services/generation-telemetry";
import { applyPreviewReadinessOutcome } from "@/lib/gen/preview/readiness-stamp";
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

      // M#pv1 (PR #377 runda 3): the heartbeat is the receipt point that
      // provably fires on EVERY normal successful boot — the client
      // heartbeats every ~25s while the tier-2 iframe is live
      // (`usePreviewHeartbeat`), whereas `/preview-status` only fires on the
      // suspect/recovery path. The heartbeat alone only proves "client sees an
      // iframe", so before stamping we verify the actual runtime receipt with
      // ONE host `/status` call (`running:true`, host re-checks versionId) —
      // the same canonical receipt as the preview-status path. Version binding
      // is exact: the session↔versionId equality check above already returned
      // `session_mismatch` otherwise. One-shot per version per instance: the
      // writer's confirmed-cache gates BOTH the host call and the DB write, so
      // steady-state heartbeats add no host or DB traffic. Scheduled via
      // `after()` so the stamp never delays the heartbeat response;
      // best-effort + monotonic + atomic inside the writer.
      //
      // The confirmed-check moved INSIDE `after()` because it is revision-scoped
      // with the content-revision gate on (a same-version rewrite must be
      // re-verified — the cache half of M#pv4) and therefore async. The request
      // path stays DB-free either way, and the gate still prevents both the host
      // call and the DB write.
      after(async () => {
        try {
          const shouldVerify = session.filesRevision
            ? await shouldVerifyPreviewRuntimeReceipt(versionId, {
                bootedFilesRevision: session.filesRevision,
              })
            : await shouldVerifyPreviewRuntimeReceipt(versionId);
          if (!shouldVerify) return;
          const resumed = await tryResumeTier2Runtime(session);
          // Readiness ≠ liveness (req A5): only stamp `preview_success` from the
          // host `readinessState` verdict (ready → true, failed → false + log a
          // build-error row for RepairGate, starting → no stamp). Version
          // binding is exact — the session↔versionId equality check above
          // already returned `session_mismatch` otherwise.
          if (resumed) {
            await applyPreviewReadinessOutcome({
              chatId,
              versionId,
              bootedFilesRevision: session.filesRevision,
              resumed,
            });
            return;
          }
          // `null` also covers "the process never started" — where the host
          // still holds a `failed` readiness verdict. Without this the only
          // surface that ever stamps that failure is a /preview-status poll
          // the builder may not make. Same version binding as above.
          const verdict = await fetchPreviewHostReadinessVerdict(session.previewSessionId, {
            expectedVersionId: versionId,
          });
          if (verdict?.readinessState === "failed") {
            await applyPreviewReadinessOutcome({
              chatId,
              versionId,
              bootedFilesRevision: session.filesRevision,
              resumed: verdict,
            });
          }
        } catch {
          // Best-effort: a failed receipt check must never surface —
          // the next heartbeat retries.
        }
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
