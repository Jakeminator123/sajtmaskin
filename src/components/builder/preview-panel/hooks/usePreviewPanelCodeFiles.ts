"use client";

import { patchEngineChatFile } from "@/lib/builder/engine-files-patch";
import { buildFileTree } from "@/lib/builder/fileTree";
import type { FileNode } from "@/lib/builder/types";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchChatVersionFilesJson } from "../chat-version-files-fetch";
import {
  findFileNodeByPath,
  findFirstFileInTree,
  getPreferredFilePath,
} from "../code-file-tree-utils";
import { updateFileTreeContent } from "../update-file-tree-content";

export function usePreviewPanelCodeFiles(options: {
  isCodeView: boolean;
  chatId: string | null;
  versionId: string | null;
  refreshToken: number | undefined;
  onFilesSaved?: (info?: {
    versionId?: string;
    previewUrl?: string | null;
    previewSessionId?: string | null;
    previewMode?: string | null;
  }) => void;
}): {
  files: FileNode[];
  setFiles: Dispatch<SetStateAction<FileNode[]>>;
  selectedPath: string | null;
  setSelectedPath: Dispatch<SetStateAction<string | null>>;
  filesLoading: boolean;
  filesError: string | null;
  saveSelectedFileContent: (nextContent: string) => Promise<boolean>;
} {
  const { isCodeView, chatId, versionId, refreshToken, onFilesSaved } = options;

  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  // Fast Edit Lane: each quick-edit save creates a NEW minor version. The next
  // save must chain off that new version, but the `versionId` prop only updates
  // after the parent re-renders. This ref bridges the gap so back-to-back saves
  // build v3 -> v3.1 -> v3.2 instead of forking twice from the stale base v3
  // (which would silently drop the first save). Re-synced whenever the selected
  // version prop changes.
  const baseVersionRef = useRef<string | null>(versionId);
  const [filesError, setFilesError] = useState<string | null>(null);

  useEffect(() => {
    baseVersionRef.current = versionId;
  }, [versionId]);

  useEffect(() => {
    if (!isCodeView || !chatId || !versionId) return;
    let isActive = true;
    const controller = new AbortController();
    const loadFiles = async () => {
      setFilesLoading(true);
      setFilesError(null);
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, versionId, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(data?.error || `Failed to fetch files (HTTP ${response.status})`);
        }
        const flatFiles: Array<{ name: string; content: string; locked?: boolean }> = Array.isArray(
          data?.files,
        )
          ? data.files.map((f) => ({
              name: f.name,
              content: f.content ?? "",
              locked: f.locked,
            }))
          : [];
        const tree = buildFileTree(flatFiles);
        const preferredPath = getPreferredFilePath(flatFiles);
        const preferredNode =
          (preferredPath && findFileNodeByPath(tree, preferredPath)) || findFirstFileInTree(tree);
        if (!isActive) return;
        setFiles(tree);
        setSelectedPath(preferredNode?.path || null);
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setFilesError(error instanceof Error ? error.message : "Kunde inte hämta filer");
      } finally {
        if (isActive) setFilesLoading(false);
      }
    };
    void loadFiles();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [isCodeView, chatId, versionId, refreshToken]);

  const saveSelectedFileContent = useCallback(
    async (nextContent: string) => {
      if (!chatId || !versionId) {
        throw new Error("Ingen aktiv fil att spara.");
      }
      const selectedFile = selectedPath ? findFileNodeByPath(files, selectedPath) : null;
      if (!selectedFile) {
        throw new Error("Ingen aktiv fil att spara.");
      }

      const currentContent = selectedFile.content || "";
      if (nextContent === currentContent) return false;

      try {
        const baseVersionId = baseVersionRef.current ?? versionId;
        const saved = await patchEngineChatFile({
          chatId,
          versionId: baseVersionId,
          fileName: selectedFile.path,
          content: nextContent,
        });
        if (!saved.ok) {
          throw new Error(saved.error || "Kunde inte spara filinnehåll");
        }
        // Chain the next save off the version we just created (if any).
        if (saved.versionId) {
          baseVersionRef.current = saved.versionId;
        }

        setFiles((prev) => updateFileTreeContent(prev, selectedFile.path, nextContent));
        onFilesSaved?.({
          versionId: saved.versionId,
          previewUrl: saved.previewUrl,
          previewSessionId: saved.previewSessionId,
          previewMode: saved.previewMode,
        });
        return true;
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Kunde inte spara filinnehåll",
        );
      }
    },
    [chatId, versionId, files, selectedPath, onFilesSaved],
  );

  return {
    files,
    setFiles,
    selectedPath,
    setSelectedPath,
    filesLoading,
    filesError,
    saveSelectedFileContent,
  };
}
