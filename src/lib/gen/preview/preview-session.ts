import type { CodeFile } from "../parser";
import type {
  BuildSpecPreviewPolicy,
  BuildSpecVerificationPolicy,
} from "../build-spec";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import {
  buildPreviewEnvLocalContents,
  type PreviewLifecycleStage,
} from "@/lib/gen/preview/env-local";
import {
  destroyPreviewHostSession,
  patchPreviewHostSession,
  startPreviewHostSession,
  updatePreviewHostSession,
  type PreviewHostPatchMode,
} from "@/lib/gen/preview/preview-host-client";
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
      reason: "disabled" | "no_session" | "session_missing" | "host_error";
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
  changedFiles: Record<string, string>;
  removedPaths?: string[];
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
  const patched = await patchPreviewHostSession({
    previewSessionId: sess.previewSessionId,
    versionId,
    files: params.changedFiles,
    removedPaths: params.removedPaths,
  });
  if (patched.ok) {
    await touchPreviewSessionAsync({
      chatId,
      previewSessionId: patched.previewSessionId,
      previewUrl: patched.previewUrl,
      versionId,
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
  return { ok: false, reason: "host_error", message: patched.message };
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

  if (cid && options?.forceRestart) {
    // forceRestart is the user's signal that the previous preview session should
    // be torn down — release the Fly runtime before clearing local state.
    await destroyAndClearPreviewSession(cid);
  }

  if (cid && vid && options?.forceRestart !== true) {
    const sess = await getActivePreviewSessionAsync(cid);
    if (sess?.versionId === vid && sess.previewSessionId) {
      // Snabb-resume: samma versionId betyder att host troligen redan
      // har korrekta filer + warm Next dev. Bara verifiera och returnera.
      const resumed = await tryResumeTier2Runtime(sess);
      if (resumed) {
        await touchPreviewSessionAsync({
          chatId: cid,
          previewSessionId: resumed.previewSessionId,
          previewUrl: resumed.primaryUrl,
          versionId: vid,
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
  if (cid && vid && options?.forceRestart !== true) {
    const sess = await getActivePreviewSessionAsync(cid);
    if (sess?.previewSessionId && sess.versionId !== vid) {
      const skipRepairForUpdate = options?.skipRepair === true;
      const skipScaffoldForUpdate = options?.skipProjectScaffold === true;
      let updateFiles: CodeFile[];
      try {
        updateFiles = skipRepairForUpdate
          ? generatedFiles
          : repairGeneratedFiles(generatedFiles).files;
      } catch {
        updateFiles = generatedFiles;
      }
      const runtimeForUpdate: RuntimeFile[] = skipScaffoldForUpdate
        ? updateFiles.map((f) => ({ name: f.path, content: f.content }))
        : buildCompleteProject(
            updateFiles,
            collectRequiredUiComponents(updateFiles),
          ).map((f) => ({ name: f.path, content: f.content }));
      const envLocalPath = ".env.local";
      const envIdx = runtimeForUpdate.findIndex((f) => f.name === envLocalPath);
      let priorEnvLocal: string | null = null;
      if (envIdx >= 0) {
        priorEnvLocal = runtimeForUpdate[envIdx]!.content;
        runtimeForUpdate.splice(envIdx, 1);
      }
      const envBody = await buildPreviewEnvLocalContents({
        appProjectId: options?.appProjectId ?? null,
        generatedEnvLocal: priorEnvLocal,
        lifecycleStage: options?.lifecycleStage,
      });
      runtimeForUpdate.push({ name: envLocalPath, content: envBody });
      const updatePayload = Object.fromEntries(
        runtimeForUpdate.map((f) => [f.name, f.content]),
      );
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
    filesForProject = generatedFiles;
  } else {
    try {
      filesForProject = repairGeneratedFiles(generatedFiles).files;
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
  const envBody = await buildPreviewEnvLocalContents({
    appProjectId: options?.appProjectId ?? null,
    generatedEnvLocal: priorEnvLocal,
    lifecycleStage: options?.lifecycleStage,
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
      tier2Meta: { tier2Provider: "preview_host" },
    },
  };
}

