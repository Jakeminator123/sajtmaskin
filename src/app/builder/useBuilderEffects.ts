"use client";

import { saveProjectData } from "@/lib/project-client";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import { MODEL_TIER_TO_QUALITY } from "./types";
import { isCompatibilityShimPreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
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
  useEffect(() => {
    if (templateId) return;
    templateInitAttemptKeyRef.current = null;
  }, [templateId, templateInitAttemptKeyRef]);

  useEffect(() => {
    if (!auditPromptLoaded) return;
    if (!templateId || chatId) return;
    if (isCreatingChat || isAnyStreaming) return;
    const initKey = `${templateId}:${selectedModelTier}`;
    if (templateInitAttemptKeyRef.current === initKey) return;
    templateInitAttemptKeyRef.current = initKey;
    let isActive = true;

    const initTemplate = async () => {
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
        if (!isActive) return;

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
        if (isActive) {
          toast.error(message);
          // Prevent repeated auto-init loops on failed template startup
          // (e.g. insufficient credits or temporary API errors).
          const params = new URLSearchParams(searchParams.toString());
          params.delete("templateId");
          const query = params.toString();
          router.replace(query ? `/builder?${query}` : "/builder");
        }
      } finally {
        if (isActive) {
          setIsTemplateLoading(false);
        }
      }
    };

    void initTemplate();
    return () => {
      isActive = false;
    };
  }, [
    auditPromptLoaded,
    templateId,
    chatId,
    isCreatingChat,
    isAnyStreaming,
    router,
    selectedModelTier,
    appProjectId,
    applyAppProjectId,
    searchParams,
    setChatId,
    setCurrentPreviewUrl,
    setIsTemplateLoading,
    templateInitAttemptKeyRef,
  ]);
}
