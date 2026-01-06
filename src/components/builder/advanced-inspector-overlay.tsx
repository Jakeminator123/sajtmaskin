"use client";

/**
 * AdvancedInspectorOverlay Component
 * ===================================
 *
 * NEW STRATEGY: Uses /api/proxy-preview to serve the page with a real origin.
 * This allows Next.js/React apps to hydrate correctly since they have access
 * to all their resources via the proxy.
 *
 * The proxy injects an inspector script that:
 * - Highlights elements on hover (purple)
 * - Selects elements on click (green)
 * - Communicates with parent via postMessage
 *
 * This is much more reliable than srcDoc for complex SPAs.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Loader2,
  AlertTriangle,
  Crosshair,
  RefreshCw,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBuilderStore } from "@/lib/data/store";
import { quickSearch } from "@/lib/code-crawler";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type PickInfo = {
  tag: string;
  id: string | null;
  className: string | null;
  text: string | null;
  selector: string;
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getElementDescription(info: PickInfo): string {
  const tagMap: Record<string, string> = {
    header: "Header",
    nav: "Navigation",
    footer: "Footer",
    section: "Sektion",
    article: "Artikel",
    aside: "Sidebar",
    main: "Huvudinnehåll",
    div: "Container",
    button: "Knapp",
    a: "Länk",
    img: "Bild",
    h1: "Huvudrubrik",
    h2: "Rubrik",
    h3: "Underrubrik",
    h4: "Rubrik",
    p: "Paragraf",
    span: "Text",
    ul: "Lista",
    ol: "Numrerad lista",
    li: "Listobjekt",
    form: "Formulär",
    input: "Inmatningsfält",
    textarea: "Textfält",
    label: "Etikett",
    table: "Tabell",
    svg: "Ikon/SVG",
  };

  const baseName = tagMap[info.tag] || info.tag.toUpperCase();

  const className = info.className || "";
  const classHints: string[] = [];

  if (className.includes("hero")) classHints.push("hero");
  if (className.includes("card")) classHints.push("kort");
  if (className.includes("nav")) classHints.push("nav");
  if (className.includes("footer")) classHints.push("footer");
  if (className.includes("header")) classHints.push("header");
  if (className.includes("btn") || className.includes("button"))
    classHints.push("knapp");
  if (className.includes("container")) classHints.push("container");
  if (className.includes("grid")) classHints.push("grid");
  if (className.includes("flex")) classHints.push("flex");

  if (classHints.length > 0) {
    return `${baseName} (${classHints.slice(0, 2).join(", ")})`;
  }

  if (info.text && info.text.length > 0) {
    const shortText =
      info.text.length > 30 ? info.text.slice(0, 30) + "..." : info.text;
    return `${baseName}: "${shortText}"`;
  }

  return baseName;
}

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface AdvancedInspectorOverlayProps {
  isActive: boolean;
  onToggle: () => void;
  demoUrl: string | null;
  onElementSelect: (description: string, codeContext: string | null) => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function AdvancedInspectorOverlay({
  isActive,
  onToggle,
  demoUrl,
  onElementSelect,
}: AdvancedInspectorOverlayProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const [hovered, setHovered] = useState<PickInfo | null>(null);
  const [selected, setSelected] = useState<PickInfo | null>(null);
  const [freeze, setFreeze] = useState<boolean>(false);

  const {
    files,
    setDesignModeCodeContext,
    setDesignModeInput,
    toggleDesignMode,
  } = useBuilderStore();

  // Post message to iframe
  const postToIframe = useCallback((message: Record<string, unknown>) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ ...message, __fromParentInspector: true }, "*");
  }, []);

  // Build proxy URL when demoUrl changes
  useEffect(() => {
    if (!demoUrl) {
      setProxyUrl(null);
      return;
    }
    // Use our proxy endpoint that serves the page with injected inspector script
    const url = `/api/proxy-preview?url=${encodeURIComponent(demoUrl)}`;
    setProxyUrl(url);
    setReady(false);
    setError(null);
    setHovered(null);
    setSelected(null);
    setFreeze(false);
  }, [demoUrl]);

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    // The injected script will send a "ready" message when it's attached
  }, []);

  // Handle iframe error
  const handleIframeError = useCallback(() => {
    setLoading(false);
    setError("Kunde inte ladda sidan");
  }, []);

  // Listen for messages from injected script
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { __fromInspector?: boolean; type?: string; payload?: unknown }
        | undefined;
      if (!data || data.__fromInspector !== true) return;

      if (data.type === "ready") {
        console.log("[AdvancedInspector] Inspector script ready");
        setReady(true);
        setLoading(false);
      }

      if (data.type === "hover" && data.payload) {
        setHovered(data.payload as PickInfo);
      }

      if (data.type === "select" && data.payload) {
        setSelected(data.payload as PickInfo);
        setFreeze(true);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Sync freeze state to iframe runtime
  useEffect(() => {
    if (ready) {
      postToIframe({ type: "set-freeze", value: freeze });
    }
  }, [freeze, ready, postToIframe]);

  // Clear selection in iframe when parent clears
  useEffect(() => {
    if (ready && !selected) {
      postToIframe({ type: "clear-selection" });
    }
  }, [selected, ready, postToIframe]);

  // Start loading when becoming active
  useEffect(() => {
    if (isActive && proxyUrl) {
      setLoading(true);
    }
  }, [isActive, proxyUrl]);

  // Reload handler
  const handleReload = useCallback(() => {
    if (!demoUrl) return;
    setLoading(true);
    setReady(false);
    setError(null);
    // Force iframe reload by changing key
    const newUrl = `/api/proxy-preview?url=${encodeURIComponent(demoUrl)}&t=${Date.now()}`;
    setProxyUrl(newUrl);
  }, [demoUrl]);

  // Handle element selection - find code and send to chat
  const handleUseElement = useCallback(() => {
    if (!selected) return;

    const description = getElementDescription(selected);

    // Run Code Crawler to find relevant code
    let codeContextStr: string | null = null;

    if (files && files.length > 0) {
      // Build hints from element info
      const hints: string[] = [selected.tag];
      if (selected.id) hints.push(selected.id);
      if (selected.className) {
        hints.push(
          ...selected.className.split(" ").filter((c) => c.length > 2)
        );
      }

      // Add semantic hints
      const classStr = (selected.className || "").toLowerCase();
      if (classStr.includes("hero")) hints.push("hero", "banner");
      if (classStr.includes("nav")) hints.push("navigation", "navbar");
      if (classStr.includes("footer")) hints.push("footer");
      if (classStr.includes("header")) hints.push("header");
      if (classStr.includes("card")) hints.push("card");
      if (classStr.includes("btn") || classStr.includes("button"))
        hints.push("button", "cta");

      const codeContext = quickSearch(files, hints.slice(0, 8));

      if (codeContext.length > 0) {
        console.log(
          "[AdvancedInspector] Found code context:",
          codeContext.map((c) => c.name)
        );
        setDesignModeCodeContext(codeContext);

        // Build code context string for prompt
        codeContextStr = codeContext
          .slice(0, 2)
          .map(
            (c) =>
              `// ${c.name} (rad ${c.lineNumbers[0]}-${c.lineNumbers[1]})\n${c.snippet}`
          )
          .join("\n\n");
      }
    }

    // Set input and close inspector
    setDesignModeInput(`Ändra ${description}: `);
    onElementSelect(description, codeContextStr);
    toggleDesignMode(false);
  }, [
    selected,
    files,
    setDesignModeCodeContext,
    setDesignModeInput,
    onElementSelect,
    toggleDesignMode,
  ]);

  if (!isActive) return null;

  return (
    <div
      className={`absolute inset-0 z-40 flex flex-col bg-zinc-950 ${
        isFullscreen ? "fixed" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 border border-purple-500/40 rounded-lg">
            <Crosshair className="h-4 w-4 text-purple-400 animate-pulse" />
            <span className="text-sm font-medium text-purple-200">
              Avancerad Inspect
            </span>
          </div>
          <span className="text-xs text-zinc-500">
            {ready ? "Klicka på element för att välja" : "Laddar..."}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReload}
            disabled={loading}
            className="h-8 px-3 text-zinc-400 hover:text-white"
            title="Ladda om"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-8 px-3 text-zinc-400 hover:text-white"
            title={isFullscreen ? "Minimera" : "Fullskärm"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Iframe area */}
        <div className="flex-1 relative bg-white">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500 mx-auto" />
                <p className="text-zinc-400 text-sm">Laddar preview...</p>
                <p className="text-zinc-600 text-xs">Detta kan ta några sekunder</p>
              </div>
            </div>
          )}
          
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              <div className="text-center space-y-3 max-w-md px-4">
                <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
                <p className="text-zinc-300 text-sm font-medium">
                  Kunde inte ladda preview
                </p>
                <p className="text-zinc-500 text-xs">{error}</p>
                <Button
                  onClick={handleReload}
                  size="sm"
                  className="mt-2 bg-purple-600 hover:bg-purple-500"
                >
                  Försök igen
                </Button>
              </div>
            </div>
          ) : proxyUrl ? (
            <iframe
              ref={iframeRef}
              key={proxyUrl}
              src={proxyUrl}
              className="w-full h-full border-0"
              title="Advanced Inspector Preview"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              <p className="text-zinc-500 text-sm">
                Ingen preview tillgänglig
              </p>
            </div>
          )}
        </div>

        {/* Right panel - Element info */}
        <div className="w-80 border-l border-zinc-700 bg-zinc-900 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-zinc-700">
            <h3 className="text-sm font-medium text-zinc-200 mb-1">
              Element Info
            </h3>
            <p className="text-xs text-zinc-500">
              {freeze
                ? "Element valt - klicka på knappen nedan"
                : "Hovra för att se info, klicka för att välja"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Hovered element */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                <span className="text-xs font-medium text-zinc-400">
                  Hovrar över
                </span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                {hovered ? (
                  <div className="space-y-1.5">
                    <p className="text-sm text-zinc-200 font-medium">
                      {getElementDescription(hovered)}
                    </p>
                    <p className="text-xs text-zinc-500 font-mono break-all">
                      {hovered.selector.slice(0, 80)}
                      {hovered.selector.length > 80 ? "..." : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">
                    Hovra över ett element...
                  </p>
                )}
              </div>
            </div>

            {/* Selected element */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-xs font-medium text-zinc-400">
                  Valt
                </span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                {selected ? (
                  <div className="space-y-2">
                    <p className="text-sm text-zinc-200 font-medium">
                      {getElementDescription(selected)}
                    </p>
                    <div className="text-xs space-y-1">
                      <p className="text-zinc-500">
                        <span className="text-zinc-400">Tag:</span>{" "}
                        {selected.tag}
                      </p>
                      {selected.id && (
                        <p className="text-zinc-500">
                          <span className="text-zinc-400">ID:</span> #
                          {selected.id}
                        </p>
                      )}
                      {selected.className && (
                        <p className="text-zinc-500 break-all">
                          <span className="text-zinc-400">Klass:</span> .
                          {selected.className
                            .split(" ")
                            .slice(0, 3)
                            .join(" .")}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 font-mono break-all border-t border-zinc-700 pt-2 mt-2">
                      {selected.selector}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">
                    Klicka på ett element för att välja det...
                  </p>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <p className="text-xs text-zinc-500">
                <span className="text-zinc-400 font-medium">Tips:</span> Välj
                det element du vill ändra. AI:n hittar automatiskt rätt kod
                baserat på elementets struktur och klasser.
              </p>
            </div>
          </div>

          {/* Action button */}
          <div className="p-4 border-t border-zinc-700">
            <Button
              onClick={handleUseElement}
              disabled={!selected}
              className="w-full bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
            >
              {selected
                ? `Redigera ${getElementDescription(selected).slice(0, 25)}...`
                : "Välj ett element först"}
            </Button>
            <button
              onClick={() => {
                setSelected(null);
                setFreeze(false);
              }}
              className="w-full mt-2 text-xs text-zinc-500 hover:text-zinc-300 py-1"
            >
              Rensa val
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
