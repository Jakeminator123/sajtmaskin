"use client";

import type { InspectorSelection } from "@/lib/builder/types";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import toast from "react-hot-toast";

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
  setInspectorSelection: Dispatch<SetStateAction<InspectorSelection | null>>;
  setInspectorClearToken: Dispatch<SetStateAction<number>>;
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
  setInspectorSelection,
  setInspectorClearToken,
  setIsVersionPanelCollapsed,
}: UseBuilderCallbacksArgs) {
  const handleClearPreview = useCallback(() => {
    setCurrentDemoUrl(null);
  }, [setCurrentDemoUrl]);

  const clearInspectorSelection = useCallback(() => {
    setInspectorSelection(null);
    setInspectorClearToken(Date.now());
  }, [setInspectorSelection, setInspectorClearToken]);

  const handleFixPreview = useCallback(async () => {
    if (!chatId) {
      toast.error("Ingen chat att reparera ännu.");
      return;
    }
    const prompt = currentDemoUrl
      ? "Preview verkar vara fel eller laddar inte. Fixa versionen och returnera en fungerande demoUrl. Behåll layouten om möjligt. Om du använder Dialog, säkerställ att DialogTitle och DialogDescription finns (sr-only ok) eller att aria-describedby är korrekt."
      : "Preview-länk saknas. Regenerera senaste versionen så att en demoUrl returneras. Om du använder Dialog, säkerställ att DialogTitle och DialogDescription finns (sr-only ok) eller att aria-describedby är korrekt.";
    await sendMessage(prompt);
  }, [chatId, currentDemoUrl, sendMessage]);

  const handleVersionSelect = useCallback(
    (versionId: string) => {
      setSelectedVersionId(versionId);
      const match = effectiveVersionsList.find(
        (version) => version.versionId === versionId || version.id === versionId,
      );
      if (match?.demoUrl) {
        setCurrentDemoUrl(match.demoUrl);
        bumpPreviewRefreshToken();
      }
    },
    [effectiveVersionsList, bumpPreviewRefreshToken, setCurrentDemoUrl, setSelectedVersionId],
  );

  const handleToggleVersionPanel = useCallback(() => {
    setIsVersionPanelCollapsed((prev) => !prev);
  }, [setIsVersionPanelCollapsed]);

  return {
    handleClearPreview,
    clearInspectorSelection,
    handleFixPreview,
    handleVersionSelect,
    handleToggleVersionPanel,
  };
}
