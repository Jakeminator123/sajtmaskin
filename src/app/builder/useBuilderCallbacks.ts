"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

type VersionLike = {
  versionId?: string | null;
  id?: string | null;
  demoUrl?: string | null;
};

type UseBuilderCallbacksArgs = {
  chatId: string | null;
  currentDemoUrl: string | null;
  sendMessage: (message: string) => Promise<void>;
  effectiveVersionsList: VersionLike[];
  bumpPreviewRefreshToken: () => void;
  setCurrentDemoUrl: Dispatch<SetStateAction<string | null>>;
  setSelectedVersionId: Dispatch<SetStateAction<string | null>>;
  setIsVersionPanelCollapsed: Dispatch<SetStateAction<boolean>>;
};

export function useBuilderCallbacks({
  chatId,
  currentDemoUrl,
  sendMessage,
  effectiveVersionsList,
  bumpPreviewRefreshToken,
  setCurrentDemoUrl,
  setSelectedVersionId,
  setIsVersionPanelCollapsed,
}: UseBuilderCallbacksArgs) {
  const handleClearPreview = useCallback(() => {
    setCurrentDemoUrl(null);
  }, [setCurrentDemoUrl]);

  const handleFixPreview = useCallback(async () => {
    if (!chatId) {
      toast.error("Ingen chat att reparera ännu.");
      return;
    }
    const prompt = currentDemoUrl
      ? "Preview verkar vara fel eller laddar inte. Fixa versionen och returnera en fungerande demoUrl. Behåll layouten om möjligt. Om du använder Dialog, säkerställ att DialogTitle och DialogDescription finns (sr-only ok) eller att aria-describedby är korrekt."
      : "Ingen runtime-previewlank finns just nu. Fixa bara koden om det finns verkliga build- eller runtimefel. Regenerera inte en fungerande statisk version enbart for att fa en demoUrl. Om du anvander Dialog, sakerstall att DialogTitle och DialogDescription finns (sr-only ok) eller att aria-describedby ar korrekt.";
    await sendMessage(prompt);
  }, [chatId, currentDemoUrl, sendMessage]);

  const handleVersionSelect = useCallback(
    (versionId: string, demoUrl?: string) => {
      setSelectedVersionId(versionId);
      if (demoUrl) {
        setCurrentDemoUrl(demoUrl);
        bumpPreviewRefreshToken();
        return;
      }
      const match = effectiveVersionsList.find(
        (version) => version.versionId === versionId || version.id === versionId,
      );
      setCurrentDemoUrl(match?.demoUrl ?? null);
      bumpPreviewRefreshToken();
    },
    [effectiveVersionsList, bumpPreviewRefreshToken, setCurrentDemoUrl, setSelectedVersionId],
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
