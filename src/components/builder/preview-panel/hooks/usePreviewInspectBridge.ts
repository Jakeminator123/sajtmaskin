"use client";

import { INSPECT_BRIDGE_MESSAGE } from "@/lib/builder/inspect-bridge-feature";
import { dispatchInspectCaptureEvent } from "@/lib/builder/inspect-events";
import {
  matchCapturedElement,
  type JsxElementRegistryItem,
  type RegistryMatch,
} from "@/lib/builder/jsx-element-registry";
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";

type BridgeRect = { x: number; y: number; width: number; height: number };

/** Untrusted payload som det injicerade scriptet postar upp. */
type BridgeElement = {
  tag?: string;
  id?: string | null;
  className?: string | null;
  text?: string | null;
  ariaLabel?: string | null;
  role?: string | null;
  href?: string | null;
  selector?: string | null;
  nearestHeading?: string | null;
  rect?: BridgeRect;
  viewport?: { w: number; h: number };
};

function originForUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : undefined;
    return new URL(url, base).origin;
  } catch {
    return null;
  }
}

/**
 * Bridge-engine: pratar med det injicerade scriptet i preview-iframen via
 * `postMessage`. Ersätter Playwright-vägen (map/capture) för egna/tier-2-previews
 * — koordinat→DOM sker i previewn själv (same-origin mot sig själv).
 *
 * Inert om `enabled`/`active` är false (map/ai-vägarna orörda). Se
 * `docs/plans/active/2026-06-19-inspector-rendering-arkitektur.md`.
 */
export function usePreviewInspectBridge(options: {
  /** bridge-flaggan på + inspector aktiverad */
  enabled: boolean;
  /** inspectEngine === "bridge" */
  active: boolean;
  inspectMode: boolean;
  previewUrl: string | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  elementRegistryRef: MutableRefObject<JsxElementRegistryItem[]>;
  fetchFilesForRegistry: () => void | Promise<void>;
  setInspectStatus: Dispatch<SetStateAction<string | null>>;
  setLastCodeMatch: Dispatch<SetStateAction<RegistryMatch | null>>;
  /** Tie-in: anropas med kod-träffen (om någon) när ett element valts. */
  onPick?: (match: RegistryMatch | null) => void;
}) {
  const {
    enabled,
    active,
    inspectMode,
    previewUrl,
    iframeRef,
    elementRegistryRef,
    fetchFilesForRegistry,
    setInspectStatus,
    setLastCodeMatch,
    onPick,
  } = options;

  const childReadyRef = useRef(false);
  const liveRef = useRef(false);
  useEffect(() => {
    liveRef.current = enabled && active && inspectMode;
  }, [enabled, active, inspectMode]);

  const targetOrigin = originForUrl(previewUrl) || "*";

  const postMode = useCallback(
    (on: boolean) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      try {
        win.postMessage({ type: INSPECT_BRIDGE_MESSAGE.setMode, enabled: on }, targetOrigin);
      } catch {
        /* cross-origin race during reload; ignore */
      }
    },
    [iframeRef, targetOrigin],
  );

  // Ny preview-laddning → scriptet måste re-announcera 'ready'.
  useEffect(() => {
    childReadyRef.current = false;
  }, [previewUrl]);

  // Pusha läget till barnet när toggeln ändras (om redan ready).
  useEffect(() => {
    if (!enabled || !active) return;
    if (!childReadyRef.current) return;
    postMode(inspectMode);
  }, [enabled, active, inspectMode, postMode]);

  // Förladda filer så pick → registry-match funkar.
  useEffect(() => {
    if (enabled && active && inspectMode) void fetchFilesForRegistry();
  }, [enabled, active, inspectMode, fetchFilesForRegistry]);

  useEffect(() => {
    if (!enabled || !active) return;
    const allowed = originForUrl(previewUrl);

    const handler = (event: MessageEvent) => {
      const win = iframeRef.current?.contentWindow;
      if (win && event.source !== win) return; // bara vår preview-iframe
      if (allowed && event.origin !== allowed && event.origin !== "null") return;

      const data = event.data as { type?: string; payload?: BridgeElement } | null;
      if (!data || typeof data.type !== "string") return;

      if (data.type === INSPECT_BRIDGE_MESSAGE.ready) {
        childReadyRef.current = true;
        postMode(liveRef.current);
        return;
      }

      if (data.type === INSPECT_BRIDGE_MESSAGE.hover) {
        const el = data.payload;
        if (el?.tag) {
          setInspectStatus(`<${el.tag}>${el.text ? ` "${el.text.slice(0, 50)}"` : ""}`);
        }
        return;
      }

      if (data.type === INSPECT_BRIDGE_MESSAGE.pick) {
        const el = data.payload;
        if (!el?.tag) return;

        const match = matchCapturedElement(elementRegistryRef.current, {
          tag: el.tag,
          id: el.id,
          className: el.className,
          text: el.text,
          selector: el.selector,
        });
        setLastCodeMatch(match);

        const rect = el.rect;
        const vw = el.viewport?.w || rect?.width || 1;
        const vh = el.viewport?.h || rect?.height || 1;
        const cx = rect ? rect.x + rect.width / 2 : 0;
        const cy = rect ? rect.y + rect.height / 2 : 0;
        const xPercent = Number(((cx / vw) * 100).toFixed(2));
        const yPercent = Number(((cy / vh) * 100).toFixed(2));
        const matchHint = match ? ` → ${match.item.filePath}:${match.item.lineNumber}` : "";

        setInspectStatus(
          `<${el.tag}>${el.text ? ` "${el.text.slice(0, 50)}"` : ""}${matchHint}`,
        );

        dispatchInspectCaptureEvent({
          id: `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          demoUrl: previewUrl || "",
          xPercent,
          yPercent,
          viewportWidth: Math.round(vw),
          viewportHeight: Math.round(vh),
          pointSummary: `Bridge: <${el.tag}> vid ${xPercent}%/${yPercent}%${el.text ? ` "${el.text.slice(0, 60)}"` : ""}${matchHint}`,
          element: {
            tag: el.tag,
            id: el.id ?? null,
            className: el.className ?? null,
            text: el.text ?? null,
            ariaLabel: el.ariaLabel ?? null,
            role: el.role ?? null,
            href: el.href ?? null,
            selector: el.selector ?? null,
            nearestHeading: el.nearestHeading ?? null,
          },
          source: "local",
        });

        toast.success(
          `Punkt tillagd i chatten: <${el.tag}>${match ? ` i ${match.item.filePath}:${match.item.lineNumber}` : ""}`,
        );
        onPick?.(match);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [
    enabled,
    active,
    previewUrl,
    iframeRef,
    elementRegistryRef,
    fetchFilesForRegistry,
    setInspectStatus,
    setLastCodeMatch,
    postMode,
    onPick,
  ]);
}
