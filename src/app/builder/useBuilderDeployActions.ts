"use client";

import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { DomainSearchResult } from "@/components/builder/DomainSearchDialog";
import type { ChatReadiness } from "@/lib/chat-readiness";
import type { ImageAssetStrategy } from "@/lib/imageAssets";
import { saveProjectData, updateProject } from "@/lib/project-client";
import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import { dispatchAutoFixEvent } from "@/lib/hooks/chat/auto-fix-events";
import { readPreviewUrl } from "@/lib/api/preview-url-contract";
import { debugLog } from "@/lib/utils/debug";

type Args = {
  selectedVersionIdRef: MutableRefObject<string | null>;
  latestVersionIdRef: MutableRefObject<string | null>;
  chatId: string | null;
  activeVersionId: string | null;
  /** In-session deployment id (the one whose SSE status the header reflects). */
  activeDeploymentId: string | null;
  deployReadiness: ChatReadiness | null;
  isDeploying: boolean;
  isMediaEnabled: boolean;
  enableBlobMedia: boolean;
  domainQuery: string;
  deployNameInput: string;
  isDeployNameSaving: boolean;
  appProjectId: string | null;
  appProjectName: string | null;
  /** Hosting project name hydrated from the deployments API — reused so an
   * ompublicering keeps the same name (→ same hosting project + stable URL). */
  hydratedProjectName: string | null;
  applyInstructionsOnce: boolean;
  pendingInstructionsRef: MutableRefObject<string | null>;
  pendingInstructionsOnceRef: MutableRefObject<boolean | null>;
  setSelectedVersionId: Dispatch<SetStateAction<string | null>>;
  setIsDeploying: Dispatch<SetStateAction<boolean>>;
  setDomainManagerOpen: Dispatch<SetStateAction<boolean>>;
  setLastDeployVercelProjectId: Dispatch<SetStateAction<string | null>>;
  setActiveDeploymentId: Dispatch<SetStateAction<string | null>>;
  setDomainResults: Dispatch<SetStateAction<DomainSearchResult[] | null>>;
  setIsDomainSearching: Dispatch<SetStateAction<boolean>>;
  setDeployNameDialogOpen: Dispatch<SetStateAction<boolean>>;
  setDeployNameError: Dispatch<SetStateAction<string | null>>;
  setDeployNameInput: Dispatch<SetStateAction<string>>;
  setIsDeployNameSaving: Dispatch<SetStateAction<boolean>>;
  setPendingProjectName: Dispatch<SetStateAction<string | null>>;
  setAppProjectName: Dispatch<SetStateAction<string | null>>;
  setCustomInstructions: Dispatch<SetStateAction<string>>;
  setApplyInstructionsOnce: Dispatch<SetStateAction<boolean>>;
  resolveSuggestedProjectName: () => string;
  mutateChat: () => void;
  mutateVersions: () => void;
  validateCss: (chatId: string, versionId: string) => Promise<{
    issues: Array<{ fileName: string; issues: Array<{ severity: string }> }>;
    fixed?: boolean;
    previewUrl?: string | null;
  } | null>;
};

export function useBuilderDeployActions({
  selectedVersionIdRef,
  latestVersionIdRef,
  chatId,
  activeVersionId,
  activeDeploymentId,
  deployReadiness,
  isDeploying,
  isMediaEnabled,
  enableBlobMedia,
  domainQuery,
  deployNameInput,
  isDeployNameSaving,
  appProjectId,
  appProjectName,
  hydratedProjectName,
  applyInstructionsOnce,
  pendingInstructionsRef,
  pendingInstructionsOnceRef,
  setSelectedVersionId,
  setIsDeploying,
  setDomainManagerOpen,
  setLastDeployVercelProjectId,
  setActiveDeploymentId,
  setDomainResults,
  setIsDomainSearching,
  setDeployNameDialogOpen,
  setDeployNameError,
  setDeployNameInput,
  setIsDeployNameSaving,
  setPendingProjectName,
  setAppProjectName,
  setCustomInstructions,
  setApplyInstructionsOnce,
  resolveSuggestedProjectName,
  mutateChat,
  mutateVersions,
  validateCss,
}: Args) {
  const handleOpenDeployDialog = useCallback(() => {
    setDeployNameError(null);
    // Prefill with the existing hosting project name when known so a
    // re-publish keeps the same name (stable live address); otherwise fall
    // back to the suggested project name.
    setDeployNameInput(hydratedProjectName?.trim() || resolveSuggestedProjectName());
    setDeployNameDialogOpen(true);
  }, [hydratedProjectName, resolveSuggestedProjectName, setDeployNameError, setDeployNameInput, setDeployNameDialogOpen]);

  const handleDomainSearch = useCallback(async () => {
    if (!domainQuery.trim()) return;
    setIsDomainSearching(true);
    setDomainResults(null);
    try {
      const res = await fetch("/api/domains/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: domainQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setDomainResults(data.results ?? []);
    } catch {
      toast.error("Kunde inte söka domäner");
    } finally {
      setIsDomainSearching(false);
    }
  }, [domainQuery, setDomainResults, setIsDomainSearching]);

  const persistVersionErrorLogs = useCallback(
    async (
      errChatId: string,
      versionId: string,
      logs: Array<{
        level: "info" | "warning" | "error";
        category?: string | null;
        message: string;
        meta?: Record<string, unknown> | null;
      }>,
    ) => {
      if (!logs.length) return;
      try {
        await fetch(
          `${engineChatBaseUrl(errChatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logs }),
          },
        );
      } catch (error) {
        debugLog("builder", "Failed to persist version error logs", error);
      }
    },
    [],
  );

  const deployActiveVersionToVercel = useCallback(
    async (
      target: "production" | "preview" = "production",
      projectName?: string,
      seo?: { optIn: boolean; siteUrl: string },
    ) => {
      if (!chatId) {
        toast.error("Ingen chat vald");
        return;
      }
      if (!activeVersionId) {
        toast.error("Ingen version vald");
        return;
      }
      if (deployReadiness && !deployReadiness.canDeploy) {
        const firstBlocker = deployReadiness.blockers[0];
        toast.error(firstBlocker?.detail || firstBlocker?.title || "Versionen är inte redo att publicera.");
        return;
      }
      if (isDeploying) return;

      setIsDeploying(true);
      let resolvedStrategy: ImageAssetStrategy = enableBlobMedia && isMediaEnabled ? "blob" : "external";
      try {
        const wantsBlob = enableBlobMedia;
        resolvedStrategy = wantsBlob && isMediaEnabled ? "blob" : "external";
        if (wantsBlob && !isMediaEnabled) {
          toast.error("Blob storage saknas – deploy körs med externa bild-URL:er.");
        }

        // NOTE (#486 Fix B, do NOT "fix" this to send `siteUrl: null`): this
        // body feeds the deploy route's `resolveDeploySeoOptions`, where an
        // explicit `null` means "opt out of SEO for this single deploy" —
        // a different contract than the PATCH-preferences clear-fallback fix
        // below. Omitting the key here correctly falls through to the
        // persisted/canonical URL for this one deploy.
        const seoPayload =
          seo && seo.optIn
            ? {
                seo: {
                  optIn: true as const,
                  ...(seo.siteUrl.trim()
                    ? { siteUrl: seo.siteUrl.trim() }
                    : {}),
                },
              }
            : seo
              ? { seo: { optIn: false as const } }
              : {};

        const response = await fetch("/api/v0/deployments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            versionId: activeVersionId,
            projectId: appProjectId,
            target,
            imageStrategy: resolvedStrategy,
            ...(projectName?.trim() ? { projectName: projectName.trim() } : {}),
            ...seoPayload,
          }),
        });

        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          code?: string;
          url?: string;
          vercelProjectId?: string;
          id?: string;
          deployReadiness?: { missingEnv?: string[]; warnings?: string[] };
          fixesApplied?: string[];
          preDeployWarnings?: string[];
          /** Per-key env-degradation warnings (placeholder / feature-runtime). */
          envWarnings?: Array<{
            key?: string;
            integration?: string;
            reason?: string;
            message?: string;
          }>;
          /** Env-var sync-to-hosting failures — publish still succeeded. */
          envSyncWarnings?: string[];
          /** Branded/custom-domain provisioning warnings — publish still succeeded. */
          domainWarnings?: string[];
          /** The exact keys the 409 gate blocked on (R1: buildBlockingKeys). */
          buildBlockingKeys?: string[];
        };
        if (!response.ok) {
          const base =
            data?.error || data?.message || `Deploy failed (HTTP ${response.status})`;
          // Föredra gatens egen lista (`buildBlockingKeys`) — det är exakt de
          // nycklar 409:an blockade på. `missingEnv` kan avvika från den
          // (bugbot medium på #461); behålls bara som fallback för äldre svar.
          const blockedKeys =
            data?.code === "DEPLOY_MISSING_ENV" &&
            Array.isArray(data.buildBlockingKeys) &&
            data.buildBlockingKeys.length > 0
              ? data.buildBlockingKeys
              : null;
          const missing =
            blockedKeys ??
            (data?.code === "DEPLOY_MISSING_ENV" &&
            Array.isArray(data.deployReadiness?.missingEnv) &&
            data.deployReadiness.missingEnv.length > 0
              ? data.deployReadiness.missingEnv
              : null);
          if (chatId && activeVersionId && response.status === 409 && data?.code === "DEPLOY_MISSING_ENV") {
            void persistVersionErrorLogs(chatId, activeVersionId, [
              {
                level: "error",
                category: "deploy",
                message: base,
                meta: {
                  code: data.code,
                  missingEnv: missing ?? [],
                  preDeployWarnings: data.preDeployWarnings ?? [],
                  fixesApplied: data.fixesApplied ?? [],
                },
              },
            ]);
          }
          const hint = missing
            ? ` Saknas: ${missing.join(", ")}. Lägg till dem under Projektets miljövariabler.`
            : "";
          throw new Error(`${base}${hint}`);
        }

        const rawUrl = typeof data?.url === "string" ? data.url : null;
        const url = rawUrl ? (rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`) : null;
        const deployVercelProjectId =
          typeof data?.vercelProjectId === "string" ? data.vercelProjectId : null;
        const returnedDeploymentId = typeof data?.id === "string" ? data.id : null;

        if (deployVercelProjectId) {
          setLastDeployVercelProjectId(deployVercelProjectId);
        }
        if (returnedDeploymentId) {
          setActiveDeploymentId(returnedDeploymentId);
        }

        toast.success(url ? "Publicering startad (bygget pågår...)" : "Publicering startad");
        if (url) {
          toast(`Live-adress: ${url}`, {
            duration: 15000,
            action: deployVercelProjectId
              ? {
                  label: "Koppla domän",
                  onClick: () => setDomainManagerOpen(true),
                }
              : undefined,
          });
        }

        // R3 (Codex #443): the deploy succeeds but the response can carry
        // non-blocking warnings that previously never reached the user (only
        // the success toast showed). Surface them so the user knows an
        // integration is running on placeholder data or that env vars didn't
        // sync for future rebuilds. Aggregated into at most two warning toasts
        // to avoid spamming one per key.
        const envWarningMessages = Array.isArray(data?.envWarnings)
          ? data.envWarnings
              .map((w) => (typeof w?.message === "string" ? w.message.trim() : ""))
              .filter((m) => m.length > 0)
          : [];
        if (envWarningMessages.length > 0) {
          toast.warning(
            envWarningMessages.length === 1
              ? envWarningMessages[0]
              : `${envWarningMessages.length} miljövariabler behöver uppmärksamhet:\n${envWarningMessages.join("\n")}`,
            { duration: 12000 },
          );
        }

        const envSyncWarnings = Array.isArray(data?.envSyncWarnings)
          ? data.envSyncWarnings.filter(
              (w): w is string => typeof w === "string" && w.trim().length > 0,
            )
          : [];
        if (envSyncWarnings.length > 0) {
          toast.warning(
            "Vissa miljövariabler kunde inte sparas hos hosting-leverantören för framtida ombyggen. Publiceringen lyckades – men byggs sajten om utanför Sajtmaskin kan du behöva spara om dina integrationer under Projektets miljövariabler.",
            { duration: 12000 },
          );
        }
        const domainWarnings = Array.isArray(data?.domainWarnings)
          ? data.domainWarnings.filter(
              (warning): warning is string =>
                typeof warning === "string" && warning.trim().length > 0,
            )
          : [];
        if (domainWarnings.length > 0) {
          toast.warning(domainWarnings.join("\n"), { duration: 12000 });
        }
      } catch (error) {
        console.error("Deploy error:", error);
        if (chatId && activeVersionId) {
          void persistVersionErrorLogs(chatId, activeVersionId, [
            {
              level: "error",
              category: "deploy",
              message: error instanceof Error ? error.message : "Publicering misslyckades",
              meta: {
                target,
                projectName: projectName?.trim() || null,
                imageStrategy: resolvedStrategy,
              },
            },
          ]);
        }
        toast.error(error instanceof Error ? error.message : "Publicering misslyckades");
      } finally {
        setIsDeploying(false);
      }
    },
    [chatId, activeVersionId, deployReadiness, isDeploying, isMediaEnabled, enableBlobMedia, appProjectId, setIsDeploying, setLastDeployVercelProjectId, setActiveDeploymentId, setDomainManagerOpen, persistVersionErrorLogs],
  );

  const handleConfirmDeploy = useCallback(async (
    payload?: { seo?: { optIn: boolean; siteUrl: string } },
  ) => {
    if (isDeploying || isDeployNameSaving) return;
    const rawName = deployNameInput.trim();
    const nextName = rawName || resolveSuggestedProjectName();
    if (!nextName.trim()) {
      setDeployNameError("Ange ett projektnamn.");
      return;
    }
    setDeployNameDialogOpen(false);
    setPendingProjectName(nextName);

    if (appProjectId && nextName.trim() !== (appProjectName ?? "").trim()) {
      setIsDeployNameSaving(true);
      try {
        const updated = await updateProject(appProjectId, { name: nextName.trim() });
        setAppProjectName(updated.name);
      } catch (error) {
        debugLog("builder", "Failed to update project name", error);
        toast.error("Kunde inte uppdatera projektnamn.");
      } finally {
        setIsDeployNameSaving(false);
      }
    }

    // Persist SEO preferences best-effort before deploying. Failure here
    // shouldn't block the deploy — the body override still wins on the
    // server side via `resolveDeploySeoOptions`.
    if (appProjectId && payload?.seo) {
      // #486 Fix B: an omitted `siteUrl` is a true PATCH no-op on the server
      // (`mergeSeoPatch` in `preferences/route.ts` keeps the persisted value)
      // — a blank field could never clear a previously saved override. Send
      // an explicit `null` instead, which the schema/route already support,
      // so the user can actually clear the SEO-fallback URL.
      const seoPatch = payload.seo.optIn
        ? {
            optIn: true as const,
            siteUrl: payload.seo.siteUrl.trim() || null,
          }
        : { optIn: false as const };
      try {
        await fetch(`/api/projects/${encodeURIComponent(appProjectId)}/preferences`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ seo: seoPatch }),
        });
      } catch (error) {
        debugLog("builder", "Failed to persist SEO preferences", error);
      }
    }

    await deployActiveVersionToVercel("production", nextName, payload?.seo);
  }, [
    isDeploying,
    isDeployNameSaving,
    deployNameInput,
    resolveSuggestedProjectName,
    appProjectId,
    appProjectName,
    deployActiveVersionToVercel,
    setDeployNameError,
    setDeployNameDialogOpen,
    setPendingProjectName,
    setIsDeployNameSaving,
    setAppProjectName,
  ]);

  // A3: "Publicera om med fix" — MANUELL deploy-repair. Anropas när en
  // publicering gått till `error` (asynkront Vercel-build-fel). Kör en repair
  // mot den failade versionen och guidar användaren att acceptera + publicera
  // om. Redeployar ALDRIG automatiskt (Ö3).
  const [isRepublishRepairing, setIsRepublishRepairing] = useState(false);
  const republishWithFix = useCallback(async () => {
    if (!chatId) {
      toast.error("Ingen chat vald");
      return;
    }
    if (!activeDeploymentId) {
      toast.error("Ingen failad publicering att reparera.");
      return;
    }
    if (isRepublishRepairing) return;
    setIsRepublishRepairing(true);
    try {
      // Ingen versionId skickas: servern reparerar den version som
      // deployment-raden pekar på (den som failade), inte klientens aktiva —
      // efter en follow-up/reload kan de skilja sig (bugbot high, #456).
      const res = await fetch("/api/v0/deployments/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          deploymentId: activeDeploymentId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok && res.status !== 409) {
        throw new Error(data.message || data.error || `Reparation misslyckades (HTTP ${res.status})`);
      }
      if (data.status === "repair_available") {
        toast.success(
          data.message ||
            "En fix är klar. Granska och acceptera reparationen, publicera sedan om.",
          { duration: 12000 },
        );
        // Uppdatera versionslistan/-status så repair_available syns direkt.
        mutateVersions();
        mutateChat();
      } else if (data.status === "repairing") {
        toast(data.message || "En reparation körs redan. Försök igen strax.");
      } else {
        toast.error(
          data.message ||
            "Reparationen kunde inte åtgärda bygget. Försök igen eller redigera manuellt.",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reparation misslyckades");
    } finally {
      setIsRepublishRepairing(false);
    }
  }, [chatId, activeDeploymentId, isRepublishRepairing, mutateVersions, mutateChat]);

  const triggerAutoFix = useCallback((payload: {
    chatId: string;
    versionId: string;
    reasons: string[];
    meta?: Record<string, unknown>;
  }) => {
    dispatchAutoFixEvent(payload);
  }, []);

  const handleGenerationComplete = useCallback(
    async (data: {
      chatId: string;
      versionId?: string;
      previewUrl?: string;
      onlySelectVersionIfWasLatest?: boolean;
    }) => {
      const normalized = pendingInstructionsRef.current?.trim() || "";
      const shouldApplyOnce = pendingInstructionsOnceRef.current ?? applyInstructionsOnce;
      if (data.versionId) {
        if (data.onlySelectVersionIfWasLatest) {
          const sel = selectedVersionIdRef.current;
          const latest = latestVersionIdRef.current;
          const wasOnLatest = !sel || sel === latest;
          if (wasOnLatest) setSelectedVersionId(data.versionId);
        } else {
          setSelectedVersionId(data.versionId);
        }
      }
      if (data.chatId) {
        if (normalized && !shouldApplyOnce) {
          try {
            localStorage.setItem(`sajtmaskin:chatInstructions:${data.chatId}`, normalized);
          } catch {
            /* ignore */
          }
          setCustomInstructions(normalized);
        }
        pendingInstructionsRef.current = null;
        pendingInstructionsOnceRef.current = null;
        try {
          const onceKey = `sajtmaskin:chatInstructionsOnce:${data.chatId}`;
          if (shouldApplyOnce) {
            localStorage.removeItem(onceKey);
          } else if (applyInstructionsOnce) {
            localStorage.setItem(onceKey, "true");
          } else {
            localStorage.removeItem(onceKey);
          }
        } catch {
          /* ignore */
        }
      }
      if (shouldApplyOnce && normalized) {
        setCustomInstructions("");
        setApplyInstructionsOnce(false);
        if (data.chatId) {
          try {
            localStorage.removeItem(`sajtmaskin:chatInstructions:${data.chatId}`);
          } catch {
            /* ignore */
          }
        }
        toast.success("Instruktioner användes för versionen och rensades.");
      }
      if (data.chatId && data.versionId) {
        const { chatId: completedChatId, versionId } = data;
        validateCss(completedChatId, versionId)
          .then((result) => {
            if (!result) return;
            const errorCount = result.issues.reduce(
              (sum, file) => sum + file.issues.filter((i) => i.severity === "error").length,
              0,
            );
            const warningCount = result.issues.reduce(
              (sum, file) => sum + file.issues.filter((i) => i.severity === "warning").length,
              0,
            );
            if (errorCount > 0 || warningCount > 0) {
              void persistVersionErrorLogs(completedChatId, versionId, [
                {
                  level: errorCount > 0 ? "error" : "warning",
                  category: "css",
                  message: errorCount > 0 ? "CSS errors detected after validation." : "CSS warnings detected after validation.",
                  meta: {
                    errorCount,
                    warningCount,
                    fixed: Boolean(result.fixed),
                    previewUrl: result.previewUrl ?? null,
                    files: result.issues.map((f) => ({ fileName: f.fileName, issueCount: f.issues.length })),
                  },
                },
              ]);
            }
            if (errorCount > 0 && !result.fixed) {
              triggerAutoFix({
                chatId: completedChatId,
                versionId,
                reasons: ["css errors"],
                meta: { errorCount, warningCount },
              });
            }
          })
          .catch((err) => {
            debugLog("builder", "CSS validation failed", err);
            void persistVersionErrorLogs(completedChatId, versionId, [
              {
                level: "error",
                category: "css",
                message: "CSS validation failed.",
                meta: { error: err instanceof Error ? err.message : String(err) },
              },
            ]);
          });
        fetch(`${engineChatBaseUrl(completedChatId)}/normalize-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId, autoFix: true }),
        })
          .then(async (res) => {
            const payload = (await res.json().catch(() => null)) as {
              normalized?: boolean;
              changed?: boolean;
              changedFiles?: number;
              replacements?: number;
              fixed?: boolean;
              previewUrl?: string | null;
              error?: string;
            } | null;
            if (!res.ok) throw new Error(payload?.error || "Unicode normalization failed");
            if (payload?.changed) {
              void persistVersionErrorLogs(completedChatId, versionId, [
                {
                  level: "info",
                  category: "unicode",
                  message: "Unicode escapes normalized.",
                  meta: {
                    changedFiles: payload.changedFiles ?? 0,
                    replacements: payload.replacements ?? 0,
                    fixed: Boolean(payload.fixed),
                    previewUrl: payload.previewUrl ?? null,
                  },
                },
              ]);
            }
          })
          .catch((err) => {
            debugLog("builder", "Unicode normalization failed", err);
            void persistVersionErrorLogs(completedChatId, versionId, [
              {
                level: "warning",
                category: "unicode",
                message: "Unicode normalization failed.",
                meta: { error: err instanceof Error ? err.message : String(err) },
              },
            ]);
          });
        const donePreview = readPreviewUrl(data);
        if (!donePreview) {
          setTimeout(() => {
            mutateChat();
            mutateVersions();
          }, 4000);
        }
      }
      if (appProjectId && data.chatId) {
        const persistedPreview = readPreviewUrl(data);
        saveProjectData(appProjectId, {
          chatId: data.chatId,
          ...(persistedPreview ? { previewUrl: persistedPreview } : {}),
        }).catch((error) => {
          debugLog("builder", "Failed to save project chat mapping", error);
        });
      }
    },
    [
      applyInstructionsOnce,
      validateCss,
      appProjectId,
      mutateChat,
      mutateVersions,
      persistVersionErrorLogs,
      triggerAutoFix,
      pendingInstructionsRef,
      pendingInstructionsOnceRef,
      setSelectedVersionId,
      setCustomInstructions,
      setApplyInstructionsOnce,
      selectedVersionIdRef,
      latestVersionIdRef,
    ],
  );

  const fetchHealthFeatures = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/health", { signal });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      features?: { vercelBlob?: boolean; imageGenerations?: boolean };
      featureReasons?: {
        vercelBlob?: string | null;
        imageGenerations?: string | null;
      };
    } | null;
    return {
      blobEnabled: Boolean(data?.features?.vercelBlob),
      /** Own-engine: OPENAI_API_KEY — prompt image-generation instructions. */
      imageGenerationsEnabled: Boolean(data?.features?.imageGenerations),
      reasons: data?.featureReasons ?? {},
    };
  }, []);

  return {
    handleOpenDeployDialog,
    handleDomainSearch,
    deployActiveVersionToVercel,
    handleConfirmDeploy,
    republishWithFix,
    isRepublishRepairing,
    handleGenerationComplete,
    fetchHealthFeatures,
    persistVersionErrorLogs,
    triggerAutoFix,
  };
}
