"use client";

import { AlertCircle, ExternalLink, FileText, Loader2, MousePointer2, RefreshCw, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { buildFileTree } from "@/lib/builder/fileTree";
import type { FileNode, InspectorSelection } from "@/lib/builder/types";
import { FileExplorer } from "@/components/builder/FileExplorer";
import { cn } from "@/lib/utils";

interface PreviewPanelProps {
  chatId: string | null;
  versionId: string | null;
  demoUrl: string | null;
  isLoading?: boolean;
  onClear?: () => void;
  onFixPreview?: () => void;
  refreshToken?: number;
  onInspectorSelection?: (selection: InspectorSelection | null) => void;
  inspectorClearToken?: number;
  imageGenerationsEnabled?: boolean;
  imageGenerationsSupported?: boolean;
  isBlobConfigured?: boolean;
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
  onInspectorSelection,
  inspectorClearToken,
  imageGenerationsEnabled = true,
  imageGenerationsSupported = true,
  isBlobConfigured = false,
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
  const [isInspectorMode, setIsInspectorMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const buildPreviewSrc = useCallback((url: string, token?: number, inspectorMode?: boolean) => {
    let src = inspectorMode ? `/api/proxy-preview?url=${encodeURIComponent(url)}` : url;
    if (token) {
      const separator = src.includes("?") ? "&" : "?";
      src = `${src}${separator}t=${token}`;
    }
    return src;
  }, []);
  const sendInspectorMessage = useCallback((message: { type: string; value?: unknown }) => {
    const iframe = iframeRef.current;
    const targetWindow = iframe?.contentWindow;
    if (!targetWindow) return;
    targetWindow.postMessage({ __fromParentInspector: true, ...message }, "*");
  }, []);
  const clearInspectorSelection = useCallback(() => {
    sendInspectorMessage({ type: "clear-selection" });
    onInspectorSelection?.(null);
  }, [onInspectorSelection, sendInspectorMessage]);

  useEffect(() => {
    if (!demoUrl) return;
    setIframeLoading(true);
    setIframeError(false);
  }, [demoUrl, refreshToken, isInspectorMode]);

  useEffect(() => {
    if (!isInspectorMode || !demoUrl) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { __fromInspector?: boolean; type?: string; payload?: unknown } | null;
      if (!data || data.__fromInspector !== true) return;
      const targetWindow = iframeRef.current?.contentWindow;
      if (!targetWindow || event.source !== targetWindow) return;
      if (data.type !== "select") return;
      const payload = data.payload as Partial<InspectorSelection> | null;
      if (!payload || typeof payload.tag !== "string" || typeof payload.selector !== "string") return;
      onInspectorSelection?.({
        tag: payload.tag,
        id: payload.id ?? null,
        className: payload.className ?? null,
        text: payload.text ?? null,
        selector: payload.selector,
      });
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [demoUrl, isInspectorMode, onInspectorSelection]);

  useEffect(() => {
    if (inspectorClearToken === undefined) return;
    clearInspectorSelection();
  }, [inspectorClearToken, clearInspectorSelection]);

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
  const canUseInspector = Boolean(demoUrl) && !showCode;

  useEffect(() => {
    if (!isInspectorMode) return;
    if (canUseInspector) return;
    setIsInspectorMode(false);
    clearInspectorSelection();
  }, [isInspectorMode, canUseInspector, clearInspectorSelection]);

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
    const candidates = [
      "app/page.tsx",
      "src/app/page.tsx",
      "pages/index.tsx",
      "page.tsx",
      "Page.tsx",
    ];
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
          `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
            versionId,
          )}`,
          { signal: controller.signal },
        );
        const data = (await response.json().catch(() => null)) as {
          files?: Array<{ name: string; content: string; locked?: boolean }>;
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(data?.error || `Failed to fetch files (HTTP ${response.status})`);
        }
        const flatFiles: Array<{ name: string; content: string; locked?: boolean }> = Array.isArray(
          data?.files,
        )
          ? data.files
          : [];
        const tree = buildFileTree(flatFiles);
        const preferredPath = getPreferredFilePath(flatFiles);
        const preferredNode =
          (preferredPath &&
            (function findByPath(nodes: FileNode[], target: string): FileNode | null {
              for (const node of nodes) {
                if (node.path === target) return node;
                if (node.children?.length) {
                  const hit = findByPath(node.children, target);
                  if (hit) return hit;
                }
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

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [showCode, chatId, versionId, findFirstFile, getPreferredFilePath]);

  const handleIframeLoad = () => {
    setIframeLoading(false);
    setIframeError(false);
  };

  const handleIframeError = () => {
    setIframeLoading(false);
    setIframeError(true);
  };

  const handleRefresh = () => {
    setIframeLoading(true);
    setIframeError(false);
    const iframe = iframeRef.current;
    if (iframe) {
      const base = demoUrl || iframe.src;
      if (!base) return;
      iframe.src = buildPreviewSrc(base, Date.now(), isInspectorMode);
    }
  };

  const handleOpenInNewTab = () => {
    if (demoUrl) {
      window.open(demoUrl, "_blank", "noopener,noreferrer");
    }
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

  if (!demoUrl && !showCode) {
    const isInitialEmpty = !chatId && !versionId && !externalLoading;
    const title = isInitialEmpty ? "Välkommen" : "Ingen förhandsvisning ännu";
    const subtitle = externalLoading
      ? "AI tänker... preview kommer strax."
      : isInitialEmpty
        ? "Skriv en prompt till vänster så genererar vi första preview."
        : "Preview saknas för senaste versionen. Testa att generera igen eller reparera.";
    const showFixAction = Boolean(onFixPreview && !externalLoading && !isInitialEmpty);
    const EmptyIcon = isInitialEmpty ? Wand2 : AlertCircle;
    return (
      <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-500">
        <EmptyIcon className="mb-4 h-12 w-12" />
        <p className="mb-2 text-lg font-medium tracking-tight">{title}</p>
        <p className="text-sm">{subtitle}</p>
        {showFixAction && (
          <Button className="mt-4" onClick={onFixPreview} disabled={externalLoading}>
            Försök reparera preview
          </Button>
        )}
      </div>
    );
  }

  const isLoading = externalLoading || iframeLoading;
  const previewSrc = demoUrl ? buildPreviewSrc(demoUrl, refreshToken, isInspectorMode) : "";
  const isV0Preview = Boolean(demoUrl && demoUrl.includes("vusercontent.net"));
  const showBlobWarning = Boolean(demoUrl && blobStatus && !blobStatus.enabled);
  const showExternalWarning = Boolean(demoUrl && isV0Preview);
  const showImagesDisabledWarning = Boolean(demoUrl && !imageGenerationsEnabled);
  const showImagesUnsupportedWarning = Boolean(
    demoUrl && imageGenerationsEnabled && !imageGenerationsSupported,
  );
  const showBlobConfigWarning = Boolean(demoUrl && imageGenerationsEnabled && !isBlobConfigured);

  return (
    <div className="flex h-full flex-col bg-black/40">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <h3 className="font-semibold tracking-tight text-white">Preview</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!canUseInspector) return;
              setIsInspectorMode((prev) => {
                const next = !prev;
                if (prev && !next) {
                  clearInspectorSelection();
                }
                return next;
              });
            }}
            disabled={!canUseInspector}
            title={canUseInspector ? "Inspektionsläge" : "Ingen preview att inspektera"}
            aria-label="Inspektionsläge"
            aria-pressed={isInspectorMode}
            className={cn(
              "text-gray-400 hover:text-white",
              isInspectorMode && "bg-gray-800 text-white hover:text-white",
            )}
          >
            <MousePointer2 className="mr-1 h-4 w-4" />
            Inspektionsläge
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCode((prev) => !prev)}
            disabled={!canShowCode}
            title={canShowCode ? "Visa kod" : "Ingen kod tillgänglig än"}
            className={cn(
              "text-gray-400 hover:text-white",
              showCode && "bg-gray-800 text-white hover:text-white",
            )}
          >
            <FileText className="mr-1 h-4 w-4" />
            Kod
          </Button>
          {demoUrl && onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={isLoading}
              title="Rensa preview"
              className="text-gray-400 hover:text-white"
            >
              Rensa
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Uppdatera preview"
            aria-label="Uppdatera preview"
            className="text-gray-400 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInNewTab}
            title="Öppna i ny flik"
            className="text-gray-400 hover:text-white"
          >
            <ExternalLink className="mr-1 h-4 w-4" />
            Öppna
          </Button>
        </div>
      </div>
      {!showCode &&
        (showBlobWarning ||
          showExternalWarning ||
          integrationError ||
          showImagesDisabledWarning ||
          showImagesUnsupportedWarning ||
          showBlobConfigWarning) && (
        <div className="border-b border-yellow-900/40 bg-yellow-950/30 px-4 py-2 text-xs text-yellow-200">
          {showExternalWarning && (
            <div>
              Sajmaskinens preview körs i utvecklingsmilö för snabbhet. Externa media‑URL:er kan ge 404 eller blockeras. Ladda upp media
              via mediabiblioteket för publika Blob‑URL:er.
            </div>
          )}
          {showBlobWarning && (
            <div>
              Vercel Blob saknas. AI‑bilder och uppladdningar visas inte i preview förrän
              BLOB_READ_WRITE_TOKEN är konfigurerad.
            </div>
          )}
          {showImagesDisabledWarning && (
            <div>AI-bilder är avstängda i chat-inställningarna för den här sessionen.</div>
          )}
          {showImagesUnsupportedWarning && (
            <div>Bildgenerering är inte tillgänglig just nu (saknad/ogiltig AI-konfiguration).</div>
          )}
          {showBlobConfigWarning && (
            <div>
              Blob är inte aktivt. Bilder kan skapas av AI men saknas i preview tills blob är
              konfigurerad.
            </div>
          )}
          {integrationError && (
            <div>Kunde inte hämta integrationsstatus. Media kan saknas i preview.</div>
          )}
        </div>
      )}

      {showCode ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r border-gray-800 bg-black/50">
            <FileExplorer
              files={files}
              selectedPath={selectedPath}
              onFileSelect={(file) => setSelectedPath(file.path)}
              isLoading={filesLoading}
              error={filesError}
            />
          </div>
          <div className="flex-1 overflow-auto p-4">
            {!selectedFile ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Ingen fil vald
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-gray-300">{selectedFile.path}</div>
                <CodeBlock
                  code={selectedFile.content || ""}
                  language={getLanguageFromName(selectedFile.name)}
                  showLineNumbers
                >
                  <CodeBlockCopyButton className="text-gray-300 hover:text-white" />
                </CodeBlock>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative flex-1 overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
              <div className="text-center">
                <Loader2 className="text-primary mx-auto mb-2 h-8 w-8 animate-spin" />
                <p className="text-muted-foreground text-sm">Laddar preview...</p>
              </div>
            </div>
          )}

          {iframeError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 p-4">
              <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
              <p className="mb-4 text-center text-sm text-gray-400">
                Preview kunde inte laddas i iframe. Öppna i ny flik istället.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={handleOpenInNewTab}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Öppna i ny flik
                </Button>
                {onFixPreview && (
                  <Button variant="outline" onClick={onFixPreview} disabled={isLoading}>
                    Försök reparera preview
                  </Button>
                )}
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
        </div>
      )}
    </div>
  );
}
