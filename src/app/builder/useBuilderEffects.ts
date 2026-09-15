"use client";

import { saveProjectData } from "@/lib/projects/project-client";
import type { ModelTier } from "@/lib/validations/chat-schemas";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { MODEL_TIER_TO_QUALITY } from "./types";
import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import { normalizePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import { readPreviewUrl } from "@/lib/api/preview-url-contract";

type UseBuilderEffectsArgs = {
  auditPromptLoaded: boolean;
  templateId: string | null;
  chatId: string | null;
  isCreatingChat: boolean;
  isAnyStreaming: boolean;
  selectedModelTier: ModelTier;
  appProjectId: string | null;
  applyAppProjectId: (nextProjectId: string | null, options?: { chatId?: string | null }) => void;
  searchParams: ReadonlyURLSearchParams;
  router: { replace: (url: string) => void };
  setChatId: Dispatch<SetStateAction<string | null>>;
  setCurrentPreviewUrl: Dispatch<SetStateAction<string | null>>;
  setIsTemplateLoading: Dispatch<SetStateAction<boolean>>;
  templateInitAttemptKeyRef: MutableRefObject<string | null>;
};

export function useBuilderEffects({
  auditPromptLoaded,
  templateId,
  chatId,
  isCreatingChat,
  isAnyStreaming,
  selectedModelTier,
  appProjectId,
  applyAppProjectId,
  searchParams,
  router,
  setChatId,
  setCurrentPreviewUrl,
  setIsTemplateLoading,
  templateInitAttemptKeyRef,
}: UseBuilderEffectsArgs) {
  const [templateInitError, setTemplateInitError] = useState<string | null>(null);
  const runGenerationRef = useRef(0);

  useEffect(() => {
    if (templateId) return;
    templateInitAttemptKeyRef.current = null;
    setTemplateInitError(null);
  }, [templateId, templateInitAttemptKeyRef]);

  const runTemplateInit = useCallback(async () => {
    if (!templateId) return;
    const generation = ++runGenerationRef.current;
    setTemplateInitError(null);
    setIsTemplateLoading(true);
    try {
      const quality = MODEL_TIER_TO_QUALITY[selectedModelTier] || "max";
      const response = await fetch("/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          quality,
          ...(appProjectId ? { projectId: appProjectId } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Template init failed");
      }
      if (runGenerationRef.current !== generation) return;

      if (data?.chatId) {
        setChatId(data.chatId);
        if (appProjectId) {
          applyAppProjectId(appProjectId, { chatId: data.chatId });
        } else {
          const params = new URLSearchParams(searchParams.toString());
          params.set("chatId", data.chatId);
          router.replace(`/builder?${params.toString()}`);
        }
      }
      const templatePreview = readPreviewUrl(data as { previewUrl?: unknown });
      if (templatePreview) {
        const n = normalizePreviewUrl(templatePreview);
        if (n && !isCompatibilityShimPreviewUrl(n)) {
          setCurrentPreviewUrl(n);
        }
      }
      // Advisory from the server: the import succeeded but the server-side
      // preview boot failed. The client still runs its own preview bootstrap
      // (useBuilderVmPreview) once chatId lands, so this is not necessarily
      // final — the copy says a retry happens automatically instead of
      // claiming a definitive failure (bugbot medium på #458). Panelens
      // empty-state äger det slutgiltiga felläget om även retryn failar.
      if (data?.previewStartFailed) {
        toast.warning(
          "Templaten importerades, men förhandsvisningen startade inte på första försöket. Ett nytt försök görs automatiskt — ladda om sidan om panelen förblir tom.",
        );
      }
      if (data?.chatId && appProjectId) {
        saveProjectData(appProjectId, {
          chatId: data.chatId,
          ...(templatePreview ? { previewUrl: templatePreview } : {}),
        }).catch((error) => {
          console.warn("[Builder] Failed to save template project mapping:", error);
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Template init failed";
      console.error("[Builder] Template init failed:", error);
      if (runGenerationRef.current !== generation) return;
      setTemplateInitError(message);
      toast.error(message);
      // Keep `templateId` in the URL on failure so this stays a template
      // entry: the send path (useBuilderPromptActions) then blocks a blank
      // from-scratch init that would silently discard the template, and
      // «Försök igen» re-runs this import against the same server key.
      // Repeated AUTO-init loops are already prevented by
      // `templateInitAttemptKeyRef`.
    } finally {
      if (runGenerationRef.current === generation) {
        setIsTemplateLoading(false);
      }
    }
  }, [
    templateId,
    selectedModelTier,
    appProjectId,
    applyAppProjectId,
    searchParams,
    router,
    setChatId,
    setCurrentPreviewUrl,
    setIsTemplateLoading,
  ]);

  useEffect(() => {
    if (!auditPromptLoaded) return;
    if (!templateId || chatId) return;
    if (isCreatingChat || isAnyStreaming) return;
    const initKey = `${templateId}:${selectedModelTier}`;
    if (templateInitAttemptKeyRef.current === initKey) return;
    templateInitAttemptKeyRef.current = initKey;
    void runTemplateInit();
  }, [
    auditPromptLoaded,
    templateId,
    chatId,
    isCreatingChat,
    isAnyStreaming,
    selectedModelTier,
    runTemplateInit,
    templateInitAttemptKeyRef,
  ]);

  const retryTemplateInit = useCallback(() => {
    if (!templateId || chatId) return;
    const initKey = `${templateId}:${selectedModelTier}`;
    templateInitAttemptKeyRef.current = initKey;
    void runTemplateInit();
  }, [templateId, chatId, selectedModelTier, runTemplateInit, templateInitAttemptKeyRef]);

  return {
    templateInitError,
    retryTemplateInit,
  };
}
