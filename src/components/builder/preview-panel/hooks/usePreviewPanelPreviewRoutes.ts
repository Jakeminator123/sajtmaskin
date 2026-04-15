import { useCallback, useEffect, useState } from "react";
import { fetchChatVersionFilesJson } from "../chat-version-files-fetch";
import { extractPreviewRoutesFromFileNames } from "../preview-route-helpers";

/**
 * Loads derived Next/Pages routes from the active chat version file list (for preview chrome).
 */
export function usePreviewPanelPreviewRoutes(
  chatId: string | null,
  versionId: string | null,
): {
  previewRoutes: string[];
  previewRoutesLoading: boolean;
  fetchPreviewRoutes: () => Promise<void>;
} {
  const [previewRoutes, setPreviewRoutes] = useState<string[]>([]);
  const [previewRoutesLoading, setPreviewRoutesLoading] = useState(false);

  const fetchPreviewRoutes = useCallback(async () => {
    if (!chatId || !versionId) {
      setPreviewRoutes([]);
      return;
    }

    setPreviewRoutesLoading(true);
    try {
      const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
      if (!response.ok) {
        setPreviewRoutes([]);
        return;
      }
      const fileNames = Array.isArray(data?.files) ? data.files.map((file) => file.name) : [];
      setPreviewRoutes(extractPreviewRoutesFromFileNames(fileNames));
    } catch {
      setPreviewRoutes([]);
    } finally {
      setPreviewRoutesLoading(false);
    }
  }, [chatId, versionId]);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      if (!chatId || !versionId) {
        setPreviewRoutes([]);
        return;
      }
      setPreviewRoutesLoading(true);
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
        if (!isActive) return;
        if (!response.ok) {
          setPreviewRoutes([]);
          return;
        }
        const fileNames = Array.isArray(data?.files) ? data.files.map((file) => file.name) : [];
        setPreviewRoutes(extractPreviewRoutesFromFileNames(fileNames));
      } catch {
        if (isActive) setPreviewRoutes([]);
      } finally {
        if (isActive) setPreviewRoutesLoading(false);
      }
    };

    void load();
    return () => { isActive = false; };
  }, [chatId, versionId]);

  return { previewRoutes, previewRoutesLoading, fetchPreviewRoutes };
}
