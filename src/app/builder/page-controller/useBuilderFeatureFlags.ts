"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";
import { toast } from "sonner";
import { debugLog } from "@/lib/utils/debug";

type HealthFeatureFlags = {
  blobEnabled: boolean;
  imageGenerationsEnabled: boolean;
  reasons: { vercelBlob?: string | null; imageGenerations?: string | null };
};

type Params = {
  fetchHealthFeatures: (signal?: AbortSignal) => Promise<HealthFeatureFlags | null>;
  featureWarnedRef: MutableRefObject<{ imageGen: boolean; blob: boolean }>;
  setEnableImageGenerations: Dispatch<SetStateAction<boolean>>;
  setIsImageGenerationsSupported: Dispatch<SetStateAction<boolean>>;
  setIsMediaEnabled: Dispatch<SetStateAction<boolean>>;
};

/**
 * Resolves the server's media/image-generation feature flags once per mount and
 * warns (once) when a capability the builder offers is turned off.
 */
export function useBuilderFeatureFlags({
  fetchHealthFeatures,
  featureWarnedRef,
  setEnableImageGenerations,
  setIsImageGenerationsSupported,
  setIsMediaEnabled,
}: Params) {
  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadImageStrategyDefault = async () => {
      try {
        const flags = await fetchHealthFeatures(controller.signal);
        if (!flags) return;
        const { blobEnabled, imageGenerationsEnabled, reasons } = flags;
        if (!isActive) return;
        setIsMediaEnabled(blobEnabled);
        setIsImageGenerationsSupported(imageGenerationsEnabled);
        if (!imageGenerationsEnabled) setEnableImageGenerations(false);
        if (!imageGenerationsEnabled && !featureWarnedRef.current.imageGen) {
          featureWarnedRef.current.imageGen = true;
          const reason = reasons?.imageGenerations || "AI-konfiguration saknas";
          toast.error(`Bildgenerering är avstängd: ${reason}`);
        }
        if (imageGenerationsEnabled && !blobEnabled && !featureWarnedRef.current.blob) {
          featureWarnedRef.current.blob = true;
          const reason = reasons?.vercelBlob || "BLOB_READ_WRITE_TOKEN saknas";
          toast(`Blob saknas: ${reason}. Bilder kan saknas i preview.`);
        }
        debugLog("AI", "Builder feature flags resolved", {
          imageGenerationsEnabled,
          blobEnabled,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    };

    loadImageStrategyDefault();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [fetchHealthFeatures, setIsMediaEnabled, setIsImageGenerationsSupported, setEnableImageGenerations, featureWarnedRef]);
}
