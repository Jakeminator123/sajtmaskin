"use client";

import { AlertCircle, ExternalLink, FileText, Loader2, MessageCircleQuestion, MousePointer2, RefreshCw, Search, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { buildFileTree } from "@/lib/builder/fileTree";
import { dispatchInspectCaptureEvent } from "@/lib/builder/inspect-events";
import type { FileNode } from "@/lib/builder/types";
import { FileExplorer } from "@/components/builder/FileExplorer";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

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
}

type IntegrationItem = {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  requiredEnv: string[];
  affects: string;
  notes?: string;
};

type IntegrationStatus = {
  updatedAt: string;
  items: IntegrationItem[];
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
}: PreviewPanelProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [integrationError, setIntegrationError] = useState(false);
  const [isViewSwitchPending, startViewSwitchTransition] = useTransition();
  const [inspectMode, setInspectMode] = useState(false);
  const [isCapturePending, setIsCapturePending] = useState(false);
  const [inspectStatus, setInspectStatus] = useState<string | null>(null);
  const [inspectPulse, setInspectPulse] = useState<InspectPulseMarker | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const inspectPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildPreviewSrc = useCallback((url: string, token?: number) => {
    let src = url;
    if (token) {
      const separator = src.includes("?") ? "&" : "?";
      src = `${src}${separator}t=${token}`;
    }
    return src;
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
      }
      return next;
    });
    setInspectStatus("Klicka i previewn för att skapa en förbättrad punktbild.");
  }, [buildPreviewSrc, demoUrl]);

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
      setInspectStatus("Skapar punktbild...");

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
        if (data?.pointSummary) {
          setInspectStatus(`${data.pointSummary}${data.source ? ` (${data.source})` : ""}`);
        } else {
          setInspectStatus(`Senaste punkt: x ${xPercent}% • y ${yPercent}%`);
        }
        if (data?.element?.tag && ["html", "body"].includes(data.element.tag)) {
          toast("Tip: klicka närmare själva elementet (t.ex. knapptexten) för mer exakt DOM-träff.", {
            duration: 4500,
          });
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
    [demoUrl, inspectMode, isCapturePending, iframeLoading, externalLoading],
  );

  useEffect(() => {
    return () => {
      if (inspectPulseTimerRef.current) {
        clearTimeout(inspectPulseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!demoUrl) return;
    setIframeLoading(true);
    setIframeError(false);
  }, [demoUrl, refreshToken]);

  useEffect(() => {
    if (!demoUrl) return;
    let isActive = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch("/api/integrations/status", { signal: controller.signal });
        const data = (await res.json().catch(() => null)) as IntegrationStatus | null;
        if (!isActive) return;
        if (res.ok && data) {
          setIntegrationStatus(data);
          setIntegrationError(false);
        } else {
          setIntegrationError(true);
        }
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setIntegrationError(true);
      }
    };
    load();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [demoUrl]);

  const canShowCode = Boolean(chatId && versionId);

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
      setShowCode((prev) => !prev);
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
    if (!showCode || !chatId || !versionId) return;
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
  }, [showCode, chatId, versionId, findFirstFile, getPreferredFilePath]);

  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false);
    setIframeError(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeLoading(false);
    setIframeError(true);
  }, []);

  const handleRefresh = () => {
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

  if (!demoUrl && !showCode) {
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
        <p className="mb-2 text-lg font-medium tracking-tight">{title}</p>
        <p className="text-sm">{subtitle}</p>
        {showFixAction && (
          <Button className="mt-4" onClick={onFixPreview} disabled={externalLoading}>Försök reparera preview</Button>
        )}
      </div>
    );
  }

  const isLoading = externalLoading || iframeLoading;
  const previewSrc = demoUrl ? buildPreviewSrc(demoUrl, refreshToken) : "";
  const isV0Preview = Boolean(demoUrl && demoUrl.includes("vusercontent.net"));
  const showBlobWarning = Boolean(demoUrl && blobStatus && !blobStatus.enabled);
  const showExternalWarning = Boolean(demoUrl && isV0Preview);
  const showSandboxWarning = Boolean(demoUrl && isSandboxPreview);
  const showImagesDisabledWarning = Boolean(demoUrl && !imageGenerationsEnabled);
  const showImagesUnsupportedWarning = Boolean(demoUrl && imageGenerationsEnabled && !imageGenerationsSupported);
  const showBlobConfigWarning = Boolean(demoUrl && imageGenerationsEnabled && !isBlobConfigured);

  return (
    <div className="flex h-full flex-col bg-black/40">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <h3 className="font-semibold tracking-tight text-white">Preview</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleInspectInNewTab} disabled={!demoUrl} title="Öppna i ny flik för inspektion (Ctrl+Shift+C)" className="text-gray-400 hover:text-white">
            <MousePointer2 className="mr-1 h-4 w-4" />
            Inspektionsläge
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggleInspect} disabled={!demoUrl} title="Markera punkt i preview och skicka till chatten" className={cn("text-gray-400 hover:text-white", inspectMode && "bg-emerald-900/50 text-emerald-300 hover:text-emerald-200")}>
            <Search className="mr-1 h-4 w-4" />
            Inspektionstestknapp
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggleCode} disabled={!canShowCode || isViewSwitchPending} title={canShowCode ? "Visa kod" : "Ingen kod tillgänglig än"} className={cn("text-gray-400 hover:text-white", showCode && "bg-gray-800 text-white hover:text-white")}>
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
      {!showCode && (showBlobWarning || showExternalWarning || showSandboxWarning || integrationError || showImagesDisabledWarning || showImagesUnsupportedWarning || showBlobConfigWarning) && (
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

      {showCode ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r border-gray-800 bg-black/50">
            <FileExplorer files={files} selectedPath={selectedPath} onFileSelect={(file) => setSelectedPath(file.path)} isLoading={filesLoading} error={filesError} />
          </div>
          <div className="flex-1 overflow-auto p-4">
            {!selectedFile ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">Ingen fil vald</div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-gray-300">{selectedFile.path}</div>
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

          {inspectMode && (
            <>
              <div
                className={cn(
                  "absolute inset-0 z-20 cursor-crosshair bg-emerald-950/5",
                  isCapturePending && "pointer-events-none",
                )}
                onClick={handleCaptureClick}
              />
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
                  <div>
                    <div className="font-semibold tracking-tight text-emerald-400">Inspektionstestknapp aktiv</div>
                    <div className="text-zinc-400">
                      Klicka i previewn för att skapa en punkt till chatten (plupp med koordinater + bild).
                    </div>
                    {inspectStatus && <div className="mt-1 text-zinc-500">{inspectStatus}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {isCapturePending && (
                      <div className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">Skapar bild...</div>
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
