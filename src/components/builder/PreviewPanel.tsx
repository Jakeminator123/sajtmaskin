"use client";

import { AlertCircle, BrainCircuit, Code2, ExternalLink, FileText, Loader2, MessageCircleQuestion, MousePointer2, RefreshCw, Search, Wand2, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { buildFileTree } from "@/lib/builder/fileTree";
import {
  dispatchInspectCaptureEvent,
  dispatchPlacementSelectEvent,
  type PlacementSelectEventDetail,
} from "@/lib/builder/inspect-events";
import type { FileNode, ElementMapItem, ElementMapResponse } from "@/lib/builder/types";
import { buildJsxElementRegistry, matchCapturedElement, type RegistryMatch } from "@/lib/builder/jsx-element-registry";
import {
  extractSectionZones,
  nearestInsertionPoint,
  type InsertionPoint,
} from "@/lib/builder/sectionAnalyzer";
import { ElementRegistry } from "@/components/builder/ElementRegistry";
import { FileExplorer } from "@/components/builder/FileExplorer";
import { useIntegrationStatus } from "@/lib/hooks/useIntegrationStatus";
import { useInspectorWorkerStatus } from "@/lib/hooks/useInspectorWorkerStatus";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CaptureResponse = {
  success?: boolean;
  capturedUrl?: string;
  previewDataUrl?: string;
  previewMimeType?: string;
  pointSummary?: string;
  element?: {
    tag?: string;
    id?: string | null;
    className?: string | null;
    text?: string | null;
    ariaLabel?: string | null;
    role?: string | null;
    href?: string | null;
    selector?: string | null;
    nearestHeading?: string | null;
  };
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  source?: "worker" | "local";
  error?: string;
};

type InspectPulseMarker = {
  x: number;
  y: number;
  key: number;
};

type PreviewIssuePayload = {
  message?: string | null;
  name?: string | null;
  stack?: string | null;
  kind?: string | null;
};

type PreviewIframeMessage = {
  source?: string;
  type?: "preview-error" | "preview-ready";
  payload?: PreviewIssuePayload;
};

function summarizePreviewReason(kind: string, message: string, name?: string | null): string {
  if (kind === "validation") return "preview validation failed";
  if (kind === "compile") return "preview compilation failed";
  if (kind === "route") return "preview route failed";
  if (name === "ReferenceError" || /\bis not defined\b/i.test(message)) {
    return "preview has undefined symbol";
  }
  return "preview runtime failed";
}

function detectOwnEnginePreviewIssue(doc: Document | null): PreviewIssuePayload | null {
  if (!doc?.body) return null;

  const root = doc.getElementById("root");
  const rootText = root?.innerText?.trim() || "";
  if (rootText.startsWith("Preview-fel")) {
    return {
      message: rootText.replace(/^Preview-fel\s*/u, "").trim() || "Unknown preview error",
      kind: rootText.includes("Preview validation failed") ? "validation" : "runtime",
    };
  }

  if (!root) {
    const bodyText = doc.body.innerText.trim();
    if (bodyText) {
      return {
        message: bodyText,
        kind: "route",
      };
    }
  }

  return null;
}

interface PreviewPanelProps {
  chatId: string | null;
  versionId: string | null;
  demoUrl: string | null;
  isLoading?: boolean;
  onClear?: () => void;
  onFixPreview?: () => void;
  refreshToken?: number;
  imageGenerationsEnabled?: boolean;
  imageGenerationsSupported?: boolean;
  isBlobConfigured?: boolean;
  awaitingInput?: boolean;
  placementMode?: boolean;
  pendingPlacementItem?: {
    title: string;
    description?: string | null;
  } | null;
  onPlacementComplete?: (detail: PlacementSelectEventDetail) => void;
}

type PreviewViewMode = "preview" | "code" | "registry";
type InspectEngine = "playwright" | "ai" | "map";
const PREVIEW_READY_TIMEOUT_MS = 10_000;
const PREVIEW_READY_POLL_MS = 250;

type AiMatchResult = {
  tag: string;
  text: string | null;
  className: string | null;
  filePath: string | null;
  lineNumber: number | null;
  confidence: string;
  reasoning: string | null;
};

type AiMatchResponse = {
  success: boolean;
  model?: string;
  element?: AiMatchResult | null;
  tokens?: { input: number; output: number; total: number };
  cost?: { usd: number; display: string };
  error?: string;
};

export function PreviewPanel({
  chatId,
  versionId,
  demoUrl,
  isLoading: externalLoading,
  onClear,
  onFixPreview,
  refreshToken,
  imageGenerationsEnabled = true,
  imageGenerationsSupported = true,
  isBlobConfigured = false,
  awaitingInput = false,
  placementMode = false,
  pendingPlacementItem = null,
  onPlacementComplete,
}: PreviewPanelProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [selectedRegistryLine, setSelectedRegistryLine] = useState<number | null>(null);
  const { integrationStatus, integrationError } = useIntegrationStatus(demoUrl);
  const { inspectorWorkerStatus, inspectorWorkerMessage } = useInspectorWorkerStatus();
  const [isViewSwitchPending, startViewSwitchTransition] = useTransition();
  const [inspectMode, setInspectMode] = useState(false);
  const [inspectEngine, setInspectEngine] = useState<InspectEngine>("map");
  const [isCapturePending, setIsCapturePending] = useState(false);
  const [inspectStatus, setInspectStatus] = useState<string | null>(null);
  const [inspectPulse, setInspectPulse] = useState<InspectPulseMarker | null>(null);
  const [lastCodeMatch, setLastCodeMatch] = useState<RegistryMatch | null>(null);
  const [lastAiCostDisplay, setLastAiCostDisplay] = useState<string | null>(null);
  const [totalAiCostUsd, setTotalAiCostUsd] = useState(0);
  const [elementMap, setElementMap] = useState<ElementMapItem[]>([]);
  const [elementMapLoading, setElementMapLoading] = useState(false);
  const [inspectorUnavailable, setInspectorUnavailable] = useState(false);
  const [hoveredMapElement, setHoveredMapElement] = useState<ElementMapItem | null>(null);
  const [hoveredPlacement, setHoveredPlacement] = useState<InsertionPoint | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const inspectPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeScrollRef = useRef<HTMLDivElement | null>(null);
  const previewReadyTimerRef = useRef<number | null>(null);
  const elementRegistryRef = useRef<ReturnType<typeof buildJsxElementRegistry>>([]);
  const previewIssueKeysRef = useRef<Set<string>>(new Set());

  const clearPreviewReadyTimer = useCallback(() => {
    if (previewReadyTimerRef.current) {
      window.clearTimeout(previewReadyTimerRef.current);
      previewReadyTimerRef.current = null;
    }
  }, []);

  const buildPreviewSrc = useCallback((url: string, token?: number) => {
    let src = url;
    if (token) {
      const separator = src.includes("?") ? "&" : "?";
      src = `${src}${separator}t=${token}`;
    }
    return src;
  }, []);

  const reportPreviewIssue = useCallback(
    async (payload: PreviewIssuePayload) => {
      if (!chatId || !versionId) return;

      const message = payload.message?.trim();
      if (!message) return;

      const kind = payload.kind?.trim() || "runtime";
      const dedupeKey = `${chatId}:${versionId}:${kind}:${message}`;
      if (previewIssueKeysRef.current.has(dedupeKey)) return;
      previewIssueKeysRef.current.add(dedupeKey);

      const reason = summarizePreviewReason(kind, message, payload.name);
      const meta = {
        source: "own-engine-preview",
        demoUrl,
        kind,
        name: payload.name ?? null,
        message,
        stack: payload.stack ?? null,
      };

      try {
        await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              level: "error",
              category: "preview",
              message: reason,
              meta,
            }),
          },
        );
      } catch (error) {
        console.warn("[Preview] Failed to persist preview issue:", error);
      }

      window.dispatchEvent(
        new CustomEvent("sajtmaskin:auto-fix", {
          detail: {
            chatId,
            versionId,
            reasons: [reason],
            meta,
          },
        }),
      );
      toast.error("Preview-fel upptäckt. Försöker reparera automatiskt.", { duration: 5000 });
    },
    [chatId, versionId, demoUrl],
  );

  const fetchFilesForRegistry = useCallback(async () => {
    if (!chatId || !versionId || files.length > 0) return;
    try {
      const response = await fetch(
        `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(versionId)}`,
      );
      const data = (await response.json().catch(() => null)) as {
        files?: Array<{ name: string; content: string; locked?: boolean }>;
      } | null;
      if (!response.ok) return;
      const flatFiles = Array.isArray(data?.files) ? data.files : [];
      if (flatFiles.length > 0) {
        setFiles(buildFileTree(flatFiles));
      }
    } catch {
      /* best-effort */
    }
  }, [chatId, versionId, files.length]);

  const fetchElementMap = useCallback(async (url: string, width: number, height: number) => {
    setElementMapLoading(true);
    setInspectorUnavailable(false);
    try {
      const inspectorUrl = url.startsWith("/")
        ? `${window.location.origin}${url}`
        : url;

      const isOwnEnginePreview = inspectorUrl.includes("/api/preview-render");

      const res = await fetch("/api/inspector-element-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inspectorUrl, viewportWidth: width, viewportHeight: height, maxElements: 300 }),
      });
      const data = (await res.json().catch(() => null)) as ElementMapResponse | null;
      if (res.ok && data?.success && Array.isArray(data.elements)) {
        setElementMap(data.elements);
        return data.elements.length;
      }
      setElementMap([]);
      setInspectorUnavailable(true);
      if (isOwnEnginePreview) {
        console.info("[inspector] Own-engine preview — inspector requires Playwright or inspector-worker to be running.");
      }
      return 0;
    } catch {
      setElementMap([]);
      setInspectorUnavailable(true);
      return 0;
    } finally {
      setElementMapLoading(false);
    }
  }, []);

  const handleToggleInspect = useCallback(() => {
    if (!demoUrl) return;
    setInspectMode((prev) => {
      const next = !prev;
      if (next) {
        setIframeLoading(true);
        setIframeError(false);
        const iframe = iframeRef.current;
        if (iframe) {
          iframe.src = buildPreviewSrc(demoUrl, Date.now());
        }
        fetchFilesForRegistry();
        const container = iframeRef.current?.parentElement;
        const w = container?.clientWidth || 1280;
        const h = container?.clientHeight || 800;
        fetchElementMap(demoUrl, w, h).then((count) => {
          if (count > 0) setInspectStatus(`Elementkarta laddad: ${count} element. Hovra för att identifiera.`);
        });
      } else {
        setHoveredMapElement(null);
        setElementMap([]);
      }
      return next;
    });
    setLastCodeMatch(null);
    setInspectStatus("Laddar elementkarta...");
  }, [buildPreviewSrc, demoUrl, fetchFilesForRegistry, fetchElementMap]);

  const flatFilesForAi = useMemo(() => {
    const result: Array<{ name: string; content: string }> = [];
    const walk = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === "file" && node.content) result.push({ name: node.path, content: node.content });
        if (node.children?.length) walk(node.children);
      }
    };
    walk(files);
    return result;
  }, [files]);

  const sectionZones = useMemo(() => extractSectionZones(elementMap), [elementMap]);

  const handlePlacementMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!placementMode) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const yPercent = Number(((y / rect.height) * 100).toFixed(2));
      const insertion = nearestInsertionPoint(yPercent, sectionZones);
      setHoveredPlacement(insertion);
    },
    [placementMode, sectionZones],
  );

  const handlePlacementClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!demoUrl || !placementMode || iframeLoading || externalLoading) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const xPercent = Number(((x / rect.width) * 100).toFixed(2));
      const yPercent = Number(((y / rect.height) * 100).toFixed(2));
      const insertion = nearestInsertionPoint(yPercent, sectionZones);

      const detail: PlacementSelectEventDetail = {
        id: `placement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        demoUrl,
        xPercent,
        yPercent,
        lineYPercent: insertion.lineYPercent,
        viewportWidth: Math.round(rect.width),
        viewportHeight: Math.round(rect.height),
        placement: insertion.placement,
        placementLabel: insertion.label,
        anchorSection: insertion.anchorSection,
      };
      dispatchPlacementSelectEvent(detail);
      onPlacementComplete?.(detail);
      toast.success(`Placering vald: ${insertion.label}`);
    },
    [demoUrl, placementMode, iframeLoading, externalLoading, sectionZones, onPlacementComplete],
  );

  const handleCaptureClick = useCallback(
    async (event: MouseEvent<HTMLDivElement>) => {
      if (!demoUrl || !inspectMode || isCapturePending || iframeLoading || externalLoading) return;

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

        const matchHint = codeMatch ? ` → ${codeMatch.item.filePath}:${codeMatch.item.lineNumber}` : "";
        setInspectStatus(`<${el.tag}>${el.text ? ` "${el.text.slice(0, 50)}"` : ""}${matchHint}`);
        toast.success(`Valde <${el.tag}>${codeMatch ? ` i ${codeMatch.item.filePath}:${codeMatch.item.lineNumber}` : ""}`);

        dispatchInspectCaptureEvent({
          id: captureId,
          demoUrl,
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
              const filesRes = await fetch(
                `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(versionId)}`,
              );
              const filesData = (await filesRes.json().catch(() => null)) as {
                files?: Array<{ name: string; content: string }>;
              } | null;
              if (filesRes.ok && Array.isArray(filesData?.files) && filesData.files.length > 0) {
                aiFiles = filesData.files;
                setFiles(buildFileTree(filesData.files));
              }
            } catch { /* best-effort */ }
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
            setInspectStatus(`AI kunde inte identifiera elementet vid ${xPercent}%/${yPercent}%. (${data.cost?.display || ""})`);
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
          const confLabel = el.confidence === "high" ? "hög" : el.confidence === "medium" ? "medel" : "låg";
          setInspectStatus(
            `AI: <${el.tag}> i ${el.filePath}:${el.lineNumber ?? "?"} [${confLabel}]${tokenInfo}${costInfo}` +
            (el.reasoning ? `\n${el.reasoning}` : ""),
          );

          if (registryHit) {
            toast.success(`AI hittade <${el.tag}> i ${el.filePath}:${el.lineNumber}`);
          } else {
            toast(`AI-gissning: <${el.tag}> i ${el.filePath}:${el.lineNumber} (${confLabel} konfidens)`);
          }

          dispatchInspectCaptureEvent({
            id: captureId,
            demoUrl,
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
            url: demoUrl,
            xPercent,
            yPercent,
            viewportWidth: Math.round(rect.width),
            viewportHeight: Math.round(rect.height),
          }),
        });

        const data = (await response.json().catch(() => null)) as CaptureResponse | null;

        dispatchInspectCaptureEvent({
          id: captureId,
          demoUrl,
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
          error: response.ok ? undefined : (data?.error || "Kunde inte skapa punktbild"),
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
          setInspectStatus(`${data.pointSummary}${data.source ? ` (${data.source})` : ""}${matchHint}`);
        } else {
          setInspectStatus(`Senaste punkt: x ${xPercent}% • y ${yPercent}%`);
        }
        if (data?.element?.tag && ["html", "body"].includes(data.element.tag)) {
          toast("Tip: klicka närmare själva elementet (t.ex. knapptexten) för mer exakt DOM-träff.");
        }
      } catch {
        dispatchInspectCaptureEvent({
          id: captureId,
          demoUrl,
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
    [demoUrl, inspectMode, inspectEngine, isCapturePending, iframeLoading, externalLoading, flatFilesForAi, chatId, versionId, hoveredMapElement],
  );

  const isOwnEnginePreview = useMemo(() => {
    if (!demoUrl) return false;
    return demoUrl.startsWith("/api/preview-render");
  }, [demoUrl]);

  useEffect(() => {
    return () => {
      if (inspectPulseTimerRef.current) {
        clearTimeout(inspectPulseTimerRef.current);
      }
      clearPreviewReadyTimer();
    };
  }, [clearPreviewReadyTimer]);

  useEffect(() => {
    previewIssueKeysRef.current.clear();
  }, [chatId, versionId, demoUrl]);

  useEffect(() => {
    if (!demoUrl) return;
    setIframeLoading(true);
    setIframeError(false);
  }, [demoUrl, refreshToken]);

  useEffect(() => {
    const handlePreviewMessage = (event: MessageEvent<PreviewIframeMessage>) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object" || data.source !== "sajtmaskin-preview") return;
      if (!isOwnEnginePreview || data.type !== "preview-error") return;
      void reportPreviewIssue(data.payload ?? {});
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, [isOwnEnginePreview, reportPreviewIssue]);

  useEffect(() => {
    if (!demoUrl) return;
    setElementMap([]);
    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timerId = window.setTimeout(() => {
          window.clearTimeout(timerId);
          resolve();
        }, ms);
      });

    const run = async () => {
      // Retry map extraction up to ~10s to avoid false empty/502 during warmup.
      const delays = [2000, 3000, 5000];
      for (const delay of delays) {
        await sleep(delay);
        if (cancelled) return;
        const container = iframeRef.current?.parentElement;
        const w = container?.clientWidth || 1280;
        const h = container?.clientHeight || 800;
        const count = await fetchElementMap(demoUrl, w, h);
        if (cancelled) return;
        if (count > 0) return;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [demoUrl, versionId, fetchElementMap]);

  useEffect(() => {
    if (!placementMode) return;
    setInspectMode(false);
    setHoveredMapElement(null);
  }, [placementMode]);

  useEffect(() => {
    if (!placementMode || !demoUrl) {
      setHoveredPlacement(null);
      return;
    }
    const container = iframeRef.current?.parentElement;
    const w = container?.clientWidth || 1280;
    const h = container?.clientHeight || 800;
    void fetchElementMap(demoUrl, w, h);
  }, [placementMode, demoUrl, fetchElementMap]);

  const canShowCode = Boolean(chatId && versionId);
  const isCodeView = viewMode !== "preview";
  const showElementRegistry = viewMode === "registry";

  const handleInspectInNewTab = useCallback(() => {
    if (!demoUrl) return;
    window.open(demoUrl, "_blank", "noopener,noreferrer");
    toast("Sidan öppnades i ny flik.\nAnvänd Ctrl+Shift+C för att inspektera element.", {
      duration: 6000,
    });
  }, [demoUrl]);

  const handleToggleCode = useCallback(() => {
    if (!canShowCode) return;
    startViewSwitchTransition(() => {
      setViewMode((prev) => (prev === "code" ? "preview" : "code"));
      setSelectedRegistryId(null);
      setSelectedRegistryLine(null);
    });
  }, [canShowCode, startViewSwitchTransition]);

  const handleToggleElementRegistry = useCallback(() => {
    if (!canShowCode) return;
    startViewSwitchTransition(() => {
      setViewMode((prev) => (prev === "registry" ? "preview" : "registry"));
    });
  }, [canShowCode, startViewSwitchTransition]);

  const selectedFile = useMemo(() => {
    if (!selectedPath) return null;
    const walk = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.path === selectedPath) return node;
        if (node.type === "folder" && node.children) {
          const hit = walk(node.children);
          if (hit) return hit;
        }
      }
      return null;
    };
    return walk(files);
  }, [files, selectedPath]);

  const getPreferredFilePath = useCallback((flatFiles: Array<{ name: string }>) => {
    const candidates = ["app/page.tsx", "src/app/page.tsx", "pages/index.tsx", "page.tsx", "Page.tsx"];
    for (const candidate of candidates) {
      const match = flatFiles.find((file) => file.name.endsWith(candidate));
      if (match) return match.name;
    }
    return flatFiles[0]?.name || null;
  }, []);

  const findFirstFile = useCallback((nodes: FileNode[]): FileNode | null => {
    for (const node of nodes) {
      if (node.type === "file") return node;
      if (node.children?.length) {
        const hit = findFirstFile(node.children);
        if (hit) return hit;
      }
    }
    return null;
  }, []);

  const getLanguageFromName = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (ext === "ts") return "typescript";
    if (ext === "tsx") return "tsx";
    if (ext === "js") return "javascript";
    if (ext === "jsx") return "jsx";
    if (ext === "json") return "json";
    if (ext === "css") return "css";
    if (ext === "md") return "markdown";
    if (ext === "html") return "html";
    return "text";
  };

  useEffect(() => {
    if (!isCodeView || !chatId || !versionId) return;
    let isActive = true;
    const controller = new AbortController();
    const loadFiles = async () => {
      setFilesLoading(true);
      setFilesError(null);
      try {
        const response = await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(versionId)}`,
          { signal: controller.signal },
        );
        const data = (await response.json().catch(() => null)) as {
          files?: Array<{ name: string; content: string; locked?: boolean }>;
          error?: string;
        } | null;
        if (!response.ok) throw new Error(data?.error || `Failed to fetch files (HTTP ${response.status})`);
        const flatFiles: Array<{ name: string; content: string; locked?: boolean }> = Array.isArray(data?.files) ? data.files : [];
        const tree = buildFileTree(flatFiles);
        const preferredPath = getPreferredFilePath(flatFiles);
        const preferredNode =
          (preferredPath &&
            (function findByPath(nodes: FileNode[], target: string): FileNode | null {
              for (const node of nodes) {
                if (node.path === target) return node;
                if (node.children?.length) { const hit = findByPath(node.children, target); if (hit) return hit; }
              }
              return null;
            })(tree, preferredPath)) ||
          findFirstFile(tree);
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
    loadFiles();
    return () => { isActive = false; controller.abort(); };
  }, [isCodeView, chatId, versionId, findFirstFile, getPreferredFilePath]);

  const elementRegistry = useMemo(() => buildJsxElementRegistry(files), [files]);
  elementRegistryRef.current = elementRegistry;

  useEffect(() => {
    if (!showElementRegistry || !selectedRegistryLine) return;
    const container = codeScrollRef.current;
    if (!container) return;
    const approxLineHeight = 18;
    container.scrollTo({
      top: Math.max(0, (selectedRegistryLine - 4) * approxLineHeight),
      behavior: "smooth",
    });
  }, [showElementRegistry, selectedRegistryLine, selectedPath]);

  const handleIframeLoad = useCallback(() => {
    clearPreviewReadyTimer();

    const iframe = iframeRef.current;
    if (!iframe) {
      setIframeLoading(false);
      setIframeError(false);
      return;
    }

    // For own-engine preview, wait until iframe DOM actually contains rendered content.
    if (isOwnEnginePreview) {
      const startedAt = Date.now();
      const checkReady = () => {
        try {
          const doc = iframe.contentDocument;
          const previewIssue = detectOwnEnginePreviewIssue(doc);
          if (previewIssue) {
            setIframeLoading(false);
            setIframeError(false);
            clearPreviewReadyTimer();
            void reportPreviewIssue(previewIssue);
            return;
          }
          const root = doc?.getElementById("root");
          const hasRootChildren = Boolean(root && root.childElementCount > 0);
          const hasBodyContent = Boolean((doc?.body?.innerText || "").trim().length > 0);
          const hasSubstantialDom = Boolean((doc?.body?.querySelectorAll("*").length || 0) > 12);
          if (hasRootChildren || hasBodyContent || hasSubstantialDom) {
            setIframeLoading(false);
            setIframeError(false);
            clearPreviewReadyTimer();
            return;
          }
        } catch {
          // If we cannot access iframe document, do not block loading spinner forever.
          setIframeLoading(false);
          setIframeError(false);
          clearPreviewReadyTimer();
          return;
        }

        if (Date.now() - startedAt >= PREVIEW_READY_TIMEOUT_MS) {
          setIframeLoading(false);
          setIframeError(false);
          clearPreviewReadyTimer();
          return;
        }

        previewReadyTimerRef.current = window.setTimeout(checkReady, PREVIEW_READY_POLL_MS);
      };

      previewReadyTimerRef.current = window.setTimeout(checkReady, PREVIEW_READY_POLL_MS);
      return;
    }

    setIframeLoading(false);
    setIframeError(false);
  }, [clearPreviewReadyTimer, isOwnEnginePreview, reportPreviewIssue]);

  const handleIframeError = useCallback(() => {
    clearPreviewReadyTimer();
    setIframeLoading(false);
    setIframeError(true);
    if (isOwnEnginePreview) {
      void reportPreviewIssue({
        message: "Preview iframe failed to load.",
        kind: "transport",
      });
    }
  }, [clearPreviewReadyTimer, isOwnEnginePreview, reportPreviewIssue]);

  const handleRefresh = () => {
    clearPreviewReadyTimer();
    setIframeLoading(true);
    setIframeError(false);
    const iframe = iframeRef.current;
    if (iframe) {
      const base = demoUrl || iframe.src;
      if (!base) return;
      iframe.src = buildPreviewSrc(base, Date.now());
    }
  };

  const handleOpenInNewTab = () => {
    if (demoUrl) window.open(demoUrl, "_blank", "noopener,noreferrer");
  };

  const handleClear = () => {
    if (!onClear) return;
    clearPreviewReadyTimer();
    setIframeLoading(true);
    setIframeError(false);
    onClear();
  };

  const blobStatus = useMemo(
    () => integrationStatus?.items.find((item) => item.id === "vercel-blob") || null,
    [integrationStatus],
  );
  const isSandboxPreview = useMemo(() => {
    if (!demoUrl) return false;
    try { return /sandbox/i.test(new URL(demoUrl).hostname); } catch { return demoUrl.toLowerCase().includes("sandbox"); }
  }, [demoUrl]);
  if (!demoUrl && !isCodeView) {
    const isInitialEmpty = !chatId && !versionId && !externalLoading;
    const title = awaitingInput ? "AI väntar på ditt svar" : isInitialEmpty ? "Välkommen" : "Ingen förhandsvisning ännu";
    const subtitle = awaitingInput
      ? "V0 behöver input innan preview kan genereras — se chatten till vänster."
      : externalLoading ? "AI tänker... preview kommer strax."
      : isInitialEmpty ? "Skriv en prompt till vänster så genererar vi första preview."
      : "Preview saknas för senaste versionen. Testa att generera igen eller reparera.";
    const showFixAction = Boolean(onFixPreview && !externalLoading && !isInitialEmpty && !awaitingInput);
    const EmptyIcon = awaitingInput ? MessageCircleQuestion : isInitialEmpty ? Wand2 : AlertCircle;
    return (
      <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-500">
        <EmptyIcon className="mb-4 h-12 w-12" />
        <p className="mb-2 text-lg font-medium tracking-tight" suppressHydrationWarning>{title}</p>
        <p className="text-sm" suppressHydrationWarning>{subtitle}</p>
        {showFixAction && (
          <Button className="mt-4" onClick={onFixPreview} disabled={externalLoading}>Försök reparera preview</Button>
        )}
      </div>
    );
  }

  const isLoading = externalLoading || iframeLoading;
  const previewSrc = demoUrl ? buildPreviewSrc(demoUrl, refreshToken) : "";
  const isV0Preview = Boolean(demoUrl && !isOwnEnginePreview && demoUrl.includes("vusercontent.net"));
  const showBlobWarning = Boolean(demoUrl && !isOwnEnginePreview && blobStatus && !blobStatus.enabled);
  const showExternalWarning = Boolean(demoUrl && isV0Preview);
  const showSandboxWarning = Boolean(demoUrl && !isOwnEnginePreview && isSandboxPreview);
  const showImagesDisabledWarning = Boolean(demoUrl && !imageGenerationsEnabled);
  const showImagesUnsupportedWarning = Boolean(demoUrl && imageGenerationsEnabled && !imageGenerationsSupported);
  const showBlobConfigWarning = Boolean(demoUrl && imageGenerationsEnabled && !isBlobConfigured);
  const showWorkerLamp = inspectorWorkerStatus !== "disabled";
  const workerLampClass =
    inspectorWorkerStatus === "healthy"
      ? "bg-emerald-400"
      : inspectorWorkerStatus === "unknown"
        ? "bg-amber-400 animate-pulse"
        : "bg-rose-400";
  const workerLampTitle =
    inspectorWorkerStatus === "healthy"
      ? "Inspector worker är online."
      : inspectorWorkerStatus === "unknown"
        ? "Kontrollerar inspector worker..."
        : inspectorWorkerMessage || "Inspector worker är offline. Fallback används.";
  const showPlacementOverlay = placementMode && Boolean(demoUrl);
  const showInspectOverlay = inspectMode && !showPlacementOverlay;

  return (
    <div className="flex h-full flex-col bg-black/40">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <h3 className="font-semibold tracking-tight text-white">Preview</h3>
        <div className="flex items-center gap-1">
          {showWorkerLamp && (
            <div
              className="mr-1 inline-flex items-center gap-1 rounded border border-gray-700 bg-black/40 px-2 py-1 text-[11px] text-gray-400"
              title={workerLampTitle}
            >
              <span className={cn("h-2 w-2 rounded-full", workerLampClass)} />
              <span>Worker</span>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={handleInspectInNewTab} disabled={!demoUrl} title="Öppna i ny flik för inspektion (Ctrl+Shift+C)" className="text-gray-400 hover:text-white">
            <MousePointer2 className="mr-1 h-4 w-4" />
            Inspektionsläge
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleInspect}
            disabled={!demoUrl || placementMode}
            title={
              placementMode
                ? "Placering aktiv - avsluta placering först"
                : "Markera punkt i preview och skicka till chatten"
            }
            className={cn(
              "text-gray-400 hover:text-white",
              inspectMode && "bg-emerald-900/50 text-emerald-300 hover:text-emerald-200",
            )}
          >
            <Search className="mr-1 h-4 w-4" />
            Inspektionstestknapp
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggleElementRegistry} disabled={!canShowCode || isViewSwitchPending} title={canShowCode ? "Inspektera kod via elementregister" : "Ingen kod tillgänglig än"} className={cn("text-gray-400 hover:text-white", showElementRegistry && "bg-purple-900/40 text-purple-200 hover:text-purple-100")}>
            <Code2 className="mr-1 h-4 w-4" />
            Inspektera kod
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggleCode} disabled={!canShowCode || isViewSwitchPending} title={canShowCode ? "Visa kod" : "Ingen kod tillgänglig än"} className={cn("text-gray-400 hover:text-white", viewMode === "code" && "bg-gray-800 text-white hover:text-white")}>
            <FileText className="mr-1 h-4 w-4" />
            Kod
          </Button>
          {demoUrl && onClear && (
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={isLoading} title="Rensa preview" className="text-gray-400 hover:text-white">Rensa</Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading} title="Uppdatera preview" aria-label="Uppdatera preview" className="text-gray-400 hover:text-white">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleOpenInNewTab} title="Öppna i ny flik" className="text-gray-400 hover:text-white">
            <ExternalLink className="mr-1 h-4 w-4" />
            Öppna
          </Button>
        </div>
      </div>
      {!isCodeView && isOwnEnginePreview && (
        <div className="border-b border-sky-900/40 bg-sky-950/30 px-4 py-2 text-xs text-sky-200">
          <div>Egen motor — preview renderas lokalt med React + Tailwind. Vissa Next.js-funktioner (routing, server components) visas inte.</div>
        </div>
      )}
      {!isCodeView && !isOwnEnginePreview && (showBlobWarning || showExternalWarning || showSandboxWarning || integrationError || showImagesDisabledWarning || showImagesUnsupportedWarning || showBlobConfigWarning) && (
        <div className="border-b border-yellow-900/40 bg-yellow-950/30 px-4 py-2 text-xs text-yellow-200">
          {showExternalWarning && <div>Sajmaskinens preview körs i utvecklingsmilö för snabbhet. Externa media‑URL:er kan ge 404 eller blockeras. Ladda upp media via mediabiblioteket för publika Blob‑URL:er.</div>}
          {showSandboxWarning && <div>Preview körs från sandbox. Sandbox har separat runtime och kan sakna samma miljövariabler som din ordinarie miljö (t.ex. blob-token).</div>}
          {showBlobWarning && <div>Vercel Blob saknas. AI‑bilder och uppladdningar visas inte i preview förrän BLOB_READ_WRITE_TOKEN är konfigurerad.</div>}
          {showImagesDisabledWarning && <div>AI-bilder är avstängda i chat-inställningarna för den här sessionen.</div>}
          {showImagesUnsupportedWarning && <div>Bildgenerering är inte tillgänglig just nu (saknad/ogiltig AI-konfiguration).</div>}
          {showBlobConfigWarning && <div>Blob är inte aktivt. Bilder kan skapas av AI men saknas i preview tills blob är konfigurerad.</div>}
          {integrationError && <div>Kunde inte hämta integrationsstatus. Media kan saknas i preview.</div>}
        </div>
      )}

      {isCodeView ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r border-gray-800 bg-black/50">
            {showElementRegistry ? (
              <ElementRegistry
                items={elementRegistry}
                selectedId={selectedRegistryId}
                isLoading={filesLoading}
                error={filesError}
                onSelect={(item) => {
                  setSelectedRegistryId(item.id);
                  setSelectedRegistryLine(item.lineNumber);
                  setSelectedPath(item.filePath);
                }}
              />
            ) : (
              <FileExplorer
                files={files}
                selectedPath={selectedPath}
                onFileSelect={(file) => {
                  setSelectedRegistryId(null);
                  setSelectedRegistryLine(null);
                  setSelectedPath(file.path);
                }}
                isLoading={filesLoading}
                error={filesError}
              />
            )}
          </div>
          <div ref={codeScrollRef} className="flex-1 overflow-auto p-4">
            {!selectedFile ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">Ingen fil vald</div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-gray-300">{selectedFile.path}</div>
                {showElementRegistry && selectedRegistryLine && (
                  <div className="text-xs text-purple-300">Målrad: {selectedRegistryLine}</div>
                )}
                <CodeBlock code={selectedFile.content || ""} language={getLanguageFromName(selectedFile.name)} showLineNumbers>
                  <CodeBlockCopyButton className="text-gray-300 hover:text-white" />
                </CodeBlock>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative flex-1 overflow-hidden bg-gray-950">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
              <div className="text-center">
                <Loader2 className="text-primary mx-auto mb-2 h-8 w-8 animate-spin" />
                <p className="text-muted-foreground text-sm">Laddar preview...</p>
              </div>
            </div>
          )}
          {iframeError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 p-4">
              <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
              <p className="mb-4 text-center text-sm text-gray-400">Preview kunde inte laddas i iframe. Öppna i ny flik istället.</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={handleOpenInNewTab}><ExternalLink className="mr-2 h-4 w-4" />Öppna i ny flik</Button>
                {onFixPreview && <Button variant="outline" onClick={onFixPreview} disabled={isLoading}>Försök reparera preview</Button>}
              </div>
            </div>
          )}
          <iframe
            id="preview-iframe"
            ref={iframeRef}
            src={previewSrc}
            className="h-full w-full border-0"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Preview"
          />

          {showPlacementOverlay && (
            <>
              <div
                className={cn(
                  "absolute inset-0 z-20 cursor-crosshair bg-sky-950/10",
                  (iframeLoading || externalLoading) && "pointer-events-none",
                )}
                onClick={handlePlacementClick}
                onMouseMove={handlePlacementMouseMove}
                onMouseLeave={() => setHoveredPlacement(null)}
              />
              {hoveredPlacement && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-dashed border-sky-400"
                  style={{ top: `${hoveredPlacement.lineYPercent}%` }}
                >
                  <div className="absolute -top-6 left-3 rounded bg-sky-950/90 px-2 py-1 text-[11px] text-sky-200 shadow-lg">
                    {hoveredPlacement.label}
                  </div>
                </div>
              )}
              <div className="absolute top-3 left-3 right-3 z-30 rounded border border-sky-700/70 bg-sky-950/85 px-3 py-2 text-xs text-sky-100 shadow-lg backdrop-blur-sm">
                <div className="font-semibold tracking-tight text-sky-300">
                  Placering aktiv
                </div>
                <div className="mt-1">
                  Klicka i previewn för att placera{" "}
                  <span className="font-medium text-white">
                    {pendingPlacementItem?.title || "det valda elementet"}
                  </span>
                  .
                </div>
                {pendingPlacementItem?.description ? (
                  <div className="mt-1 text-sky-200/85">{pendingPlacementItem.description}</div>
                ) : null}
                <div className="mt-1 text-[11px] text-sky-200/80">
                  {elementMapLoading
                    ? "Laddar elementkarta för exakt placering..."
                    : `Identifierade zoner: ${sectionZones.length}`}
                </div>
              </div>
            </>
          )}

          {showInspectOverlay && (
            <>
              <div
                className={cn(
                  "absolute inset-0 z-20 cursor-crosshair bg-emerald-950/5",
                  isCapturePending && "pointer-events-none",
                )}
                onClick={handleCaptureClick}
                onMouseMove={inspectEngine === "map" && elementMap.length > 0 ? (e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) return;
                  const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                  const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                  let best: ElementMapItem | null = null;
                  let bestArea = Infinity;
                  for (const el of elementMap) {
                    const vp = el.vpPercent;
                    if (xPct >= vp.x && xPct <= vp.x + vp.w && yPct >= vp.y && yPct <= vp.y + vp.h) {
                      const area = vp.w * vp.h;
                      if (area < bestArea && area > 0.01) {
                        best = el;
                        bestArea = area;
                      }
                    }
                  }
                  setHoveredMapElement(best);
                } : undefined}
                onMouseLeave={inspectEngine === "map" ? () => setHoveredMapElement(null) : undefined}
              />
              {inspectEngine === "map" && hoveredMapElement && (
                <div
                  className="pointer-events-none absolute z-25 border-2 border-violet-400 bg-violet-500/10"
                  style={{
                    left: `${hoveredMapElement.vpPercent.x}%`,
                    top: `${hoveredMapElement.vpPercent.y}%`,
                    width: `${hoveredMapElement.vpPercent.w}%`,
                    height: `${hoveredMapElement.vpPercent.h}%`,
                  }}
                >
                  <div className="absolute bottom-full left-0 mb-1 max-w-64 truncate rounded bg-zinc-900/95 px-2 py-1 text-[11px] text-violet-200 shadow-lg">
                    &lt;{hoveredMapElement.tag}&gt;{hoveredMapElement.text ? ` "${hoveredMapElement.text.slice(0, 40)}"` : ""}{hoveredMapElement.className ? ` .${hoveredMapElement.className.split(/\s+/).slice(0, 2).join(".")}` : ""}
                  </div>
                </div>
              )}
              {inspectPulse && (
                <div
                  key={inspectPulse.key}
                  className="pointer-events-none absolute z-30"
                  style={{ left: inspectPulse.x, top: inspectPulse.y }}
                >
                  <span className="absolute -translate-x-1/2 -translate-y-1/2 inline-flex h-11 w-11 animate-ping rounded-full border-2 border-rose-400 bg-rose-500/30" />
                  <span className="absolute -translate-x-1/2 -translate-y-1/2 inline-flex h-4 w-4 rounded-full bg-rose-500 ring-2 ring-white/90 shadow-[0_0_0_2px_rgba(0,0,0,0.35)]" />
                </div>
              )}
              <div className="absolute right-0 bottom-0 left-0 z-30 border-t border-emerald-800/60 bg-zinc-950/95 px-4 py-3 text-xs text-gray-300 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tracking-tight text-emerald-400">Inspektion aktiv</span>
                      <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900/80 px-1.5 py-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setInspectEngine("playwright")}
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
                            inspectEngine === "playwright" ? "bg-emerald-800 text-emerald-200" : "text-zinc-500 hover:text-zinc-300",
                          )}
                          title="Playwright: headless browser (screenshot + DOM)"
                        >
                          <Zap className="h-2.5 w-2.5" />
                          PW
                        </button>
                        <button
                          type="button"
                          onClick={() => setInspectEngine("ai")}
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
                            inspectEngine === "ai" ? "bg-purple-800 text-purple-200" : "text-zinc-500 hover:text-zinc-300",
                          )}
                          title="AI: gpt-4o-mini analyserar koden"
                        >
                          <BrainCircuit className="h-2.5 w-2.5" />
                          AI
                        </button>
                        <button
                          type="button"
                          onClick={() => setInspectEngine("map")}
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
                            inspectEngine === "map" ? "bg-violet-800 text-violet-200" : "text-zinc-500 hover:text-zinc-300",
                          )}
                          title="Map: forkompilerad elementkarta med hover"
                        >
                          <MousePointer2 className="h-2.5 w-2.5" />
                          Map
                        </button>
                      </span>
                      {inspectEngine === "map" && (
                        <span className="text-[10px] text-violet-400/70">
                          {elementMapLoading ? "Laddar karta..." : inspectorUnavailable ? "Inspector kräver Playwright eller inspector-worker" : `${elementMap.length} element`}
                        </span>
                      )}
                      {totalAiCostUsd > 0 && (
                        <span className="text-[10px] text-amber-400/70" title="Total AI-kostnad denna session">
                          session: ${totalAiCostUsd.toFixed(4)}{lastAiCostDisplay ? ` (senaste: ${lastAiCostDisplay})` : ""}
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-400">
                      {inspectEngine === "map"
                        ? "Hovra för att markera element. Klicka för att välja."
                        : inspectEngine === "ai"
                          ? "Klicka i previewn — AI identifierar elementet i koden."
                          : "Klicka i previewn — Playwright tar screenshot + hittar DOM-element."}
                    </div>
                    {inspectStatus && <div className="mt-1 whitespace-pre-line text-zinc-500">{inspectStatus}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {isCapturePending && (
                      <div className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">Skapar bild...</div>
                    )}
                    {lastCodeMatch && (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectMode(false);
                          startViewSwitchTransition(() => {
                            setViewMode("registry");
                            setSelectedRegistryId(lastCodeMatch.item.id);
                            setSelectedRegistryLine(lastCodeMatch.item.lineNumber);
                            setSelectedPath(lastCodeMatch.item.filePath);
                          });
                        }}
                        className="rounded bg-purple-900/60 px-2 py-1 text-[11px] font-medium text-purple-200 transition-colors hover:bg-purple-800/70 hover:text-white"
                        title={`Visa ${lastCodeMatch.item.filePath}:${lastCodeMatch.item.lineNumber}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Code2 className="h-3.5 w-3.5" />
                          Visa i kod
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleToggleInspect}
                      className="rounded bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:text-white"
                      title="Stäng inspektionstest"
                    >
                      <span className="inline-flex items-center gap-1">
                        <X className="h-3.5 w-3.5" />
                        Avsluta
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
