"use client";

import { dispatchInspectCaptureEvent } from "@/lib/builder/inspect-events";
import { buildFileTree } from "@/lib/builder/fileTree";
import {
  matchCapturedElement,
  type JsxElementRegistryItem,
  type RegistryMatch,
} from "@/lib/builder/jsx-element-registry";
import type { ElementMapItem, FileNode } from "@/lib/builder/types";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { fetchChatVersionFilesJson } from "../chat-version-files-fetch";
import type {
  AiMatchResponse,
  CaptureResponse,
  InspectEngine,
  InspectPulseMarker,
} from "../preview-panel-types";

export function usePreviewPanelInspectCapture(options: {
  inspectorEnabled: boolean;
  previewUrl: string | null;
  inspectMode: boolean;
  iframeLoading: boolean;
  externalLoading: boolean;
  inspectEngine: InspectEngine;
  hoveredMapElement: ElementMapItem | null;
  chatId: string | null;
  versionId: string | null;
  flatFilesForAi: Array<{ name: string; content: string }>;
  elementRegistryRef: MutableRefObject<JsxElementRegistryItem[]>;
  setFiles: Dispatch<SetStateAction<FileNode[]>>;
  setInspectStatus: Dispatch<SetStateAction<string | null>>;
  setLastCodeMatch: Dispatch<SetStateAction<RegistryMatch | null>>;
  setLastAiCostDisplay: Dispatch<SetStateAction<string | null>>;
  setTotalAiCostUsd: Dispatch<SetStateAction<number>>;
}) {
  const {
    inspectorEnabled,
    previewUrl,
    inspectMode,
    iframeLoading,
    externalLoading,
    inspectEngine,
    hoveredMapElement,
    chatId,
    versionId,
    flatFilesForAi,
    elementRegistryRef,
    setFiles,
    setInspectStatus,
    setLastCodeMatch,
    setLastAiCostDisplay,
    setTotalAiCostUsd,
  } = options;

  const [isCapturePending, setIsCapturePending] = useState(false);
  const [inspectPulse, setInspectPulse] = useState<InspectPulseMarker | null>(null);
  const inspectPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (inspectPulseTimerRef.current) {
        clearTimeout(inspectPulseTimerRef.current);
      }
    };
  }, []);

  const handleCaptureClick = useCallback(
    async (event: MouseEvent<HTMLDivElement>) => {
      if (!inspectorEnabled || !previewUrl || !inspectMode || isCapturePending || iframeLoading || externalLoading) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const xPercent = Number(((x / rect.width) * 100).toFixed(2));
      const yPercent = Number(((y / rect.height) * 100).toFixed(2));
      const captureId = `inspect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setInspectPulse({ x, y, key: Date.now() });
      if (inspectPulseTimerRef.current) clearTimeout(inspectPulseTimerRef.current);
      inspectPulseTimerRef.current = setTimeout(() => setInspectPulse(null), 900);

      setIsCapturePending(true);
      setLastCodeMatch(null);
      setLastAiCostDisplay(null);

      if (inspectEngine === "map") {
        const el = hoveredMapElement;
        if (!el) {
          setIsCapturePending(false);
          toast("Hovra över ett element först.");
          return;
        }

        const codeMatch = matchCapturedElement(elementRegistryRef.current, {
          tag: el.tag,
          id: el.id,
          className: el.className,
          text: el.text,
          selector: el.selector,
        });
        setLastCodeMatch(codeMatch);

        const matchHint = codeMatch
          ? ` → ${codeMatch.item.filePath}:${codeMatch.item.lineNumber}`
          : "";
        setInspectStatus(`<${el.tag}>${el.text ? ` "${el.text.slice(0, 50)}"` : ""}${matchHint}`);
        dispatchInspectCaptureEvent({
          id: captureId,
          demoUrl: previewUrl,
          xPercent,
          yPercent,
          viewportWidth: Math.round(rect.width),
          viewportHeight: Math.round(rect.height),
          pointSummary: `Map: <${el.tag}> vid ${xPercent}%/${yPercent}%${el.text ? ` "${el.text.slice(0, 60)}"` : ""}${matchHint}`,
          element: {
            tag: el.tag,
            id: el.id,
            className: el.className,
            text: el.text,
            ariaLabel: null,
            role: null,
            href: null,
            selector: el.selector,
            nearestHeading: null,
          },
          source: "local",
        });
        toast.success(
          `Punkt tillagd i chatten: <${el.tag}>${codeMatch ? ` i ${codeMatch.item.filePath}:${codeMatch.item.lineNumber}` : ""}`,
        );

        setIsCapturePending(false);
        return;
      }

      if (inspectEngine === "ai") {
        setInspectStatus("AI analyserar klickposition...");
        try {
          let aiFiles = flatFilesForAi;
          if (aiFiles.length === 0 && chatId && versionId) {
            setInspectStatus("Hämtar kodfiler...");
            try {
              const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
              const rows = Array.isArray(data?.files) ? data.files : [];
              if (response.ok && rows.length > 0) {
                const normalized = rows.map((f) => ({
                  name: f.name,
                  content: f.content ?? "",
                }));
                aiFiles = normalized;
                setFiles(buildFileTree(normalized));
              }
            } catch {
              /* best-effort */
            }
            setInspectStatus("AI analyserar klickposition...");
          }

          const response = await fetch("/api/inspector-ai-match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              xPercent,
              yPercent,
              viewportWidth: Math.round(rect.width),
              viewportHeight: Math.round(rect.height),
              files: aiFiles,
            }),
          });
          const data = (await response.json().catch(() => null)) as AiMatchResponse | null;

          if (data?.cost?.display) setLastAiCostDisplay(data.cost.display);
          if (data?.cost?.usd) setTotalAiCostUsd((prev) => prev + data.cost!.usd);

          if (!response.ok || !data?.success) {
            toast.error(data?.error || "AI-matchning misslyckades.");
            setInspectStatus(`AI-fel: ${data?.error || "okänt"}`);
            return;
          }

          const el = data.element;
          if (!el || !el.filePath) {
            setInspectStatus(
              `AI kunde inte identifiera elementet vid ${xPercent}%/${yPercent}%. (${data.cost?.display || ""})`,
            );
            return;
          }

          const registryHit = matchCapturedElement(elementRegistryRef.current, {
            tag: el.tag,
            className: el.className,
            text: el.text,
          });
          setLastCodeMatch(registryHit);

          const tokenInfo = data.tokens ? ` ${data.tokens.total} tokens` : "";
          const costInfo = data.cost?.display ? ` (${data.cost.display})` : "";
          const confLabel =
            el.confidence === "high" ? "hög" : el.confidence === "medium" ? "medel" : "låg";
          setInspectStatus(
            `AI: <${el.tag}> i ${el.filePath}:${el.lineNumber ?? "?"} [${confLabel}]${tokenInfo}${costInfo}` +
              (el.reasoning ? `\n${el.reasoning}` : ""),
          );

          dispatchInspectCaptureEvent({
            id: captureId,
            demoUrl: previewUrl,
            xPercent,
            yPercent,
            viewportWidth: Math.round(rect.width),
            viewportHeight: Math.round(rect.height),
            pointSummary: `AI: <${el.tag}> vid ${el.filePath}:${el.lineNumber} (${confLabel})`,
            element: {
              tag: el.tag,
              id: null,
              className: el.className || null,
              text: el.text || null,
              ariaLabel: null,
              role: null,
              href: null,
              selector: null,
              nearestHeading: null,
            },
            source: "local",
          });
          if (registryHit) {
            toast.success(`Punkt tillagd i chatten: AI hittade <${el.tag}> i ${el.filePath}:${el.lineNumber}`);
          } else {
            toast(
              `Punkt tillagd i chatten: AI-gissning <${el.tag}> i ${el.filePath}:${el.lineNumber} (${confLabel} konfidens)`,
            );
          }
        } catch {
          toast.error("Nätverksfel vid AI-matchning.");
          setInspectStatus("AI-matchning misslyckades (nätverksfel).");
        } finally {
          setIsCapturePending(false);
        }
        return;
      }

      setInspectStatus("Skapar punktbild (Playwright)...");

      try {
        const response = await fetch("/api/inspector-capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: previewUrl,
            xPercent,
            yPercent,
            viewportWidth: Math.round(rect.width),
            viewportHeight: Math.round(rect.height),
          }),
        });

        const data = (await response.json().catch(() => null)) as CaptureResponse | null;

        dispatchInspectCaptureEvent({
          id: captureId,
          demoUrl: previewUrl,
          xPercent,
          yPercent,
          viewportWidth: Math.round(rect.width),
          viewportHeight: Math.round(rect.height),
          capturedUrl: data?.capturedUrl,
          previewDataUrl: data?.previewDataUrl,
          pointSummary: data?.pointSummary,
          element: data?.element
            ? {
                tag: data.element.tag || "unknown",
                id: data.element.id || null,
                className: data.element.className || null,
                text: data.element.text || null,
                ariaLabel: data.element.ariaLabel || null,
                role: data.element.role || null,
                href: data.element.href || null,
                selector: data.element.selector || null,
                nearestHeading: data.element.nearestHeading || null,
              }
            : undefined,
          clip: data?.clip,
          source: data?.source,
          error: response.ok ? undefined : data?.error || "Kunde inte skapa punktbild",
        });

        if (!response.ok) {
          toast.error(data?.error || "Punkt tillagd utan bild.");
          setInspectStatus("Punkt tillagd utan bild (kunde inte skapa preview).");
          return;
        }

        toast.success("Punkt tillagd i chatten.");

        const codeMatch = data?.element
          ? matchCapturedElement(elementRegistryRef.current, {
              tag: data.element.tag,
              id: data.element.id,
              className: data.element.className,
              text: data.element.text,
              selector: data.element.selector,
            })
          : null;
        setLastCodeMatch(codeMatch);

        if (data?.pointSummary) {
          const matchHint = codeMatch
            ? ` → ${codeMatch.item.filePath}:${codeMatch.item.lineNumber}`
            : "";
          setInspectStatus(
            `${data.pointSummary}${data.source ? ` (${data.source})` : ""}${matchHint}`,
          );
        } else {
          setInspectStatus(`Senaste punkt: x ${xPercent}% • y ${yPercent}%`);
        }
        if (data?.element?.tag && ["html", "body"].includes(data.element.tag)) {
          toast(
            "Tip: klicka närmare själva elementet (t.ex. knapptexten) för mer exakt DOM-träff.",
          );
        }
      } catch {
        dispatchInspectCaptureEvent({
          id: captureId,
          demoUrl: previewUrl,
          xPercent,
          yPercent,
          viewportWidth: Math.round(rect.width),
          viewportHeight: Math.round(rect.height),
          error: "Nätverksfel vid punktfångst",
        });
        toast.error("Nätverksfel vid punktfångst.");
        setInspectStatus("Punkt tillagd utan bild (nätverksfel).");
      } finally {
        setIsCapturePending(false);
      }
    },
    [
      previewUrl,
      inspectMode,
      inspectEngine,
      isCapturePending,
      iframeLoading,
      externalLoading,
      flatFilesForAi,
      chatId,
      versionId,
      hoveredMapElement,
      inspectorEnabled,
      elementRegistryRef,
      setFiles,
      setInspectStatus,
      setLastCodeMatch,
      setLastAiCostDisplay,
      setTotalAiCostUsd,
    ],
  );

  return { isCapturePending, inspectPulse, handleCaptureClick };
}
