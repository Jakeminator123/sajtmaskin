import type { BuildSpecPreviewPolicy, BuildSpecVerificationPolicy } from "@/lib/gen/build-spec";
import type { Version } from "@/lib/db/chat-repository-pg";
import { updateVersionPreviewUrl } from "@/lib/db/chat-repository-pg";
import { canExposeEnginePreview, type EngineVersionLifecycleLike } from "@/lib/db/engine-version-lifecycle";
import { recordPreviewRuntimeOutcomeForVersion } from "@/lib/db/services/generation-telemetry";
import { getVersionFilesSnapshot, parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { startPreviewSession, type PreviewSessionResult, type PreviewSessionError } from "./preview-session";
import { getActivePreviewSessionAsync } from "./session-store";
import { isTier2LivePreviewUrl } from "./preview-url-classifier";
import { logPreviewLifecycleTelemetry } from "./lifecycle-telemetry";
import { devLogAppend } from "@/lib/logging/dev-log";
import { incIngressEvent } from "@/lib/observability/metrics";

type ChainFence =
  | { holderRunId: string; expectedFilesRevision: string }
  | { holderRunId?: undefined; expectedFilesRevision?: undefined };

export type EnsureVersionPreviewInput = {
  /** Trusted tenant-scoped rows; no loose orchestration metadata is interpreted here. */
  chat: Readonly<{ id: string; project_id: string | null }>;
  version: Readonly<EngineVersionLifecycleLike & Pick<Version,
    "id" | "preview_url" | "files_json" | "files_revision" | "selected_dossier_env_keys">>;
  policy: Readonly<{
    previewPolicy: BuildSpecPreviewPolicy | null;
    verificationPolicy: BuildSpecVerificationPolicy | null;
  }>;
  forceRestart: boolean;
} & ChainFence;

export type VersionPreviewReceipt = Omit<PreviewSessionResult, "startOutcome"> & {
  versionId: string;
  startOutcome: PreviewSessionResult["startOutcome"] | "reused_url";
  bookkeepingRequired: boolean;
};

export type EnsureVersionPreviewOutcome =
  | { ok: true; result: VersionPreviewReceipt }
  | { ok: false; reason: "preview_blocked" | "no_files" | "version_changed" }
  | { ok: false; reason: "start_failed"; error: PreviewSessionError };

/** Shared bootstrap/resync orchestration. Never schedules work or takes a lease. */
export async function ensureVersionPreview(
  input: EnsureVersionPreviewInput,
): Promise<EnsureVersionPreviewOutcome> {
  const { chat, version, policy, forceRestart } = input;
  const strict = input.holderRunId !== undefined;
  const revision = version.files_revision?.trim() || null;
  if (strict && (!input.holderRunId?.trim() || !input.expectedFilesRevision?.trim() ||
      revision !== input.expectedFilesRevision)) {
    return { ok: false, reason: "version_changed" };
  }
  if (!forceRestart && !canExposeEnginePreview(version)) {
    return { ok: false, reason: "preview_blocked" };
  }
  const previewUrl = version.preview_url?.trim();
  if (!forceRestart && previewUrl && isTier2LivePreviewUrl(previewUrl)) {
    const active = await getActivePreviewSessionAsync(chat.id);
    if (active?.versionId === version.id && active.previewUrl === previewUrl &&
        active.previewSessionId && (!revision || active.filesRevision === revision)) {
      try { incIngressEvent("preview_reused_url"); } catch {}
      try {
        devLogAppend("latest", { type: "preview.reused-url", chatId: chat.id,
          versionId: version.id, previewUrl: previewUrl.slice(0, 60) });
      } catch {}
      return { ok: true, result: {
        versionId: version.id, previewUrl, previewSessionId: active.previewSessionId,
        lifecycleToken: active.lifecycleToken ?? null, filesRevision: revision ?? active.filesRevision ?? null,
        previewMode: "dev_only", fidelityTier: 2, startOutcome: "reused_url",
        runtimeReady: false, bookkeepingRequired: false,
      } };
    }
  }
  const snapshot = await getVersionFilesSnapshot(version.id);
  // Known revision must describe the SAME files that are sent to the host.
  if (revision && snapshot?.filesRevision !== revision) {
    return { ok: false, reason: "version_changed" };
  }
  let files = snapshot?.files ?? [];
  // Compatibility for older HTTP rows only; a chain cannot substitute stale files.
  if (!strict && !files.length && version.files_json?.trim()) {
    files = parseCodeFilesFromFilesJson(version.files_json) ?? [];
  }
  if (!files.length) return { ok: false, reason: "no_files" };
  const started = await startPreviewSession(files.map((file) => ({ ...file })), {
    chatId: chat.id,
    appProjectId: chat.project_id?.trim() || null,
    forceRestart,
    previewPolicy: policy.previewPolicy,
    verificationPolicy: policy.verificationPolicy,
    versionIdForSession: version.id,
    filesRevisionForSession: revision,
    lifecycleStage: version.lifecycle_stage === "integrations" ? "integrations" : "design",
    selectedDossierEnvKeys: version.selected_dossier_env_keys?.length
      ? [...version.selected_dossier_env_keys] : undefined,
    skipRepair: true,
    skipProjectScaffold: true,
  });
  if (!started.ok) return { ok: false, reason: "start_failed", error: started.error };
  const result = started.result;
  if ((strict && result.filesRevision !== input.expectedFilesRevision) ||
      (revision && result.filesRevision && result.filesRevision !== revision)) {
    return { ok: false, reason: "version_changed" };
  }
  logPreviewLifecycleTelemetry({
    kind: "preview_start_outcome", chatId: chat.id, versionId: version.id,
    outcome: result.startOutcome, tier2Provider: result.tier2Meta?.tier2Provider,
  });
  return { ok: true, result: { ...result, versionId: version.id,
    // Only HTTP compatibility may use its known snapshot when an old host omits revision.
    filesRevision: strict ? result.filesRevision : result.filesRevision ?? revision,
    bookkeepingRequired: true,
  } };
}

/** HTTP schedules this with after(); the server chain awaits this SAME function. */
export async function persistVersionPreviewOutcome(
  input: { receipt: Readonly<VersionPreviewReceipt> } & ChainFence,
): Promise<boolean> {
  const { receipt } = input;
  const strict = input.holderRunId !== undefined;
  if (strict && (!input.holderRunId?.trim() || !input.expectedFilesRevision?.trim() ||
      receipt.filesRevision !== input.expectedFilesRevision)) return false;
  if (!receipt.bookkeepingRequired && !strict) return true;
  if (!receipt.previewUrl.trim()) return false;
  const persisted = await updateVersionPreviewUrl(receipt.versionId, receipt.previewUrl, {
    lockTimeoutMs: 2000, maxRetries: 3, retryDelayMs: 300,
    ...(receipt.filesRevision ? { expectedFilesRevision: receipt.filesRevision } : {}),
    ...(strict ? { holderRunId: input.holderRunId } : {}),
  });
  if (!persisted) {
    console.warn(`[preview-session] previewUrl persist skipped for ${receipt.versionId}`);
    if (strict) return false;
  }
  if (receipt.runtimeReady) {
    await recordPreviewRuntimeOutcomeForVersion(receipt.versionId, true,
      receipt.filesRevision ? { bootedFilesRevision: receipt.filesRevision } : undefined);
  }
  return persisted;
}
