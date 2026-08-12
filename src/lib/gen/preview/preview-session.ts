import type { CodeFile } from "../parser";
import type {
  BuildSpecPreviewPolicy,
  BuildSpecVerificationPolicy,
} from "../build-spec";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import {
  buildPreviewEnvLocalContents,
  isPipelineAuthoredEnvLocal,
  type PreviewLifecycleStage,
} from "@/lib/gen/preview/env-local";
import {
  destroyPreviewHostSession,
  fetchPreviewHostFilesManifest,
  patchPreviewHostSession,
  startPreviewHostSession,
  updatePreviewHostSession,
  type PreviewHostPatchMode,
} from "@/lib/gen/preview/preview-host-client";
import { planPreviewPatch } from "@/lib/gen/preview/preview-patch-plan";
import {
  clearPreviewSessionAsync,
  getActivePreviewSessionAsync,
  touchPreviewSessionAsync,
} from "@/lib/gen/preview/session-store";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import { tryResumeTier2Runtime } from "@/lib/gen/preview/tier2-resume";
import { buildCompleteProject } from "../export/project-scaffold";
import { PLACEHOLDER_API_ROUTE } from "../export/project-scaffold";
import { collectRequiredUiComponents } from "../export/project-scaffold-ui-reader";
import { repairGeneratedFiles } from "../autofix/repair-generated-files";
import { applyPreviewOnlyRulesToFiles } from "./preview-only-files";

type RuntimeFile = {
  name: string;
  content: string;
};

type PreviewSessionMode = "dev_only";

export type PreviewSessionTier2Meta = {
  tier2Provider: "preview_host";
};

export interface PreviewSessionResult {
  previewUrl: string;
  previewSessionId: string;
  previewMode: PreviewSessionMode;
  /** Tier-2 live preview only. */
  fidelityTier: 2;
  prodBuildVerified?: boolean;
  prodBuildLogSnippet?: string;
  /** Session reused vs fresh boot. HTTP route-level `reused_url` is handled before this layer. */
  startOutcome: "resumed" | "recreated";
  /**
   * True only when the preview RUNTIME was confirmed responding (preview-host
   * `/status` reported `running: true` for this version — the resume path
   * verifies this via {@link tryResumeTier2Runtime}). `false` for a
   * freshly-created / file-swapped session where the host has only *queued* the
   * boot and returned `201` before `npm run dev` is serving (preview-host
   * `/preview/session/start` + `/update` return before the runtime is up).
   *
   * This is the honest runtime-ready receipt behind `generation_telemetry`
   * `preview_success` (M#pv1): session-created ≠ runtime-survived. A `false`
   * here means "not yet confirmed ready" (pending), NOT "failed".
   */
  runtimeReady: boolean;
  /** DB revision of the exact file set pinned to this preview session. */
  filesRevision: string | null;
  /** Telemetry / UI hints for the tier-2 provider. */
  tier2Meta?: PreviewSessionTier2Meta;
}

export type PreviewSessionFailureCode = never;

export interface PreviewSessionError {
  stage: "repair" | "preview-start";
  message: string;
  /** Stable classifier for HTTP mapping — prefer over `message` substring checks. */
  failureCode?: PreviewSessionFailureCode;
  raw?: string;
}

type StartPreviewSessionOutcome =
  | { ok: true; result: PreviewSessionResult }
  | { ok: false; error: PreviewSessionError };

/** Own-engine stream + `/preview-session` bootstrap can call `startPreviewSession` at the same time for the same chat+version — share one in-flight promise so we do not spawn two Fly preview sessions. */
const inflightPreviewSessionByChatVersion = new Map<string, Promise<StartPreviewSessionOutcome>>();

/**
 * Best-effort destroy + clear: read the existing session, fire-and-forget
 * the host destroy so the Fly preview-session is released, then clear the local +
 * Redis pointer.
 *
 * The previous behaviour only cleared the local pointer, leaving the host
   * preview session running until idle TTL fired or `/admin/cleanup` reaped it. That
 * was the root cause of the disk-full retries we keep seeing in
 * `triggerPreviewHostCleanup`. Errors from the host are swallowed because
 * the local pointer must always be cleared even if the host call fails —
 * the alternative is a zombie entry the user cannot recover from.
 */
async function destroyAndClearPreviewSession(chatId: string): Promise<void> {
  try {
    const existing = await getActivePreviewSessionAsync(chatId);
    if (existing?.previewSessionId) {
      destroyPreviewHostSession({ previewSessionId: existing.previewSessionId })
        .then((res) => {
          if (!res.ok) {
            console.warn(
              `[preview-session] best-effort destroy for ${chatId}/${existing.previewSessionId} failed: ${res.message}`,
            );
          }
        })
        .catch((err) => {
          console.warn(
            "[preview-session] best-effort destroy threw:",
            err instanceof Error ? err.message : err,
          );
        });
    }
  } catch (err) {
    console.warn(
      "[preview-session] best-effort destroy lookup threw:",
      err instanceof Error ? err.message : err,
    );
  }
  await clearPreviewSessionAsync(chatId);
}

/**
 * Fast Edit Lane flag. When off (default) callers must fall back to the normal
 * generation/update flow. Kept as a plain env read so both the Next app and any
 * background workers see the same gate.
 */
export function isPreviewPatchLaneEnabled(): boolean {
  return (process.env.SAJTMASKIN_PREVIEW_PATCH_LANE ?? "").trim() === "true";
}

export type TryPatchPreviewSessionResult =
  | {
      ok: true;
      previewUrl: string;
      previewSessionId: string;
      patchMode: PreviewHostPatchMode;
    }
  | {
      ok: false;
      reason: "disabled" | "no_session" | "session_missing" | "host_error" | "base_mismatch";
      message?: string;
    };

/**
 * Fast Edit Lane: push only the changed files to the chat's live preview-host
 * session without a full generation/update. Returns `disabled` when the flag is
 * off and `no_session`/`session_missing` when there is nothing live to patch —
 * the caller is expected to fall back to `startPreviewSession` in those cases.
 *
 * `changedFiles` are exact `path -> content` entries (already repaired/scaffold
 * paths as stored in the version). No LLM, no scaffold rebuild.
 */
export async function tryPatchPreviewSession(params: {
  chatId: string;
  versionId: string;
  filesRevision?: string | null;
  changedFiles: Record<string, string>;
  removedPaths?: string[];
  /**
   * The version the `changedFiles` were derived from. A partial patch is only
   * correct when the live preview session is currently serving this exact base;
   * if the stored session points at a different version we bail to `base_mismatch`
   * so the caller does a full (re)start instead of merging files into the wrong
   * workspace (which would yield a hybrid file set + a preview URL for it).
   */
  expectedBaseVersionId?: string;
}): Promise<TryPatchPreviewSessionResult> {
  if (!isPreviewPatchLaneEnabled()) {
    return { ok: false, reason: "disabled" };
  }
  const chatId = params.chatId.trim();
  const versionId = params.versionId.trim();
  if (!chatId || !versionId) {
    return { ok: false, reason: "no_session" };
  }
  const sess = await getActivePreviewSessionAsync(chatId);
  if (!sess?.previewSessionId) {
    return { ok: false, reason: "no_session" };
  }
  // STRICT: the stored pointer must BE the expected base, not merely "not a
  // different one". A session without a version is unknown ground, and merging
  // a partial diff into unknown ground is the hybrid-file-set bug — so it bails
  // to a full (re)start just like a real mismatch. The host re-checks the same
  // rule under its store lock and answers 409.
  const expectedBase = params.expectedBaseVersionId?.trim();
  if (expectedBase && sess.versionId?.trim() !== expectedBase) {
    return { ok: false, reason: "base_mismatch" };
  }
  const patched = await patchPreviewHostSession({
    previewSessionId: sess.previewSessionId,
    versionId,
    files: params.changedFiles,
    removedPaths: params.removedPaths,
    // Re-checked under the host store lock so a session that advances between
    // the optimistic precheck above and the host write is refused (TOCTOU close).
    expectedBaseVersionId: expectedBase,
  });
  if (patched.ok) {
    await touchPreviewSessionAsync({
      chatId,
      previewSessionId: patched.previewSessionId,
      previewUrl: patched.previewUrl,
      versionId,
      filesRevision: params.filesRevision,
      tier2Provider: "preview_host",
    });
    return {
      ok: true,
      previewUrl: patched.previewUrl,
      previewSessionId: patched.previewSessionId,
      patchMode: patched.patchMode,
    };
  }
  if ("sessionMissing" in patched && patched.sessionMissing === true) {
    return { ok: false, reason: "session_missing", message: patched.message };
  }
  if ("baseMismatch" in patched && patched.baseMismatch === true) {
    return { ok: false, reason: "base_mismatch", message: patched.message };
  }
  return { ok: false, reason: "host_error", message: patched.message };
}

/**
 * Fast Edit Lane for a FOLLOW-UP generation (new versionId on a live session).
 *
 * The full `/update` path replaces every file and makes preview-host restart
 * Next dev, so each follow-up pays a boot + first compile even when only page
 * content changed. When the host can tell us exactly what it is holding, the
 * same change can be pushed as a partial `/preview/session/patch` that writes
 * only the changed paths into the live workspace.
 *
 * Strictly an optimisation with a single fallback: return `null` and the caller
 * runs the untouched `/update` path, i.e. today's behaviour. It is only taken
 * when all of these hold:
 *
 * 1. the patch lane flag is on,
 * 2. the host still serves the exact base version our session pointer claims
 *    (`files-manifest` reports `versionId` + `running`),
 * 3. the diff has no structural/dependency path and is small enough
 *    ({@link planPreviewPatch}),
 * 4. the host accepts the patch under its own base-version lock and echoes the
 *    NEW versionId back, so `/status` and resume stay correct.
 *
 * `updatePayload` must be the exact payload `/update` would have sent — the
 * patch is a strict subset of it, so a patched VM ends up with the same files.
 */
async function tryFollowUpPatchLane(params: {
  chatId: string;
  previewSessionId: string;
  /** Version the live session is pinned to (the base we diff against). */
  baseVersionId: string | null;
  versionId: string;
  filesRevision: string | null;
  updatePayload: Record<string, string>;
  previewMode: PreviewSessionMode;
}): Promise<PreviewSessionResult | null> {
  const startedAt = Date.now();
  const fallBackToUpdate = (reason: string, detail?: string): null => {
    logPreviewLifecycleTelemetry({
      kind: "preview_followup_lane",
      chatId: params.chatId,
      versionId: params.versionId,
      baseVersionId: params.baseVersionId,
      lane: "update",
      reason,
      ...(detail ? { detail } : {}),
      durationMs: Math.max(0, Date.now() - startedAt),
    });
    return null;
  };

  if (!isPreviewPatchLaneEnabled()) return fallBackToUpdate("patch_lane_disabled");
  if (!params.baseVersionId) return fallBackToUpdate("unknown_base_version");

  const manifest = await fetchPreviewHostFilesManifest(params.previewSessionId);
  // No manifest = older host without the route, an unusable session, or a
  // network blip. All of them mean "we do not know what is live" -> update.
  if (!manifest) return fallBackToUpdate("manifest_unavailable");
  if (!manifest.running) return fallBackToUpdate("runtime_not_running");
  if (manifest.versionId !== params.baseVersionId) {
    return fallBackToUpdate("host_version_mismatch", `host=${manifest.versionId ?? "none"}`);
  }

  const plan = planPreviewPatch({
    hostFileHashes: manifest.files,
    nextFiles: params.updatePayload,
  });
  if (!plan.ok) return fallBackToUpdate(plan.reason);

  const patched = await patchPreviewHostSession({
    previewSessionId: params.previewSessionId,
    versionId: params.versionId,
    files: plan.changedFiles,
    ...(plan.removedPaths.length > 0 ? { removedPaths: plan.removedPaths } : {}),
    // Re-checked under the host store lock: a session that advanced between the
    // manifest read and the write is refused (409) instead of merging our diff
    // into a workspace it was never derived from.
    expectedBaseVersionId: params.baseVersionId,
  });
  if (!patched.ok) return fallBackToUpdate("host_patch_failed", patched.message);
  if (patched.hostVersionId !== params.versionId) {
    // STRICT: the host must positively confirm it pinned the NEW version. A
    // missing echo (older host build, stripped field) is treated exactly like
    // a mismatch — otherwise the app would record a version the host never
    // acknowledged and resume/`/status` would disagree with reality. Let the
    // full update re-pin it instead.
    return fallBackToUpdate(
      "host_version_not_recorded",
      `host=${patched.hostVersionId ?? "none"}`,
    );
  }

  await touchPreviewSessionAsync({
    chatId: params.chatId,
    previewSessionId: patched.previewSessionId,
    previewUrl: patched.previewUrl,
    versionId: params.versionId,
    filesRevision: params.filesRevision,
    tier2Provider: "preview_host",
  });
  logPreviewLifecycleTelemetry({
    kind: "preview_followup_lane",
    chatId: params.chatId,
    versionId: params.versionId,
    baseVersionId: params.baseVersionId,
    lane: "patch",
    patchMode: patched.patchMode,
    ...(patched.patchReason ? { detail: patched.patchReason } : {}),
    changedFiles: Object.keys(plan.changedFiles).length,
    removedPaths: plan.removedPaths.length,
    durationMs: Math.max(0, Date.now() - startedAt),
  });
  return {
    previewUrl: patched.previewUrl,
    previewSessionId: patched.previewSessionId,
    previewMode: params.previewMode,
    fidelityTier: 2,
    startOutcome: "resumed",
    // A hot patch inherits the PREVIOUS boot's readiness receipt: Next dev is
    // alive but has not recompiled the new files yet, and `restarted`/`booted`
    // modes have only queued a boot. Not a per-version runtime-ready receipt —
    // heartbeat/status confirms it, exactly as for the update path (M#pv1).
    runtimeReady: false,
    filesRevision: params.filesRevision,
    tier2Meta: { tier2Provider: "preview_host" },
  };
}

export type StartPreviewSessionOptions = {
  /** When set, decrypted `projectEnvVars` merge into preview `.env.local` (after placeholders). */
  appProjectId?: string | null;
  chatId?: string | null;
  previewMode?: PreviewSessionMode;
  previewPolicy?: BuildSpecPreviewPolicy | null;
  verificationPolicy?: BuildSpecVerificationPolicy | null;
  /**
   * Ignore any resumable preview session and build a fresh VM.
   * Used when project env vars changed and the old preview session would keep stale `.env.local`.
   */
  forceRestart?: boolean;
  /**
   * When set with `chatId`, reuse an existing preview-host session for this version if the in-memory
   * session still points at a running runtime (avoids duplicate boots on reopen / bootstrap).
   */
  versionIdForSession?: string | null;
  /** DB revision captured when this version's files are sent to the host. */
  filesRevisionForSession?: string | null;
  /**
   * Skip `repairGeneratedFiles` when files already went through finalize preflight repair
   * (`filesJson` from DB / own-engine stream). Use `false` when parsing from raw `contentForVersion`.
   */
  skipRepair?: boolean;
  /**
   * Skip `buildCompleteProject` scaffold merge entirely. Used for repo imports (v0 templates)
   * where the zip already contains a complete project with its own package.json, tsconfig,
   * next.config, etc. Also used when files come from finalize-preflight persistence, where
   * the stored `files_json` is already scaffold-merged/repaired.
   */
  skipProjectScaffold?: boolean;
  /**
   * Lifecycle stage of the version being previewed. Threaded into
   * `buildPreviewEnvLocalContents` so F3 previews strip the tier3-stub
   * placeholder layer (otherwise stub `STRIPE_SECRET_KEY=sk_test_...`
   * etc. silently mask missing real values and the F3 readiness gate
   * becomes ineffective). Defaults to `"design"` when omitted.
   */
  lifecycleStage?: PreviewLifecycleStage;
  /**
   * Env keys declared by the dossiers selected for this generation. In F2
   * (`design`) they are seeded with deterministic stub values in the preview
   * `.env.local` when still unset, so the dossier UI renders its demo/mock
   * mode (see `resolvePreviewEnvLayers`). Threaded from the finalize result
   * (`FinalizeResult.selectedDossierEnvKeys`). F3 ignores them.
   */
  selectedDossierEnvKeys?: string[];
};

/**
 * Start a full Next.js preview session from generated files (own-engine + `/preview-session` API).
 *
 * Ordning: (1) återanvänd befintlig VM om session matchar chat+version — **utan** att bygga projekt på nytt;
 * (2) valfritt `repairGeneratedFiles` om inte `skipRepair`; (3) `buildCompleteProject` + `.env.local`
 * (skippas med `skipProjectScaffold` för repo-importer/finalize-preflightade filer);
 * (4) preview-host/Fly bootar projektet med `npm install` + `npm run dev`.
 *
 * **Paritet:** `skipRepair: true` när underlaget redan är finalize-preflightat (`filesJson`), t.ex. own-engine-ström och API mot DB.
 */
export async function startPreviewSession(
  generatedFiles: CodeFile[],
  options?: StartPreviewSessionOptions,
): Promise<StartPreviewSessionOutcome> {
  const cid =
    typeof options?.chatId === "string" && options.chatId.trim() ? options.chatId.trim() : null;
  const vid =
    typeof options?.versionIdForSession === "string" && options.versionIdForSession.trim()
      ? options.versionIdForSession.trim()
      : null;
  const dedupeKey = cid && vid
    ? `${cid}:${vid}:${options?.forceRestart === true ? "force-restart" : "default"}`
    : null;
  if (dedupeKey) {
    const existing = inflightPreviewSessionByChatVersion.get(dedupeKey);
    if (existing) return existing;
  }

  const run = runStartPreviewSession(generatedFiles, options);
  if (dedupeKey) {
    inflightPreviewSessionByChatVersion.set(dedupeKey, run);
    void run.finally(() => {
      inflightPreviewSessionByChatVersion.delete(dedupeKey);
    });
  }
  return run;
}

async function runStartPreviewSession(
  generatedFiles: CodeFile[],
  options?: StartPreviewSessionOptions,
): Promise<StartPreviewSessionOutcome> {
  const resolvedMode: PreviewSessionMode = "dev_only";

  const cid =
    typeof options?.chatId === "string" && options.chatId.trim() ? options.chatId.trim() : null;
  const vid =
    typeof options?.versionIdForSession === "string" && options.versionIdForSession.trim()
      ? options.versionIdForSession.trim()
      : null;
  const hostVersionId = vid;
  const filesRevision =
    typeof options?.filesRevisionForSession === "string" &&
    options.filesRevisionForSession.trim()
      ? options.filesRevisionForSession.trim()
      : null;

  if (cid && options?.forceRestart) {
    // forceRestart is the user's signal that the previous preview session should
    // be torn down — release the Fly runtime before clearing local state.
    await destroyAndClearPreviewSession(cid);
  }

  if (cid && vid && options?.forceRestart !== true) {
    const sess = await getActivePreviewSessionAsync(cid);
    const samePinnedContent =
      sess?.versionId === vid &&
      // Older session entries have no revision. When the caller now knows the
      // revision, treat that unknown pointer as stale and resend the files;
      // otherwise a same-version repair rewrite (N -> N+1) could resume a VM
      // still serving N and then falsely relabel it as N+1.
      (!filesRevision || sess.filesRevision === filesRevision);
    if (samePinnedContent && sess.previewSessionId) {
      // Snabb-resume: samma versionId betyder att host troligen redan
      // har korrekta filer + warm Next dev. Bara verifiera och returnera.
      const resumed = await tryResumeTier2Runtime(sess);
      // Readiness ≠ liveness (req A5): a session whose host `readinessState` is
      // "failed" (process alive, Next build-error overlay) must NOT resume as a
      // healthy preview — fall through to destroy + re-pin so the fresh boot can
      // re-run install/repair instead of surfacing the broken overlay as live.
      if (resumed && resumed.readinessState !== "failed") {
        await touchPreviewSessionAsync({
          chatId: cid,
          previewSessionId: resumed.previewSessionId,
          previewUrl: resumed.primaryUrl,
          versionId: vid,
          filesRevision: filesRevision ?? sess.filesRevision,
          tier2Provider: "preview_host",
        });
        return {
          ok: true,
          result: {
            previewUrl: resumed.primaryUrl,
            previewSessionId: resumed.previewSessionId,
            previewMode: resolvedMode,
            fidelityTier: 2,
            startOutcome: "resumed",
            // Runtime-ready ONLY on a confirmed `ready` verdict (Bugbot finding
            // 1): unknown readiness (host omitted the field / boot hasn't
            // recorded it yet → null) and `starting` are NOT success, so the
            // preview-session route must not stamp `preview_success=true` off
            // mere liveness. The heartbeat/status receipt path stamps once the
            // host reports a real `ready`.
            runtimeReady: resumed.readinessState === "ready" && resumed.httpReady !== false,
            filesRevision: filesRevision ?? sess.filesRevision,
            tier2Meta: { tier2Provider: "preview_host" as const },
          },
        };
      }
      // Resume failed → the stored preview-session may have died on the host.
      // Best-effort destroy first to avoid leaking compute if the host
      // still holds the runtime, then clear the local pointer.
      await destroyAndClearPreviewSession(cid);
    }
  }

  // Follow-up-flow: chatten har en session men på en ÄLDRE versionId.
  // Tidigare hamnade vi här i `startPreviewHostSession`-pathen och fick
  // `startOutcome: "fresh"` (= "recreated" i UI). Det var visserligen
  // funktionellt OK eftersom preview-host själv återanvänder previewSessionId
  // när den ser samma chatId, men UI:t tappade resumed-signalen.
  //
  // Försök först `updatePreviewHostSession` (semantiskt korrekt: byter
  // ut filer i en levande preview-session + restartar Next dev). Om host:en
  // svarar 404 (sessionen är död) faller vi tillbaka till start-pathen.
  const previewFiles = applyPreviewOnlyRulesToFiles(generatedFiles);

  if (cid && vid && options?.forceRestart !== true) {
    const sess = await getActivePreviewSessionAsync(cid);
    const sessionContentMismatch =
      sess?.versionId !== vid ||
      Boolean(filesRevision && sess.filesRevision !== filesRevision);
    if (sess?.previewSessionId && sessionContentMismatch) {
      const skipRepairForUpdate = options?.skipRepair === true;
      const skipScaffoldForUpdate = options?.skipProjectScaffold === true;
      let updateFiles: CodeFile[];
      try {
        updateFiles = skipRepairForUpdate
          ? previewFiles
          : repairGeneratedFiles(previewFiles).files;
      } catch {
        updateFiles = previewFiles;
      }
      const runtimeForUpdate: RuntimeFile[] = skipScaffoldForUpdate
        ? updateFiles.map((f) => ({ name: f.path, content: f.content }))
        : buildCompleteProject(
            updateFiles,
            collectRequiredUiComponents(updateFiles),
          ).map((f) => ({ name: f.path, content: f.content }));
      // Same placeholder parity as the fresh-start branch below: a session
      // update replaces the workspace files wholesale, so a verbatim fileset
      // (imported repos / finalize-preflighted files) must keep the injected
      // placeholder API route or later follow-ups silently drop it from the
      // live VM while verify still ships it.
      if (skipScaffoldForUpdate) {
        const hasPlaceholderForUpdate = runtimeForUpdate.some(
          (f) =>
            f.name === "app/api/placeholder/route.ts" ||
            f.name === "app/api/placeholder/route.js",
        );
        if (!hasPlaceholderForUpdate) {
          runtimeForUpdate.push({
            name: "app/api/placeholder/route.ts",
            content: PLACEHOLDER_API_ROUTE,
          });
        }
      }
      const envLocalPath = ".env.local";
      const envIdx = runtimeForUpdate.findIndex((f) => f.name === envLocalPath);
      let priorEnvLocal: string | null = null;
      if (envIdx >= 0) {
        priorEnvLocal = runtimeForUpdate[envIdx]!.content;
        runtimeForUpdate.splice(envIdx, 1);
      }
      // The scaffold merge injects its own placeholder `.env.local`; passing
      // that as the "generated" (= highest-priority) layer would let stale
      // placeholder values override the user's real env-panel values in the
      // VM. Only a genuinely model-emitted file counts as generated.
      if (isPipelineAuthoredEnvLocal(priorEnvLocal)) priorEnvLocal = null;
      const envBody = await buildPreviewEnvLocalContents({
        appProjectId: options?.appProjectId ?? null,
        generatedEnvLocal: priorEnvLocal,
        lifecycleStage: options?.lifecycleStage,
        selectedDossierEnvKeys: options?.selectedDossierEnvKeys,
        // Scope placeholder catalogs to keys this project actually uses
        // (.env.local is already spliced out; env artifacts are excluded
        // from the scan inside the builder).
        scopePlaceholdersToFiles: runtimeForUpdate,
      });
      runtimeForUpdate.push({ name: envLocalPath, content: envBody });
      const updatePayload = Object.fromEntries(
        runtimeForUpdate.map((f) => [f.name, f.content]),
      );
      // Fast Edit Lane first: push only what actually differs from the live VM
      // and skip the Next dev restart. Any doubt -> `null` -> the full update
      // below (unchanged behaviour).
      const patchedResult = await tryFollowUpPatchLane({
        chatId: cid,
        previewSessionId: sess.previewSessionId,
        baseVersionId: sess.versionId,
        versionId: vid,
        filesRevision,
        updatePayload,
        previewMode: resolvedMode,
      });
      if (patchedResult) {
        return { ok: true, result: patchedResult };
      }
      const updated = await updatePreviewHostSession({
        previewSessionId: sess.previewSessionId,
        versionId: vid,
        filesJson: updatePayload,
      });
      if (updated.ok) {
        await touchPreviewSessionAsync({
          chatId: cid,
          previewSessionId: updated.previewSessionId,
          previewUrl: updated.previewUrl,
          versionId: vid,
          filesRevision,
          tier2Provider: "preview_host",
        });
        return {
          ok: true,
          result: {
            previewUrl: updated.previewUrl,
            previewSessionId: updated.previewSessionId,
            previewMode: resolvedMode,
            fidelityTier: 2,
            startOutcome: updated.startOutcome ?? "resumed",
            // Files were swapped into the live session and the host re-boots
            // Next dev — the update response returns before that boot is
            // serving, so the runtime is NOT yet confirmed ready.
            runtimeReady: false,
            filesRevision,
            tier2Meta: { tier2Provider: "preview_host" as const },
          },
        };
      }
      // sessionMissing=true betyder host:en saknar preview-session helt; clear
      // den lokala pekaren så start-pathen nedan får skapa en ny utan
      // att bli förvirrad av föråldrad session-store-data.
      if ("sessionMissing" in updated && updated.sessionMissing === true) {
        await destroyAndClearPreviewSession(cid);
      }
      // Annan typ av update-fel → fall genom till startPreviewHostSession
      // som har full retry+disk-cleanup-logik.
    }
  }

  const skipRepair = options?.skipRepair === true;
  const skipProjectScaffold = options?.skipProjectScaffold === true;
  let filesForProject: CodeFile[];
  if (skipRepair) {
    filesForProject = previewFiles;
  } else {
    try {
      filesForProject = repairGeneratedFiles(previewFiles).files;
    } catch (err) {
      return {
        ok: false,
        error: {
          stage: "repair",
          message: err instanceof Error ? err.message : "File repair failed",
        },
      };
    }
  }

  const runtimeFiles: RuntimeFile[] = skipProjectScaffold
    ? filesForProject.map((f) => ({ name: f.path, content: f.content }))
    : buildCompleteProject(
        filesForProject,
        collectRequiredUiComponents(filesForProject),
      ).map((f) => ({ name: f.path, content: f.content }));

  if (skipProjectScaffold) {
    const hasPlaceholder = runtimeFiles.some(
      (f) => f.name === "app/api/placeholder/route.ts" || f.name === "app/api/placeholder/route.js",
    );
    if (!hasPlaceholder) {
      runtimeFiles.push({ name: "app/api/placeholder/route.ts", content: PLACEHOLDER_API_ROUTE });
    }
  }

  const envLocalPath = ".env.local";
  const envIdx = runtimeFiles.findIndex((f) => f.name === envLocalPath);
  let priorEnvLocal: string | null = null;
  if (envIdx >= 0) {
    priorEnvLocal = runtimeFiles[envIdx]!.content;
    runtimeFiles.splice(envIdx, 1);
  }
  // Same provenance rule as the update path above: never let the pipeline's
  // own placeholder dump masquerade as the model-emitted "generated" layer
  // (it would override user env-panel values in the VM).
  if (isPipelineAuthoredEnvLocal(priorEnvLocal)) priorEnvLocal = null;
  const envBody = await buildPreviewEnvLocalContents({
    appProjectId: options?.appProjectId ?? null,
    generatedEnvLocal: priorEnvLocal,
    lifecycleStage: options?.lifecycleStage,
    selectedDossierEnvKeys: options?.selectedDossierEnvKeys,
    // Same catalog scoping as the update path above.
    scopePlaceholdersToFiles: runtimeFiles,
  });
  runtimeFiles.push({ name: envLocalPath, content: envBody });

  const hostUrl = getPreviewHostBaseUrl();
  if (!hostUrl) {
    return {
      ok: false,
      error: {
        stage: "preview-start",
        message: "SAJTMASKIN_PREVIEW_HOST_BASE_URL must be set for tier-2 live preview.",
      },
    };
  }
  if (!cid || !hostVersionId) {
    return {
      ok: false,
      error: {
        stage: "preview-start",
        message: "preview_host tier requires chatId and versionIdForSession.",
      },
    };
  }

  const filesJson = Object.fromEntries(runtimeFiles.map((f) => [f.name, f.content]));
  const started = await startPreviewHostSession({
    chatId: cid,
    versionId: hostVersionId,
    filesJson,
  });
  if (!started.ok) {
    logPreviewLifecycleTelemetry({
      kind: "preview_failed",
      chatId: cid,
      versionId: vid,
      stage: "preview-start",
      detail: started.message,
      msSinceEngineStart: 0,
      tier2Provider: "preview_host",
    });
    return {
      ok: false,
      error: {
        stage: "preview-start",
        message: started.message,
      },
    };
  }

  await touchPreviewSessionAsync({
    chatId: cid,
    previewSessionId: started.previewSessionId,
    previewUrl: started.previewUrl,
    versionId: vid,
    filesRevision,
    tier2Provider: "preview_host",
  });
  return {
    ok: true,
    result: {
      previewUrl: started.previewUrl,
      previewSessionId: started.previewSessionId,
      previewMode: resolvedMode,
      fidelityTier: 2,
      startOutcome: started.startOutcome,
      // Fresh boot: preview-host `/preview/session/start` queues the boot and
      // returns 201 before `npm run dev` is serving, so the runtime is NOT yet
      // confirmed ready. `preview_success` stays pending (null) until a real
      // runtime-ready receipt arrives (M#pv1).
      runtimeReady: false,
      filesRevision,
      tier2Meta: { tier2Provider: "preview_host" },
    },
  };
}
