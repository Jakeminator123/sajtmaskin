import type { CodeFile } from "../parser";
import type {
  BuildSpecPreviewPolicy,
  BuildSpecVerificationPolicy,
} from "../build-spec";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { buildPreviewEnvLocalContents } from "@/lib/gen/preview/env-local";
import { startPreviewHostSession } from "@/lib/gen/preview/preview-host-client";
import {
  clearPreviewSessionAsync,
  getActivePreviewSessionAsync,
  touchPreviewSessionAsync,
} from "@/lib/gen/preview/session-store";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";
import { tryResumeTier2Runtime } from "@/lib/gen/preview/tier2-resume";
import { buildCompleteProject } from "../export/project-scaffold";
import { PLACEHOLDER_API_ROUTE } from "../export/project-scaffold";
import { collectRequiredUiComponents } from "../export/build-exportable-project";
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
  sandboxUrl: string;
  sandboxId: string;
  sandboxPreviewMode: PreviewSessionMode;
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
   * next.config, etc. Avoids overwriting the project's own dependency tree.
   */
  skipProjectScaffold?: boolean;
};

/**
 * Start a full Next.js preview session from generated files (own-engine + `/preview-session` API).
 *
 * Ordning: (1) återanvänd befintlig VM om session matchar chat+version — **utan** att bygga projekt på nytt;
 * (2) valfritt `repairGeneratedFiles` om inte `skipRepair`; (3) `buildCompleteProject` + `.env.local`
 * (skippas med `skipProjectScaffold` för repo-importer);
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

  if (cid && options?.forceRestart) {
    await clearPreviewSessionAsync(cid);
  }

  if (cid && vid && options?.forceRestart !== true) {
    const sess = await getActivePreviewSessionAsync(cid);
    if (sess?.versionId === vid && sess.sandboxId) {
      const resumed = await tryResumeTier2Runtime(sess);
      if (resumed) {
        await touchPreviewSessionAsync({
          chatId: cid,
          sandboxId: resumed.sandboxId,
          sandboxUrl: resumed.primaryUrl,
          versionId: vid,
          tier2Provider: "preview_host",
        });
        return {
          ok: true,
          result: {
            sandboxUrl: resumed.primaryUrl,
            sandboxId: resumed.sandboxId,
            sandboxPreviewMode: resolvedMode,
            fidelityTier: 2,
            startOutcome: "resumed",
            tier2Meta: { tier2Provider: "preview_host" as const },
          },
        };
      }
      await clearPreviewSessionAsync(cid);
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
  if (!cid || !vid) {
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
    versionId: vid,
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
    sandboxId: started.sandboxId,
    sandboxUrl: started.sandboxUrl,
    versionId: vid,
    tier2Provider: "preview_host",
  });
  return {
    ok: true,
    result: {
      sandboxUrl: started.sandboxUrl,
      sandboxId: started.sandboxId,
      sandboxPreviewMode: resolvedMode,
      fidelityTier: 2,
      startOutcome: started.startOutcome,
      tier2Meta: { tier2Provider: "preview_host" },
    },
  };
}

