import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit";
import { runWithLlmUsageContext, safeUsageOwnerId, setLlmUsageContext } from "@/lib/observability/llm-usage";
import { getEngineVersionForChatByIdForRequest, getRequestUserId } from "@/lib/tenant";
import { acquireVersionLease, releaseVersionLease } from "@/lib/db/chat-repository-pg";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import { runVersionQualityGateUnderLease } from "@/lib/gen/verify/server-verify/verify-run";
import { DESIGN_PREVIEW_QUALITY_GATE_CHECKS, QUALITY_GATE_CHECK_VALUES } from "@/lib/gen/verify/quality-gate-checks";

export const runtime = "nodejs";
export const maxDuration = 950;
const requestSchema = z.object({
  versionId: z.string().min(1),
  /**
   * Explicit canonical gate selection for deterministic F3 release checks.
   * `integrationsBuild` is accepted only for a tenant-scoped integrations row
   * and re-runs the shared F3 readiness/Product Postcheck gate before verify.
   */
  gate: z.enum(["designPreview", "integrationsBuild"]).optional(),
  // Default to the canonical F2 design-preview lane (`DESIGN_PREVIEW_QUALITY_GATE_CHECKS`)
  // so that if `manifest.json` `qualityGateTiers.designPreview` is widened
  // (e.g. to add `lint`), the route default tracks it instead of silently
  // staying on a hardcoded `["typecheck"]`.
  checks: z
    .array(z.enum(QUALITY_GATE_CHECK_VALUES))
    .min(1, "At least one quality gate check is required.")
    .optional()
    .default([...DESIGN_PREVIEW_QUALITY_GATE_CHECKS]),
});


export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  // Quality-gaten är VM-baserad och gör inga LLM-anrop. Kontexten behåller
  // ändå versionsägarskapet för observability och framtida deterministiska
  // verifiersteg; en separat /repair-request äger eventuell betald RepairGate.
  return withRateLimit(req, "engine:quality-gate", () =>
    runWithLlmUsageContext({}, () => handlePOST(req, ctx)),
  );
}

async function handlePOST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { versionId, gate } = validation.data;
    const usageOwnerId = await safeUsageOwnerId(() => getRequestUserId(req));
    setLlmUsageContext({
      chatId,
      versionId,
      // Behåll explicit ägare även om dagens quality-gate är helt deterministisk.
      userId: usageOwnerId,
    });
    if (!usageOwnerId || usageOwnerId.startsWith("guest:")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Skapa ett konto eller logga in för att fortsätta bygga. Kontot får en kostnadsfri första generering.",
          requiresAuth: true,
        },
        { status: 401 },
      );
    }

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const internalVersionId = scopedVersion.version.id;

    let lease;
    try {
      lease = await acquireVersionLease(internalVersionId, "server_verify");
    } catch {
      return NextResponse.json({ error: "Version lease unavailable (database error). Try again shortly.", code: "lease_unavailable", retryable: true }, { status: 503 });
    }
    if (!lease) return NextResponse.json({ error: "Version is busy (another verify/repair job holds the lock). Try again shortly.", code: "version_busy" }, { status: 409 });
    try {
      const snapshot = await getVersionFilesSnapshot(internalVersionId);
      if (!snapshot?.files.length) return NextResponse.json({ error: "No files found for version" }, { status: 404 });
      const result = await runVersionQualityGateUnderLease({ chatId, versionId: internalVersionId,
        holderRunId: lease.runId, snapshot, gate });
      return NextResponse.json(result.body, { status: result.status });
    } catch {
      return NextResponse.json({ error: "Quality gate pre-checks failed before verification started. Try again shortly.", code: "quality_gate_unavailable", retryable: true }, { status: 503 });
    } finally {
      await releaseVersionLease(internalVersionId, lease.runId).catch(() => {});
    }
  } catch (err) {
    console.error("[quality-gate] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Quality gate failed" }, { status: 500 });
  }
}
