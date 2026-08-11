"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildAddNavLinkOps,
  buildNewPageContent,
  buildRemoveNavLinkOps,
  defaultLabelForRoute,
  detectAppDir,
  findRouteFilePaths,
  normalizePageRouteInput,
  pageFilePathForRoute,
  routeHasPageFile,
} from "@/lib/builder/preview-page-ops";
import {
  quickEditChatFiles,
  type QuickEditClientOp,
  type QuickEditClientResult,
} from "@/lib/builder/engine-files-patch";
import { fetchChatVersionFilesJson } from "../code/chat-version-files-fetch";
import type { PreviewPanelProps } from "../preview-panel-types";

type UsePreviewPanelPageActionsParams = {
  chatId: string | null | undefined;
  versionId: string | null | undefined;
  onFilesSaved?: PreviewPanelProps["onFilesSaved"];
};

export function usePreviewPanelPageActions({
  chatId,
  versionId,
  onFilesSaved,
}: UsePreviewPanelPageActionsParams) {
  const [pageOpBusy, setPageOpBusy] = useState(false);
  // Synchronous lock: `pageOpBusy` updates async, so two submits in the same
  // tick could both pass the guard and fork version history. The ref flips
  // immediately so the second call bails.
  const pageOpInFlightRef = useRef(false);

  // Quick-edit op cap (mirrors the route's zod `.max(50)`). Page removal of a
  // heavily colocated route can exceed it, so ops are chunked into sequential
  // minor versions chaining off each previous result.
  const QUICK_EDIT_OPS_PER_CALL = 50;
  const runQuickEditChunked = useCallback(
    async (
      activeChatId: string,
      baseVersionId: string,
      ops: QuickEditClientOp[],
      summary: string,
    ): Promise<QuickEditClientResult> => {
      let currentBase = baseVersionId;
      let last: QuickEditClientResult | null = null;
      for (let i = 0; i < ops.length; i += QUICK_EDIT_OPS_PER_CALL) {
        const slice = ops.slice(i, i + QUICK_EDIT_OPS_PER_CALL);
        const res = await quickEditChatFiles({
          chatId: activeChatId,
          baseVersionId: currentBase,
          // First chunk's base is the page op's base version; later chunks chain
          // off the previous result. Forwarding `currentBase` as latest-known
          // means the stale-base 409 only fires when another writer advanced the
          // head past our base, never on our own chain.
          engineLatestKnownVersionId: currentBase,
          ops: slice,
          summary,
        });
        if (!res.ok) return res;
        currentBase = res.versionId;
        last = res;
      }
      return last ?? { ok: false, error: "Inga ändringar att tillämpa." };
    },
    [],
  );

  const handleAddPage = useCallback(
    async (rawRoute: string) => {
      if (!chatId || !versionId || pageOpInFlightRef.current) return;
      const route = normalizePageRouteInput(rawRoute);
      if (!route) {
        toast.error("Ogiltig sökväg. Använd t.ex. /om eller /tjanster/pris.");
        return;
      }
      pageOpInFlightRef.current = true;
      setPageOpBusy(true);
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
        if (!response.ok || !data?.files || !Array.isArray(data.files)) {
          toast.error("Kunde inte läsa versionens filer.");
          return;
        }
        const files = data.files.map((f) => ({ name: f.name, content: f.content ?? "" }));
        if (routeHasPageFile(files, route)) {
          toast.error(`Sidan ${route} finns redan.`);
          return;
        }
        const appDir = detectAppDir(files);
        const pagePath = pageFilePathForRoute(route, appDir);
        const label = defaultLabelForRoute(route);
        const nav = buildAddNavLinkOps(files, route, label);
        const pageOp: QuickEditClientOp = {
          kind: "replace_content",
          path: pagePath,
          content: buildNewPageContent(route, label),
        };
        const runOps = (ops: QuickEditClientOp[]) =>
          quickEditChatFiles({
            chatId,
            baseVersionId: versionId,
            // Forward the active version as the latest-known signal so the server's
            // stale-base 409 fires if another writer advanced the chat head.
            engineLatestKnownVersionId: versionId,
            ops,
            summary: `La till sidan ${route}`,
          });
        let result = await runOps([pageOp, ...nav.ops]);
        let navRejected = false;
        if (!result.ok && result.reason === "parse_regression" && nav.ops.length > 0) {
          // The server's syntax gate rejected the menu rewrite. The page itself
          // is independent of it, so create the page without the link instead of
          // dropping the whole action.
          navRejected = true;
          result = await runOps([pageOp]);
        }
        if (!result.ok) {
          toast.error(result.error || "Kunde inte skapa sidan.");
          return;
        }
        if (navRejected) {
          toast.message(`Sidan ${route} skapades`, {
            description:
              "Menyn kunde inte uppdateras automatiskt utan att koden gick sönder — be i chatten att länka sidan.",
          });
        } else if (nav.navUpdated) {
          toast.success(`Sidan ${route} skapades och länkades i menyn.`);
        } else {
          toast.message(`Sidan ${route} skapades`, {
            description:
              "Hittade ingen meny att länka från automatiskt — be i chatten att länka sidan så syns den i menyn.",
          });
        }
        onFilesSaved?.({
          versionId: result.versionId,
          previewUrl: result.previewUrl,
          previewSessionId: result.previewSessionId,
          previewMode: result.previewMode,
        });
      } catch {
        toast.error("Något gick fel när sidan skulle skapas.");
      } finally {
        pageOpInFlightRef.current = false;
        setPageOpBusy(false);
      }
    },
    [chatId, versionId, onFilesSaved],
  );

  const handleRemovePage = useCallback(
    async (route: string) => {
      if (!chatId || !versionId || route === "/" || pageOpInFlightRef.current) return;
      pageOpInFlightRef.current = true;
      setPageOpBusy(true);
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
        if (!response.ok || !data?.files || !Array.isArray(data.files)) {
          toast.error("Kunde inte läsa versionens filer.");
          return;
        }
        const files = data.files.map((f) => ({ name: f.name, content: f.content ?? "" }));
        const routeFiles = findRouteFilePaths(files, route);
        if (routeFiles.length === 0) {
          toast.error(`Hittade inga filer för sidan ${route}.`);
          return;
        }
        // Exclude the files we are about to delete from nav-cleanup — a file
        // inside the deleted subtree that also links to the route would
        // otherwise get a redundant replace_content op targeting a path that the
        // same batch deletes.
        const deletedPaths = new Set(routeFiles.map((p) => p.replace(/\\/g, "/")));
        const navFiles = files.filter((f) => !deletedPaths.has(f.name.replace(/\\/g, "/")));
        const ops: QuickEditClientOp[] = [
          ...routeFiles.map((path) => ({ kind: "delete_file" as const, path })),
          ...buildRemoveNavLinkOps(navFiles, route),
        ];
        const result = await runQuickEditChunked(
          chatId,
          versionId,
          ops,
          `Tog bort sidan ${route}`,
        );
        if (!result.ok) {
          toast.error(result.error || "Kunde inte ta bort sidan.");
          return;
        }
        toast.success(`Sidan ${route} togs bort.`);
        onFilesSaved?.({
          versionId: result.versionId,
          previewUrl: result.previewUrl,
          previewSessionId: result.previewSessionId,
          previewMode: result.previewMode,
        });
      } catch {
        toast.error("Något gick fel när sidan skulle tas bort.");
      } finally {
        pageOpInFlightRef.current = false;
        setPageOpBusy(false);
      }
    },
    [chatId, versionId, onFilesSaved, runQuickEditChunked],
  );

  return {
    pageOpBusy,
    handleAddPage,
    handleRemovePage,
  };
}
