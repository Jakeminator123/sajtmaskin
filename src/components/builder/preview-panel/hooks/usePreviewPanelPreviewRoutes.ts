import { useCallback, useEffect, useState } from "react";
import { isShellPageContent } from "@/lib/gen/build-spec";
import { fetchChatVersionFilesJson } from "../chat-version-files-fetch";
import type { ChatVersionFilesApiRow } from "../chat-version-files-fetch";
import {
  extractPreviewRoutesFromFileNames,
  routePathFromPageFileName,
} from "../preview-route-helpers";

/**
 * Loads derived Next/Pages routes from the active chat version file list (for preview chrome).
 * Also detects shell routes (deferred, one-click build) so chrome can render a
 * "Build" affordance next to them.
 */
export function usePreviewPanelPreviewRoutes(
  chatId: string | null,
  versionId: string | null,
): {
  previewRoutes: string[];
  previewRoutesLoading: boolean;
  shellRoutePaths: string[];
  fetchPreviewRoutes: () => Promise<void>;
} {
  const [previewRoutes, setPreviewRoutes] = useState<string[]>([]);
  const [shellRoutePaths, setShellRoutePaths] = useState<string[]>([]);
  const [previewRoutesLoading, setPreviewRoutesLoading] = useState(false);

  const applyFiles = useCallback((files: ChatVersionFilesApiRow[]) => {
    const fileNames = files.map((file) => file.name);
    setPreviewRoutes(extractPreviewRoutesFromFileNames(fileNames));

    const shells = new Set<string>();
    for (const file of files) {
      if (!file.content || !isShellPageContent(file.content)) continue;
      const path = routePathFromPageFileName(file.name);
      if (path) shells.add(path);
    }
    setShellRoutePaths(Array.from(shells));
  }, []);

  const fetchPreviewRoutes = useCallback(async () => {
    if (!chatId || !versionId) {
      setPreviewRoutes([]);
      setShellRoutePaths([]);
      return;
    }

    setPreviewRoutesLoading(true);
    try {
      const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
      if (!response.ok) {
        setPreviewRoutes([]);
        setShellRoutePaths([]);
        return;
      }
      const files = Array.isArray(data?.files) ? data.files : [];
      applyFiles(files);
    } catch {
      setPreviewRoutes([]);
      setShellRoutePaths([]);
    } finally {
      setPreviewRoutesLoading(false);
    }
  }, [chatId, versionId, applyFiles]);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      if (!chatId || !versionId) {
        setPreviewRoutes([]);
        setShellRoutePaths([]);
        return;
      }
      setPreviewRoutesLoading(true);
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
        if (!isActive) return;
        if (!response.ok) {
          setPreviewRoutes([]);
          setShellRoutePaths([]);
          return;
        }
        const files = Array.isArray(data?.files) ? data.files : [];
        applyFiles(files);
      } catch {
        if (isActive) {
          setPreviewRoutes([]);
          setShellRoutePaths([]);
        }
      } finally {
        if (isActive) setPreviewRoutesLoading(false);
      }
    };

    void load();
    return () => { isActive = false; };
  }, [chatId, versionId, applyFiles]);

  return { previewRoutes, previewRoutesLoading, shellRoutePaths, fetchPreviewRoutes };
}
