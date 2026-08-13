"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type Dispatch,
  type MouseEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { getPageBlockById } from "@/lib/builder/page-blocks-catalog";
import {
  parseShadcnDragPayload,
  SHADCN_ITEM_DND_TYPE,
} from "@/lib/builder/shadcn-insert";
import {
  resolveHomePageFilePath,
  tryInsertPageBlockIntoHomePage,
} from "@/lib/builder/page-block-patch";
import { patchEngineChatFile } from "@/lib/builder/engine-files-patch";
import type { InsertionPoint, SectionZone } from "@/lib/builder/section-analyzer";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";
import {
  buildComposerDropDetail,
  PAGE_BLOCK_DND_TYPE,
} from "./PreviewPanelComposer";
import { fetchChatVersionFilesJson } from "../code/chat-version-files-fetch";
import type { ComposerAiFallbackPayload, PreviewPanelProps } from "../preview-panel-types";

type ComposerPatchHistoryEntry = {
  fileName: string;
  before: string;
  after: string;
};

/**
 * Status line for a registry-block drop. Exhaustive over `SendMessageOutcome`
 * so a new outcome cannot silently inherit another one's copy — the previous
 * `else` branch claimed the block was sent even when the send failed.
 */
function composerDropStatusLabel(
  outcome: SendMessageOutcome,
  placementLabel: string,
): string {
  const suffix = ` (${placementLabel})`;
  switch (outcome.status) {
    case "started":
      return `Registry-block skickat till AI${suffix}`;
    case "settled":
      // Prompten hanterades men gav inget nytt bygge (F3-ReleaseGate-runda).
      return `Registry-block skickat — se status i chatten${suffix}`;
    case "rejected":
      return `Registry-block skickades inte${suffix}`;
    case "aborted":
      return `Registry-block avbröts${suffix}`;
    case "failed":
      return `Registry-block misslyckades${suffix}`;
  }
}

type UsePreviewPanelComposerActionsParams = {
  chatId: string | null | undefined;
  versionId: string | null | undefined;
  composerMode: boolean;
  sectionZones: SectionZone[];
  /**
   * True when zones come from homepage source fallback (not live inspect/bridge).
   * Mid-page `after-*` must not use deterministic file patch — Y→section mapping
   * is approximate — so those drops go to AI with the placement label.
   */
  sectionZonesApproximate?: boolean;
  iframeLoading: boolean;
  externalLoading: boolean;
  handlePlacementMouseMove: (event: MouseEvent<HTMLDivElement>) => void;
  setHoveredPlacement: Dispatch<SetStateAction<InsertionPoint | null>>;
  onComposerAiFallback?: PreviewPanelProps["onComposerAiFallback"];
  onShadcnItemInsert?: PreviewPanelProps["onShadcnItemInsert"];
  onFilesSaved?: PreviewPanelProps["onFilesSaved"];
};

export function usePreviewPanelComposerActions({
  chatId,
  versionId,
  composerMode,
  sectionZones,
  sectionZonesApproximate = false,
  iframeLoading,
  externalLoading,
  handlePlacementMouseMove,
  setHoveredPlacement,
  onComposerAiFallback,
  onShadcnItemInsert,
  onFilesSaved,
}: UsePreviewPanelComposerActionsParams) {
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  const [composerUndoStack, setComposerUndoStack] = useState<ComposerPatchHistoryEntry[]>([]);
  const [composerRedoStack, setComposerRedoStack] = useState<ComposerPatchHistoryEntry[]>([]);
  const [composerHistoryBusy, setComposerHistoryBusy] = useState(false);
  const [lastComposerActionLabel, setLastComposerActionLabel] = useState<string | null>(null);

  useEffect(() => {
    setComposerUndoStack([]);
    setComposerRedoStack([]);
    setComposerHistoryBusy(false);
    setLastComposerActionLabel(null);
  }, [chatId, versionId]);

  useEffect(() => {
    if (!composerMode) {
      setIsComposerDragging(false);
    }
  }, [composerMode]);

  const handleComposerDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      // Under en HTML5-drag fyrar INTE mousemove — utan detta uppdateras
      // placeringslinjen ("Längst upp"/"Efter Hero"/…) aldrig medan man drar.
      // DragEvent ärver MouseEvent (clientY/currentTarget), så samma handler
      // som hover-läget kan återanvändas rakt av.
      handlePlacementMouseMove(e);
    },
    [handlePlacementMouseMove],
  );

  const runComposerAiFallback = useCallback(
    async (
      payload: ComposerAiFallbackPayload,
      mode: "ai-fallback" | "visual-reorder" = "ai-fallback",
    ) => {
      setLastComposerActionLabel(
        mode === "visual-reorder"
          ? `Visuell omordning (${payload.placementLabel}) → AI-fallback`
          : `AI-fallback (${payload.placementLabel})`,
      );
      if (!onComposerAiFallback) return;
      try {
        await onComposerAiFallback(payload);
      } catch {
        toast.error("Kunde inte skicka AI-fallback till own-engine.");
      }
    },
    [onComposerAiFallback],
  );

  // FEL-2: chain rapid composer actions off the version each one creates, so a
  // second drop/undo/redo fired before the parent re-renders builds on the
  // first instead of forking from the stale `versionId` prop (mirrors the code
  // view's baseVersionRef in usePreviewPanelCodeFiles). Re-synced when the
  // selected version prop changes.
  const composerBaseVersionRef = useRef<string | null>(versionId ?? null);
  useEffect(() => {
    composerBaseVersionRef.current = versionId ?? null;
  }, [versionId]);

  const handleComposerUndo = useCallback(async () => {
    if (!chatId || !versionId || composerHistoryBusy) return;
    const last = composerUndoStack[composerUndoStack.length - 1];
    if (!last) return;

    setComposerHistoryBusy(true);
    try {
      const base = composerBaseVersionRef.current ?? versionId;
      const saved = await patchEngineChatFile({
        chatId,
        versionId: base,
        fileName: last.fileName,
        content: last.before,
        // Composer chains off the version each action creates (FEL-2); forward
        // that base as the latest-known signal so the server's stale-base 409
        // fires when another writer advanced the chat head past it.
        engineLatestKnownVersionId: base,
        // History restore, not new machine content: the snapshot is a state
        // the file has already been in (possibly a deliberately saved broken
        // draft from the code view). Gating it would strand the user with no
        // way back — and unlike the composer drop there is no AI fallback.
        guardSyntax: false,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      if (saved.versionId) composerBaseVersionRef.current = saved.versionId;
      setComposerUndoStack((prev) => prev.slice(0, -1));
      setComposerRedoStack((prev) => [last, ...prev].slice(0, 20));
      setLastComposerActionLabel("Ångra direkt patch");
      toast.success("Senaste composer-patch ångrad.");
      onFilesSaved?.({
        versionId: saved.versionId,
        previewUrl: saved.previewUrl,
        previewSessionId: saved.previewSessionId,
        previewMode: saved.previewMode,
      });
    } finally {
      setComposerHistoryBusy(false);
    }
  }, [chatId, versionId, composerHistoryBusy, composerUndoStack, onFilesSaved]);

  const handleComposerRedo = useCallback(async () => {
    if (!chatId || !versionId || composerHistoryBusy) return;
    const next = composerRedoStack[0];
    if (!next) return;

    setComposerHistoryBusy(true);
    try {
      const base = composerBaseVersionRef.current ?? versionId;
      const saved = await patchEngineChatFile({
        chatId,
        versionId: base,
        fileName: next.fileName,
        content: next.after,
        // See handleComposerUndo: chain off the latest composer version (FEL-2)
        // and forward it as the latest-known signal for the stale-base 409.
        engineLatestKnownVersionId: base,
        // History restore — same rationale as handleComposerUndo above.
        guardSyntax: false,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      if (saved.versionId) composerBaseVersionRef.current = saved.versionId;
      setComposerRedoStack((prev) => prev.slice(1));
      setComposerUndoStack((prev) => [...prev.slice(-19), next]);
      setLastComposerActionLabel("Gör om direkt patch");
      toast.success("Composer-patch återställd igen.");
      onFilesSaved?.({
        versionId: saved.versionId,
        previewUrl: saved.previewUrl,
        previewSessionId: saved.previewSessionId,
        previewMode: saved.previewMode,
      });
    } finally {
      setComposerHistoryBusy(false);
    }
  }, [chatId, versionId, composerHistoryBusy, composerRedoStack, onFilesSaved]);

  const handleComposerDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsComposerDragging(false);
      setHoveredPlacement(null);

      // Registry-kort (Bläddra/Beskriv) → insättnings-lane v1 med placerings-
      // ankare. Kollas FÖRE page-block-payloaden: en registry-drag har aldrig
      // PAGE_BLOCK_DND_TYPE satt och föll tidigare tyst ur handlern.
      const shadcnRaw = e.dataTransfer.getData(SHADCN_ITEM_DND_TYPE);
      if (shadcnRaw) {
        if (!chatId || iframeLoading || externalLoading || composerHistoryBusy) return;
        const selection = parseShadcnDragPayload(shadcnRaw);
        if (!selection) {
          toast.error("Kunde inte läsa det dragna blocket.");
          return;
        }
        if (!onShadcnItemInsert) {
          toast.error("Insättning är inte tillgänglig här ännu.");
          return;
        }
        const detail = buildComposerDropDetail(e, sectionZones);
        try {
          const outcome = await onShadcnItemInsert({
            ...selection,
            placement: detail.placement,
            placementLabel: detail.placementLabel,
            anchorSectionLabel: detail.anchorSection?.label,
          });
          // Utfallskontraktet (BB#shadcn-lane1) ersätter den tidigare neutrala
          // copyn: bara ett startat bygge får en success-toast (avslag och fel
          // har redan sin egen toast från sändvägen), och statusraden namnger
          // varje utfall i stället för att bunta ihop dem — en `switch` så ett
          // framtida utfall inte tyst ärver fel copy (bugbot på #610).
          setLastComposerActionLabel(
            composerDropStatusLabel(outcome, detail.placementLabel),
          );
          if (outcome.status === "started") {
            toast.success(`Bygger in blocket (${detail.placementLabel}).`);
          }
        } catch {
          // Fel-toasten ägs av insert-handlern (busy/chattbyte/etc.).
          setLastComposerActionLabel(
            `Registry-block skickades inte (${detail.placementLabel})`,
          );
        }
        return;
      }

      const blockId = e.dataTransfer.getData(PAGE_BLOCK_DND_TYPE);
      if (
        !blockId ||
        !chatId ||
        !versionId ||
        iframeLoading ||
        externalLoading ||
        composerHistoryBusy
      ) {
        return;
      }

      const block = getPageBlockById(blockId);
      if (!block) {
        toast.error("Okänt sajblock.");
        return;
      }

      const detail = buildComposerDropDetail(e, sectionZones);
      const fallbackBase = {
        blockId,
        placement: detail.placement,
        placementLabel: detail.placementLabel,
        anchorSection: detail.anchorSection,
      };

      const base = composerBaseVersionRef.current ?? versionId;
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, base);
        if (!response.ok || !data?.files || !Array.isArray(data.files)) {
          toast.error("Kunde inte läsa versionens filer.");
          await runComposerAiFallback({
            ...fallbackBase,
            homePageContent: null,
          });
          return;
        }

        const flatFiles = data.files.map((f) => ({
          name: f.name,
          content: f.content ?? "",
        }));
        const path = resolveHomePageFilePath(flatFiles);
        const homePageContent = path
          ? (flatFiles.find((f) => f.name === path)?.content ?? "")
          : "";

        if (!path) {
          toast.message("Ingen startsida hittades", {
            description: "Förväntade app/page.tsx — skickar till AI istället.",
          });
          await runComposerAiFallback({
            ...fallbackBase,
            homePageContent: null,
          });
          return;
        }

        // Approximate (code-derived) zones: keep the Efter-label in the AI
        // prompt, but do not mutate the file with a Y-mapped after-* guess.
        if (
          sectionZonesApproximate &&
          detail.placement !== "top" &&
          detail.placement !== "bottom"
        ) {
          toast.message("Composer → AI", {
            description: "Sektionsplacering uppskattad — skickar till AI.",
          });
          await runComposerAiFallback(
            {
              ...fallbackBase,
              homePageContent,
            },
            "visual-reorder",
          );
          return;
        }

        const patchResult = tryInsertPageBlockIntoHomePage(
          homePageContent,
          block.jsxSnippet,
          detail.placement,
        );

        if (!patchResult.ok) {
          toast.message("Composer → AI", {
            description: patchResult.reason,
          });
          const fallbackMode =
            detail.placement === "top" || detail.placement === "bottom"
              ? "ai-fallback"
              : "visual-reorder";
          await runComposerAiFallback({
            ...fallbackBase,
            homePageContent,
          }, fallbackMode);
          return;
        }

        const saved = await patchEngineChatFile({
          chatId,
          versionId: base,
          fileName: path,
          content: patchResult.content,
          // See handleComposerUndo: chain off the latest composer version (FEL-2)
          // and forward it as the latest-known signal for the stale-base 409.
          engineLatestKnownVersionId: base,
        });

        if (!saved.ok) {
          toast.error(saved.error);
          await runComposerAiFallback({
            ...fallbackBase,
            homePageContent,
          });
          return;
        }

        if (saved.versionId) composerBaseVersionRef.current = saved.versionId;
        setComposerUndoStack((prev) => [
          ...prev.slice(-19),
          { fileName: path, before: homePageContent, after: patchResult.content },
        ]);
        setComposerRedoStack([]);
        setLastComposerActionLabel(`Direkt patch (${detail.placementLabel})`);
        toast.success(`Sektion infogad direkt (${path})`);
        onFilesSaved?.({
          versionId: saved.versionId,
          previewUrl: saved.previewUrl,
          previewSessionId: saved.previewSessionId,
          previewMode: saved.previewMode,
        });
      } catch {
        toast.error("Något gick fel vid infogning.");
        await runComposerAiFallback({
          ...fallbackBase,
          homePageContent: null,
        });
      }
    },
    [
      chatId,
      versionId,
      sectionZones,
      sectionZonesApproximate,
      iframeLoading,
      externalLoading,
      composerHistoryBusy,
      runComposerAiFallback,
      onFilesSaved,
      onShadcnItemInsert,
      setHoveredPlacement,
    ],
  );

  return {
    isComposerDragging,
    setIsComposerDragging,
    composerUndoStack,
    composerRedoStack,
    composerHistoryBusy,
    lastComposerActionLabel,
    composerBaseVersionRef: composerBaseVersionRef as MutableRefObject<string | null>,
    handleComposerDragOver,
    handleComposerUndo,
    handleComposerRedo,
    handleComposerDrop,
  };
}
