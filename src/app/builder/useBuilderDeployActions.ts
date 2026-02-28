"use client";

import type { DomainSearchResult } from "@/components/builder/DomainSearchDialog";
import type { ImageAssetStrategy } from "@/lib/imageAssets";
import { saveProjectData, updateProject } from "@/lib/project-client";
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import toast from "react-hot-toast";

type Args = {
  chatId: string | null;
  activeVersionId: string | null;
  isDeploying: boolean;
  isMediaEnabled: boolean;
  enableBlobMedia: boolean;
  domainQuery: string;
  deployNameInput: string;
  isDeployNameSaving: boolean;
  appProjectId: string | null;
  appProjectName: string | null;
  applyInstructionsOnce: boolean;
  pendingSpecRef: MutableRefObject<object | null>;
  pendingInstructionsRef: MutableRefObject<string | null>;
  pendingInstructionsOnceRef: MutableRefObject<boolean | null>;
  setIsDeploying: Dispatch<SetStateAction<boolean>>;
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
    demoUrl?: string | null;
  } | null>;
};

export function useBuilderDeployActions({
  chatId,
  activeVersionId,
  isDeploying,
  isMediaEnabled,
  enableBlobMedia,
  domainQuery,
  deployNameInput,
  isDeployNameSaving,
  appProjectId,
  appProjectName,
  applyInstructionsOnce,
  pendingSpecRef,
  pendingInstructionsRef,
  pendingInstructionsOnceRef,
  setIsDeploying,
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
    setDeployNameInput(resolveSuggestedProjectName());
    setDeployNameDialogOpen(true);
  }, [resolveSuggestedProjectName, setDeployNameError, setDeployNameInput, setDeployNameDialogOpen]);

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

  const deployActiveVersionToVercel = useCallback(
    async (target: "production" | "preview" = "production", projectName?: string) => {
      if (!chatId) {
        toast.error("No chat selected");
        return;
      }
      if (!activeVersionId) {
        toast.error("No version selected");
        return;
      }
      if (isDeploying) return;

      setIsDeploying(true);
      try {
        const wantsBlob = enableBlobMedia;
        const resolvedStrategy: ImageAssetStrategy =
          wantsBlob && isMediaEnabled ? "blob" : "external";
        if (wantsBlob && !isMediaEnabled) {
          toast.error("Blob storage saknas – deploy körs med externa bild-URL:er.");
        }

        const response = await fetch("/api/v0/deployments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            versionId: activeVersionId,
            target,
            imageStrategy: resolvedStrategy,
            ...(projectName?.trim() ? { projectName: projectName.trim() } : {}),
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            data?.error || data?.message || `Deploy failed (HTTP ${response.status})`,
          );
        }

        const rawUrl = typeof data?.url === "string" ? data.url : null;
        const url = rawUrl ? (rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`) : null;

        toast.success(url ? "Deployment started (Vercel building...)" : "Deployment started");
        if (url) {
          toast(
            `Vercel URL: ${url}`,
            { duration: 15000 },
          );
        }
      } catch (error) {
        console.error("Deploy error:", error);
        toast.error(error instanceof Error ? error.message : "Failed to deploy");
      } finally {
        setIsDeploying(false);
      }
    },
    [chatId, activeVersionId, isDeploying, isMediaEnabled, enableBlobMedia, setIsDeploying],
  );

  const handleConfirmDeploy = useCallback(async () => {
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
        console.warn("[Builder] Failed to update project name:", error);
        toast.error("Kunde inte uppdatera projektnamn.");
      } finally {
        setIsDeployNameSaving(false);
      }
    }

    await deployActiveVersionToVercel("production", nextName);
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
          `/api/v0/chats/${encodeURIComponent(errChatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logs }),
          },
        );
      } catch (error) {
        console.warn("[Builder] Failed to persist version error logs:", error);
      }
    },
    [],
  );

  const triggerAutoFix = useCallback((payload: {
    chatId: string;
    versionId: string;
    reasons: string[];
    meta?: Record<string, unknown>;
  }) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("sajtmaskin:auto-fix", { detail: payload }));
  }, []);

  const handleGenerationComplete = useCallback(
    async (data: { chatId: string; versionId?: string; demoUrl?: string }) => {
      const normalized = pendingInstructionsRef.current?.trim() || "";
      const shouldApplyOnce = pendingInstructionsOnceRef.current ?? applyInstructionsOnce;
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
      if (pendingSpecRef.current && data.chatId && data.versionId) {
        try {
          const specContent = JSON.stringify(pendingSpecRef.current, null, 2);
          pendingSpecRef.current = null;
          fetch(`/api/v0/chats/${encodeURIComponent(data.chatId)}/files`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              versionId: data.versionId,
              files: [{ name: "sajtmaskin.spec.json", content: specContent, locked: true }],
            }),
          }).catch((err) => {
            console.warn("[Spec] Failed to push spec file:", err);
          });
        } catch (err) {
          console.warn("[Spec] Failed to serialize spec:", err);
          pendingSpecRef.current = null;
        }
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
                    demoUrl: result.demoUrl ?? null,
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
            console.warn("[CSS Validation] Failed:", err);
            void persistVersionErrorLogs(completedChatId, versionId, [
              {
                level: "error",
                category: "css",
                message: "CSS validation failed.",
                meta: { error: err instanceof Error ? err.message : String(err) },
              },
            ]);
          });
        fetch(`/api/v0/chats/${encodeURIComponent(completedChatId)}/normalize-text`, {
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
              demoUrl?: string | null;
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
                    demoUrl: payload.demoUrl ?? null,
                  },
                },
              ]);
            }
          })
          .catch((err) => {
            console.warn("[Unicode Normalize] Failed:", err);
            void persistVersionErrorLogs(completedChatId, versionId, [
              {
                level: "warning",
                category: "unicode",
                message: "Unicode normalization failed.",
                meta: { error: err instanceof Error ? err.message : String(err) },
              },
            ]);
          });
        if (!data.demoUrl) {
          setTimeout(() => {
            mutateChat();
            mutateVersions();
          }, 4000);
        }
      }
      if (appProjectId && data.chatId) {
        saveProjectData(appProjectId, {
          chatId: data.chatId,
          demoUrl: data.demoUrl ?? undefined,
        }).catch((error) => {
          console.warn("[Builder] Failed to save project chat mapping:", error);
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
      pendingSpecRef,
      pendingInstructionsRef,
      pendingInstructionsOnceRef,
      setCustomInstructions,
      setApplyInstructionsOnce,
    ],
  );

  const fetchHealthFeatures = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/health", { signal });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      features?: { vercelBlob?: boolean; v0?: boolean };
      featureReasons?: { vercelBlob?: string | null; v0?: string | null };
    } | null;
    return {
      blobEnabled: Boolean(data?.features?.vercelBlob),
      v0Enabled: Boolean(data?.features?.v0),
      reasons: data?.featureReasons ?? {},
    };
  }, []);

  return {
    handleOpenDeployDialog,
    handleDomainSearch,
    deployActiveVersionToVercel,
    handleConfirmDeploy,
    handleGenerationComplete,
    fetchHealthFeatures,
    persistVersionErrorLogs,
    triggerAutoFix,
  };
}
