"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  isCompatibilityShimPreviewUrl,
  isSandboxPreviewUrl,
  normalizePreviewUrl,
} from "@/lib/gen/preview";

export type VersionLike = {
  versionId?: string | null;
  id?: string | null;
  demoUrl?: string | null;
  legacyShimPreviewUrl?: string | null;
  sandboxUrl?: string | null;
  /** Own-engine list uses `false`; legacy mapped V0 DB rows use `true`. */
  canPin?: boolean;
  versionNumber?: number | null;
  releaseState?: string | null;
  verificationState?: string | null;
};

function isOwnEngineVersionRow(v: VersionLike | undefined): boolean {
  if (!v) return false;
  if (v.canPin === true) return false;
  if (v.canPin === false) return true;
  return (
    typeof v.versionNumber === "number" ||
    Boolean(v.releaseState) ||
    Boolean(v.verificationState)
  );
}

function pickEngineIframeUrl(match: VersionLike, explicitDemo?: string | null): string | null {
  const fromSandbox = normalizePreviewUrl(match.sandboxUrl);
  if (fromSandbox && isSandboxPreviewUrl(fromSandbox)) {
    return fromSandbox;
  }
  const explicit = normalizePreviewUrl(explicitDemo);
  if (explicit && !isCompatibilityShimPreviewUrl(explicit) && isSandboxPreviewUrl(explicit)) {
    return explicit;
  }
  return null;
}

type UseBuilderCallbacksArgs = {
  chatId: string | null;
  currentPreviewUrl: string | null;
  sendMessage: (message: string) => Promise<void>;
  effectiveVersionsList: VersionLike[];
  bumpPreviewRefreshToken: () => void;
  setCurrentPreviewUrl: Dispatch<SetStateAction<string | null>>;
  setSelectedVersionId: Dispatch<SetStateAction<string | null>>;
  setIsVersionPanelCollapsed: Dispatch<SetStateAction<boolean>>;
};

export function useBuilderCallbacks({
  chatId,
  currentPreviewUrl,
  sendMessage,
  effectiveVersionsList,
  bumpPreviewRefreshToken,
  setCurrentPreviewUrl,
  setSelectedVersionId,
  setIsVersionPanelCollapsed,
}: UseBuilderCallbacksArgs) {
  const handleClearPreview = useCallback(() => {
    setCurrentPreviewUrl(null);
  }, [setCurrentPreviewUrl]);

  const handleFixPreview = useCallback(async () => {
    if (!chatId) {
      toast.error("Ingen chat att reparera ännu.");
      return;
    }
    const prompt = currentPreviewUrl
      ? "Preview verkar vara fel eller laddar inte. Fixa versionen och returnera en fungerande sandbox-preview (sandboxUrl). Behåll layouten om möjligt. Om du använder Dialog, säkerställ att DialogTitle och DialogDescription finns (sr-only ok) eller att aria-describedby är korrekt."
      : "Sandbox-preview saknas eller laddar inte. Regenerera eller starta om preview för senaste versionen. Om du använder Dialog, säkerställ att DialogTitle och DialogDescription finns (sr-only ok) eller att aria-describedby är korrekt.";
    await sendMessage(prompt);
  }, [chatId, currentPreviewUrl, sendMessage]);

  const handleVersionSelect = useCallback(
    (versionId: string, demoUrl?: string) => {
      setSelectedVersionId(versionId);
      const match = effectiveVersionsList.find(
        (version) => version.versionId === versionId || version.id === versionId,
      );

      if (isOwnEngineVersionRow(match)) {
        const next = pickEngineIframeUrl(match!, demoUrl);
        if (next) {
          setCurrentPreviewUrl(next);
          bumpPreviewRefreshToken();
          return;
        }
        setCurrentPreviewUrl(null);
        bumpPreviewRefreshToken();
        return;
      }

      const explicit = normalizePreviewUrl(demoUrl);
      if (explicit) {
        setCurrentPreviewUrl(explicit);
        bumpPreviewRefreshToken();
        return;
      }
      const legacy = normalizePreviewUrl(match?.demoUrl);
      if (legacy) {
        setCurrentPreviewUrl(legacy);
        bumpPreviewRefreshToken();
      }
    },
    [effectiveVersionsList, bumpPreviewRefreshToken, setCurrentPreviewUrl, setSelectedVersionId],
  );

  const handleToggleVersionPanel = useCallback(() => {
    setIsVersionPanelCollapsed((prev) => !prev);
  }, [setIsVersionPanelCollapsed]);

  return {
    handleClearPreview,
    handleFixPreview,
    handleVersionSelect,
    handleToggleVersionPanel,
  };
}
