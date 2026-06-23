import { useEffect, useState } from "react";
import { fetchChatVersionFilesJson } from "../chat-version-files-fetch";
import { derivePreviewRoutes, type PreviewRouteInfo } from "../preview-route-helpers";

/**
 * Loads page routes from the active chat version files (for preview chrome
 * tabs). Each route carries a `reachable` flag (linked from nav vs orphan);
 * orphan/unlinked routes are listed too (with a badge + remove control) so a
 * page added without an auto-linked nav entry stays visible and orphan files
 * stay removable — see `derivePreviewRoutes`.
 *
 * `refreshToken` is part of the dependency set so the tab list re-derives after
 * an add/remove page edit that keeps the same selected version id, and the
 * fetch is `no-store` so a reused `?versionId=` URL never serves a stale list.
 */
export function usePreviewPanelPreviewRoutes(
  chatId: string | null,
  versionId: string | null,
  refreshToken?: number,
): {
  previewRoutes: PreviewRouteInfo[];
  previewRoutesLoading: boolean;
} {
  const [previewRoutes, setPreviewRoutes] = useState<PreviewRouteInfo[]>([]);
  const [previewRoutesLoading, setPreviewRoutesLoading] = useState(false);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      if (!chatId || !versionId) {
        setPreviewRoutes([]);
        return;
      }
      setPreviewRoutesLoading(true);
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, versionId, {
          cache: "no-store",
        });
        if (!isActive) return;
        if (!response.ok) {
          setPreviewRoutes([]);
          return;
        }
        const files = Array.isArray(data?.files)
          ? data.files.map((file) => ({ name: file.name, content: file.content }))
          : [];
        setPreviewRoutes(derivePreviewRoutes(files));
      } catch {
        if (isActive) setPreviewRoutes([]);
      } finally {
        if (isActive) setPreviewRoutesLoading(false);
      }
    };

    void load();
    return () => { isActive = false; };
  }, [chatId, versionId, refreshToken]);

  return { previewRoutes, previewRoutesLoading };
}
