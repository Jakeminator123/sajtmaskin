"use client";

import {
  useCallback,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { buildFileTree } from "@/lib/builder/fileTree";
import type { RegistryMatch } from "@/lib/builder/jsx-element-registry";
import {
  buildDeleteElementOps,
  buildImageEditOps,
  buildTextEditOps,
  describeInspectQuickEditError,
  validateInspectImageInput,
  validateInspectTextInput,
} from "@/lib/builder/inspect-element-actions";
import { quickEditChatFiles, type QuickEditClientOp } from "@/lib/builder/engine-files-patch";
import { dispatchInspectCaptureEvent } from "@/lib/builder/inspect-events";
import {
  dispatchBridgeInspectPoint,
} from "./usePreviewInspectBridge";
import { fetchChatVersionFilesJson } from "../chat-version-files-fetch";
import type { FileNode } from "@/lib/builder/types";
import type {
  CaptureResponse,
  PreviewPanelProps,
  PreviewViewMode,
} from "../preview-panel-types";
import {
  MAX_REGION_POINTS,
  type InspectMenuState,
  type InspectRegionState,
} from "../preview-panel-inspect-types";

type UsePreviewPanelInspectorActionsParams = {
  chatId: string | null;
  versionId: string | null;
  previewUrl: string | null;
  isBlobConfigured: boolean;
  inspectMenu: InspectMenuState | null;
  setInspectMenu: Dispatch<SetStateAction<InspectMenuState | null>>;
  inspectRegion: InspectRegionState | null;
  setInspectRegion: Dispatch<SetStateAction<InspectRegionState | null>>;
  setInspectMode: (update: boolean | ((prev: boolean) => boolean)) => void;
  setFiles: Dispatch<SetStateAction<FileNode[]>>;
  composerBaseVersionRef: MutableRefObject<string | null>;
  onFilesSaved?: PreviewPanelProps["onFilesSaved"];
  showMatchInCode: (match: RegistryMatch) => void;
  lastCodeMatch: RegistryMatch | null;
  runViewSwitch: (fn: () => void) => void;
  setViewMode: (update: PreviewViewMode | ((prev: PreviewViewMode) => PreviewViewMode)) => void;
  setSelectedRegistryId: Dispatch<SetStateAction<string | null>>;
  setSelectedRegistryLine: Dispatch<SetStateAction<number | null>>;
  setSelectedPath: Dispatch<SetStateAction<string | null>>;
  regionImagePending: boolean;
  setRegionImagePending: Dispatch<SetStateAction<boolean>>;
  setInspectEditBusy: Dispatch<SetStateAction<boolean>>;
  setInspectEditError: Dispatch<SetStateAction<string | null>>;
  inspectEditInFlightRef: MutableRefObject<boolean>;
};

export function usePreviewPanelInspectorActions({
  chatId,
  versionId,
  previewUrl,
  isBlobConfigured,
  inspectMenu,
  setInspectMenu,
  inspectRegion,
  setInspectRegion,
  setInspectMode,
  setFiles,
  composerBaseVersionRef,
  onFilesSaved,
  showMatchInCode,
  lastCodeMatch,
  runViewSwitch,
  setViewMode,
  setSelectedRegistryId,
  setSelectedRegistryLine,
  setSelectedPath,
  regionImagePending,
  setRegionImagePending,
  setInspectEditBusy,
  setInspectEditError,
  inspectEditInFlightRef,
}: UsePreviewPanelInspectorActionsParams) {

  /**
   * Snabbändringar skapar en ny minorversion, så den lokalt inlästa filbilden
   * blir gammal direkt. Utan omläsning skulle nästa klick klassificera mot en
   * text som redan är utbytt.
   */
  const reloadFilesForVersion = useCallback(
    async (targetVersionId: string) => {
      if (!chatId) return;
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, targetVersionId);
        if (!response.ok || !Array.isArray(data?.files)) return;
        setFiles(
          buildFileTree(
            data.files.map((file) => ({
              name: file.name,
              content: file.content ?? "",
              locked: file.locked,
            })),
          ),
        );
      } catch {
        /* best-effort — klassificeringen faller tillbaka på "hittade inte elementet" */
      }
    },
    [chatId, setFiles],
  );

  /**
   * Alla direktåtgärder i elementmenyn går genom samma deterministiska väg:
   * quick-edit → ny minorversion → patchad preview. Ingen modell, ingen kodvy.
   */
  const applyInspectorEdit = useCallback(
    async (ops: QuickEditClientOp[], summary: string): Promise<boolean> => {
      if (!chatId || !versionId || ops.length === 0) return false;
      if (inspectEditInFlightRef.current) return false;
      inspectEditInFlightRef.current = true;
      setInspectEditBusy(true);
      setInspectEditError(null);
      try {
        const base = composerBaseVersionRef.current ?? versionId;
        const result = await quickEditChatFiles({
          chatId,
          baseVersionId: base,
          engineLatestKnownVersionId: base,
          ops,
          summary,
        });
        if (!result.ok) {
          const message = describeInspectQuickEditError(result);
          setInspectEditError(message);
          toast.error(message);
          return false;
        }
        composerBaseVersionRef.current = result.versionId;
        await reloadFilesForVersion(result.versionId);
        toast.success(summary);
        onFilesSaved?.({
          versionId: result.versionId,
          previewUrl: result.previewUrl,
          previewSessionId: result.previewSessionId,
          previewMode: result.previewMode,
        });
        return true;
      } catch {
        const message = "Ändringen kunde inte sparas.";
        setInspectEditError(message);
        toast.error(message);
        return false;
      } finally {
        inspectEditInFlightRef.current = false;
        setInspectEditBusy(false);
      }
    },
    [chatId, versionId, onFilesSaved, reloadFilesForVersion, composerBaseVersionRef],
  );

  const handleInspectSaveText = useCallback(
    async (next: string) => {
      const menu = inspectMenu;
      if (!menu?.actions.editText.available) return;
      const invalid = validateInspectTextInput(next);
      if (invalid) {
        setInspectEditError(invalid);
        return;
      }
      const ops = buildTextEditOps(menu.actions.editText.target, next);
      if (ops.length === 0) {
        setInspectMenu(null);
        return;
      }
      const saved = await applyInspectorEdit(ops, "Texten uppdaterades");
      if (saved) setInspectMenu(null);
    },
    [inspectMenu, applyInspectorEdit, setInspectMenu],
  );

  const handleInspectReplaceImage = useCallback(
    async (url: string) => {
      const menu = inspectMenu;
      if (!menu?.actions.replaceImage.available) return;
      const target = menu.actions.replaceImage.target;
      const invalid = validateInspectImageInput(url, target.quote);
      if (invalid) {
        toast.error(invalid);
        return;
      }
      const ops = buildImageEditOps(target, url);
      if (ops.length === 0) {
        setInspectMenu(null);
        return;
      }
      const saved = await applyInspectorEdit(ops, "Bilden byttes ut");
      setInspectMenu((current) => (saved || !current ? null : { ...current, mode: "menu" }));
    },
    [inspectMenu, applyInspectorEdit, setInspectMenu],
  );

  const handleInspectDeleteElement = useCallback(async () => {
    const menu = inspectMenu;
    if (!menu?.actions.deleteElement.available) return;
    const saved = await applyInspectorEdit(
      buildDeleteElementOps(menu.actions.deleteElement.target),
      "Elementet togs bort",
    );
    if (saved) setInspectMenu(null);
  }, [inspectMenu, applyInspectorEdit, setInspectMenu]);

  const handleInspectSendPoint = useCallback(() => {
    const menu = inspectMenu;
    if (!menu) return;
    dispatchBridgeInspectPoint(menu.pick, previewUrl);
    const match = menu.pick.match;
    toast.success(
      `Punkt tillagd i chatten: <${menu.pick.element.tag}>${match ? ` i ${match.item.filePath}:${match.item.lineNumber}` : ""}`,
    );
    setInspectMenu(null);
    setInspectMode(false);
  }, [inspectMenu, previewUrl, setInspectMode, setInspectMenu]);

  const handleInspectShowInCode = useCallback(() => {
    const match = inspectMenu?.pick.match;
    if (!match) return;
    setInspectMenu(null);
    showMatchInCode(match);
  }, [inspectMenu, showMatchInCode, setInspectMenu]);

  const handleInspectRegionSendPoints = useCallback(() => {
    const region = inspectRegion?.region;
    if (!region || region.elements.length === 0) return;
    const selected = region.elements.slice(0, MAX_REGION_POINTS);
    for (const entry of selected) {
      const rect = entry.element.rect ?? null;
      dispatchBridgeInspectPoint(
        {
          element: entry.element,
          match: entry.match,
          rect,
          click: {
            x: (rect?.x ?? 0) + (rect?.width ?? 0) / 2,
            y: (rect?.y ?? 0) + (rect?.height ?? 0) / 2,
          },
          viewport: region.viewport,
        },
        previewUrl,
      );
    }
    toast.success(
      selected.length === region.elements.length
        ? `${selected.length} punkter tillagda i chatten.`
        : `${selected.length} av ${region.elements.length} punkter tillagda i chatten.`,
    );
    setInspectRegion(null);
    setInspectMode(false);
  }, [inspectRegion, previewUrl, setInspectMode, setInspectRegion]);

  /**
   * Bild av den uppdragna ytan, bifogad i chatten.
   *
   * Punktvägen finns redan och tar en fast 420×280-ruta runt en koordinat.
   * Den duger för "vad är det här elementet?" men inte för "titta på den här
   * ytan": användaren har redan sagt exakt vilken yta som menas genom att dra
   * rutan, och den avgränsningen är hela poängen. Regionen skickas därför i
   * procent till samma route, som klipper precis den och hoppar över
   * hårkorset — bilden ÄR markeringen.
   */
  const handleInspectRegionSendImage = useCallback(async () => {
    const state = inspectRegion;
    if (!state || !previewUrl || regionImagePending) return;
    const { rect, viewport, scroll } = state.region;
    if (viewport.w <= 0 || viewport.h <= 0) return;

    const captureId = `region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const centerXPercent = Number((((rect.x + rect.width / 2) / viewport.w) * 100).toFixed(2));
    const centerYPercent = Number((((rect.y + rect.height / 2) / viewport.h) * 100).toFixed(2));

    setRegionImagePending(true);
    try {
      const response = await fetch("/api/inspector-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: previewUrl,
          xPercent: centerXPercent,
          yPercent: centerYPercent,
          viewportWidth: Math.round(viewport.w),
          viewportHeight: Math.round(viewport.h),
          // Rektangeln är viewport-relativ, så fångsten måste rulla dit först
          // — annars fotograferar den sidans topp och kallar det markeringen.
          scrollX: scroll.x,
          scrollY: scroll.y,
          region: {
            xPercent: Number(((rect.x / viewport.w) * 100).toFixed(2)),
            yPercent: Number(((rect.y / viewport.h) * 100).toFixed(2)),
            widthPercent: Number(((rect.width / viewport.w) * 100).toFixed(2)),
            heightPercent: Number(((rect.height / viewport.h) * 100).toFixed(2)),
          },
        }),
      });
      const data = (await response.json().catch(() => null)) as CaptureResponse | null;

      if (!response.ok || !data?.previewDataUrl) {
        toast.error(data?.error || "Kunde inte ta bild av ytan.");
        return;
      }

      dispatchInspectCaptureEvent({
        id: captureId,
        demoUrl: previewUrl,
        xPercent: centerXPercent,
        yPercent: centerYPercent,
        viewportWidth: Math.round(viewport.w),
        viewportHeight: Math.round(viewport.h),
        capturedUrl: data.capturedUrl,
        previewDataUrl: data.previewDataUrl,
        pointSummary:
          data.pointSummary ??
          `Markerad yta ${Math.round(rect.width)}×${Math.round(rect.height)} px`,
        clip: data.clip,
        source: data.source,
      });
      toast.success("Bild av ytan tillagd i chatten.");
      setInspectRegion(null);
      setInspectMode(false);
    } catch {
      toast.error("Nätverksfel när bilden skulle tas.");
    } finally {
      setRegionImagePending(false);
    }
  }, [inspectRegion, previewUrl, regionImagePending, setInspectMode, setInspectRegion]);

  // Bildbytet går genom projektets mediabibliotek. Är biblioteket avstängt är
  // raden gråad med det skälet i stället för att öppna en tom låda.
  const inspectMenuActions = useMemo(() => {
    if (!inspectMenu) return null;
    const actions = inspectMenu.actions;
    if (actions.replaceImage.available && !isBlobConfigured) {
      return {
        ...actions,
        replaceImage: {
          available: false as const,
          reason: "Bildbiblioteket är inte påslaget för det här projektet.",
        },
      };
    }
    return actions;
  }, [inspectMenu, isBlobConfigured]);

  const inspectEditorRect = useMemo(() => {
    if (!inspectMenu) return null;
    return (
      inspectMenu.rect ?? { x: inspectMenu.point.x, y: inspectMenu.point.y, width: 0, height: 0 }
    );
  }, [inspectMenu]);

  const handleShowLastCodeMatch = useCallback(() => {
    if (!lastCodeMatch) return;
    setInspectMode(false);
    runViewSwitch(() => {
      setViewMode("registry");
      setSelectedRegistryId(lastCodeMatch.item.id);
      setSelectedRegistryLine(lastCodeMatch.item.lineNumber);
      setSelectedPath(lastCodeMatch.item.filePath);
    });
  }, [
    lastCodeMatch,
    runViewSwitch,
    setInspectMode,
    setViewMode,
    setSelectedRegistryId,
    setSelectedRegistryLine,
    setSelectedPath,
  ]);

  return {
    handleInspectSaveText,
    handleInspectReplaceImage,
    handleInspectDeleteElement,
    handleInspectSendPoint,
    handleInspectShowInCode,
    handleInspectRegionSendPoints,
    handleInspectRegionSendImage,
    inspectMenuActions,
    inspectEditorRect,
    handleShowLastCodeMatch,
  };
}
