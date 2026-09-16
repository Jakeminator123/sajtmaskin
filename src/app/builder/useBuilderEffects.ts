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

export function buildTemplateInitAttemptKey(
  projectId: string | null,
  templateId: string,
  tier: ModelTier,
): string {
  return `${projectId ?? ""}:${templateId}:${tier}`;
}

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
  // Object box so an in-flight request keeps the same counter that cleanup
  // increments. A remounted hook instance gets a new box; the discarded
  // request still sees its own box go stale.
  const generationBoxRef = useRef({ n: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const contextRef = useRef({
    templateId,
    appProjectId,
    chatId,
  });
  const contextEpochKeyRef = useRef<string | null>(null);
  contextRef.current = { templateId, appProjectId, chatId };

  const contextEpochKey = `${appProjectId ?? ""}:${templateId ?? ""}:${chatId ?? ""}`;

  useEffect(() => {
    if (templateId) return;
    templateInitAttemptKeyRef.current = null;
    setTemplateInitError(null);
  }, [templateId, templateInitAttemptKeyRef]);

  useEffect(() => {
    const generationBox = generationBoxRef.current;
    const previous = contextEpochKeyRef.current;
    contextEpochKeyRef.current = contextEpochKey;
    if (previous !== null && previous !== contextEpochKey) {
      abortRef.current?.abort();
      abortRef.current = null;
      generationBox.n += 1;
      templateInitAttemptKeyRef.current = null;
      setTemplateInitError(null);
      setIsTemplateLoading(false);
    }
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      generationBox.n += 1;
      templateInitAttemptKeyRef.current = null;
    };
  }, [contextEpochKey, templateInitAttemptKeyRef, setIsTemplateLoading]);

  const runTemplateInit = useCallback(async () => {
    if (!templateId) return;
    const started = {
      templateId,
      appProjectId,
      generation: ++generationBoxRef.current.n,
    };
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const isCurrent = () => {
      if (started.generation !== generationBoxRef.current.n) return false;
      const current = contextRef.current;
      if (current.templateId !== started.templateId) return false;
      if ((current.appProjectId ?? null) !== (started.appProjectId ?? null)) return false;
      if (current.chatId) return false;
      return true;
    };

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
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Template init failed");
      }
      if (!isCurrent()) return;

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
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Template init failed";
      console.error("[Builder] Template init failed:", error);
      if (!isCurrent()) return;
      setTemplateInitError(message);
      toast.error(message);
      // Keep `templateId` in the URL on failure so this stays a template
      // entry: the send path (useBuilderPromptActions) then blocks a blank
      // from-scratch init that would silently discard the template, and
      // «Försök igen» re-runs this import against the same server key.
      // Repeated AUTO-init loops are already prevented by
      // `templateInitAttemptKeyRef`.
    } finally {
      if (started.generation === generationBoxRef.current.n) {
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
    const initKey = buildTemplateInitAttemptKey(appProjectId, templateId, selectedModelTier);
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
    appProjectId,
    runTemplateInit,
    templateInitAttemptKeyRef,
  ]);

  const retryTemplateInit = useCallback(() => {
    if (!templateId || chatId) return;
    const initKey = buildTemplateInitAttemptKey(appProjectId, templateId, selectedModelTier);
    templateInitAttemptKeyRef.current = initKey;
    void runTemplateInit();
  }, [
    templateId,
    chatId,
    selectedModelTier,
    appProjectId,
    runTemplateInit,
    templateInitAttemptKeyRef,
  ]);

  return {
    templateInitError,
    retryTemplateInit,
  };
}
