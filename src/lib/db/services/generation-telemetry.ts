import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { generationTelemetry } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

export type CreateTelemetryRecord = {
  chatId: string;
  versionId?: string | null;
  scaffoldId?: string | null;
  scaffoldAlternatives?: string[] | null;
  scaffoldSelectionMethod?: string | null;
  scaffoldSelectionConfidence?: string | null;
  briefInfluencedSelection?: boolean;
  model: string;
  modelTier?: string | null;
  buildIntent?: string | null;
  buildMethod?: string | null;
  promptClassification?: string | null;
  retryCount?: number;
  autofixApplied?: boolean;
  syntaxFixerUsed?: boolean;
  preflightErrorCount?: number;
  preflightWarningCount?: number;
  seoIssueCount?: number;
  previewSuccess?: boolean | null;
  previewBlockingReason?: string | null;
  qualityGateResult?: string | null;
  durationMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  fileCount?: number | null;
  scaffoldRetryUsed?: boolean;
  scaffoldRetrySuggested?: string | null;
  meta?: Record<string, unknown> | null;
};

export type UpdateTelemetryRecord = Partial<
  Omit<CreateTelemetryRecord, "chatId" | "model"> & {
    deployResult?: string | null;
    userFeedback?: string | null;
  }
>;

export async function createGenerationTelemetryRecord(record: CreateTelemetryRecord) {
  assertDbConfigured();
  const id = nanoid();
  const rows = await db
    .insert(generationTelemetry)
    .values({
      id,
      chatId: record.chatId,
      versionId: record.versionId ?? null,
      scaffoldId: record.scaffoldId ?? null,
      scaffoldAlternatives: record.scaffoldAlternatives ?? null,
      scaffoldSelectionMethod: record.scaffoldSelectionMethod ?? null,
      scaffoldSelectionConfidence: record.scaffoldSelectionConfidence ?? null,
      briefInfluencedSelection: record.briefInfluencedSelection ?? false,
      model: record.model,
      modelTier: record.modelTier ?? null,
      buildIntent: record.buildIntent ?? null,
      buildMethod: record.buildMethod ?? null,
      promptClassification: record.promptClassification ?? null,
      retryCount: record.retryCount ?? 0,
      autofixApplied: record.autofixApplied ?? false,
      syntaxFixerUsed: record.syntaxFixerUsed ?? false,
      preflightErrorCount: record.preflightErrorCount ?? 0,
      preflightWarningCount: record.preflightWarningCount ?? 0,
      seoIssueCount: record.seoIssueCount ?? 0,
      previewSuccess: record.previewSuccess ?? null,
      previewBlockingReason: record.previewBlockingReason ?? null,
      qualityGateResult: record.qualityGateResult ?? null,
      durationMs: record.durationMs ?? null,
      promptTokens: record.promptTokens ?? null,
      completionTokens: record.completionTokens ?? null,
      fileCount: record.fileCount ?? null,
      scaffoldRetryUsed: record.scaffoldRetryUsed ?? false,
      scaffoldRetrySuggested: record.scaffoldRetrySuggested ?? null,
      meta: record.meta ?? null,
    })
    .returning();
  return rows[0];
}

export async function updateTelemetryRecord(
  id: string,
  updates: UpdateTelemetryRecord,
) {
  assertDbConfigured();
  const rows = await db
    .update(generationTelemetry)
    .set(updates)
    .where(eq(generationTelemetry.id, id))
    .returning();
  return rows[0];
}

/**
 * Fas 0 telemetri-hygien: stamp the deploy outcome onto the latest telemetry
 * row for a version. Mirrors the `feedback/route.ts` pattern
 * (`getTelemetryForVersion` → `updateTelemetryRecord`).
 *
 * Best-effort by contract: a deploy must never fail because telemetry could
 * not be written, so this swallows all errors and no-ops when the version has
 * no telemetry row (e.g. eval/synthetic versions). Takes the newest row for
 * the version — same "latest wins" semantics as the user-feedback writer.
 *
 * `result` is a short outcome tag, e.g. `"production:ready"` / `"preview:queued"`
 * / `"error"` — queried by `scripts/db/control-stats.mjs`.
 */
export async function recordDeployResultForVersion(
  versionId: string,
  result: string,
): Promise<void> {
  try {
    if (!versionId) return;
    const rows = await getTelemetryForVersion(versionId);
    const latest = rows[0];
    if (!latest) return;
    await updateTelemetryRecord(latest.id, { deployResult: result });
  } catch (err) {
    console.warn("[telemetry] Failed to record deploy result:", err);
  }
}

/**
 * M#pv1 (honest `preview_success`): stamp the confirmed preview RUNTIME outcome
 * onto the version's latest telemetry row. Mirrors `recordDeployResultForVersion`.
 *
 * `preview_success` is a tri-state the readers already assume (see
 * `scaffold-scoring.ts` SAJ-49, `scripts/db/scaffold-scores.mjs`,
 * backoffice `_preview_label`):
 *   - `true`  = runtime confirmed responding (preview-host `/status running:true`,
 *               i.e. the resume-verified path) OR — via this stamp — a real
 *               runtime-ready receipt.
 *   - `false` = the preview will not / did not produce a working runtime
 *               (preview blocked, or the session start failed).
 *   - `null`  = pending / unconfirmed (fresh boot queued, or no preview attempt).
 *
 * The finalize writer (`persist-telemetry.ts`) no longer claims `true` from a
 * pre-preview preflight signal; it writes the honest pending/blocked value and
 * this stamp records the confirmed outcome once the preview attempt resolves.
 *
 * Best-effort by contract: a generation must never fail because telemetry could
 * not be written, so this swallows all errors and no-ops when the version has no
 * telemetry row. Takes the newest row (same "latest wins" semantics as the
 * deploy/feedback writers).
 */
export async function recordPreviewRuntimeOutcomeForVersion(
  versionId: string,
  previewSuccess: boolean,
): Promise<void> {
  try {
    if (!versionId) return;
    const rows = await getTelemetryForVersion(versionId);
    const latest = rows[0];
    if (!latest) return;
    await updateTelemetryRecord(latest.id, { previewSuccess });
  } catch (err) {
    console.warn("[telemetry] Failed to record preview runtime outcome:", err);
  }
}

export async function getTelemetryForVersion(versionId: string) {
  assertDbConfigured();
  return db
    .select()
    .from(generationTelemetry)
    .where(eq(generationTelemetry.versionId, versionId))
    .orderBy(desc(generationTelemetry.createdAt));
}

/**
 * Latest `qualityGateResult` recorded for a version (newest telemetry row
 * wins, so a corrected repair pass supersedes an earlier failing pass).
 *
 * Returns `null` when no telemetry row exists for the version. Used by the
 * promotion invariant guard (`assertPromoteAllowed`) to refuse `promoted`
 * for rows the finalize verifier rejected.
 */
export async function getLatestQualityGateResultForVersion(
  versionId: string,
): Promise<string | null> {
  const rows = await getTelemetryForVersion(versionId);
  return rows[0]?.qualityGateResult ?? null;
}

/**
 * Stamp a fresh `preflight_passed` quality-gate signal after a server repair
 * passed its own quality gate.
 *
 * `saveRepairedFiles` is the only writer of `engineVersions.repaired_files_json`
 * and only runs once `shouldPromoteAfterRepair` approved the repaired files, so
 * the repaired content is verified-clean even though the *original* finalize
 * telemetry row may still read `verifier_failed`/`preflight_failed`. Recording
 * the pass keeps `getLatestQualityGateResultForVersion` (and therefore the
 * promotion guard `assertPromoteAllowed`) aligned with the *current* files —
 * otherwise a legitimately-repaired row would be wedged on a stale finalize
 * signal it has already superseded.
 *
 * Best-effort: inherits `chatId`/`model` from the version's latest telemetry
 * row so model/cost analytics stay coherent. If no prior telemetry exists the
 * guard already fails open, so we simply skip. Never throws.
 */
export async function recordRepairPassedQualityGate(
  versionId: string,
): Promise<void> {
  try {
    const rows = await getTelemetryForVersion(versionId);
    const prior = rows[0];
    if (!prior) return;
    if (prior.qualityGateResult === "preflight_passed") return;
    await createGenerationTelemetryRecord({
      chatId: prior.chatId,
      versionId,
      model: prior.model,
      qualityGateResult: "preflight_passed",
      meta: { source: "server-repair-pass" },
    });
  } catch (err) {
    console.warn("[telemetry] Failed to stamp repair-passed quality gate:", err);
  }
}
