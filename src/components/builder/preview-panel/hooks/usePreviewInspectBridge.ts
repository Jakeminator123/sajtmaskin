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
  /** Faktisk klickpunkt i viewport-koordinater (B-fix #164/#197). */
  click?: { x?: number; y?: number };
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
  /**
   * A-fix (#164/#197): anropas när bridge-scriptet inte annonserat `ready`
   * inom timeouten efter att inspektionsläget slagits på — previewn saknar
   * injektionen (gammal session, icke-injicerbar HTML, blockerat script).
   * Callern förväntas falla tillbaka till map/ai-motorn i stället för att
   * lämna inspektorn inert.
   */
  onBridgeUnavailable?: () => void;
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
    onBridgeUnavailable,
  } = options;

  const childReadyRef = useRef(false);
  const liveRef = useRef(false);
  useEffect(() => {
    liveRef.current = enabled && active && inspectMode;
  }, [enabled, active, inspectMode]);

  const targetOrigin = originForUrl(previewUrl);

  const postMode = useCallback(
    (on: boolean) => {
      const win = iframeRef.current?.contentWindow;
      // Never broadcast set-mode to "*": if we can't resolve the preview origin
      // (absent/malformed previewUrl) we don't post at all rather than to any origin.
      if (!win || !targetOrigin) return;
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

  // A-fix (#164/#197): ready-timeout. Utan denna blev inspektorn tyst inert
  // när `ready` aldrig kom (preview utan injektion). Efter timeouten meddelas
  // callern som kan växla till map/ai-motorn.
  const onBridgeUnavailableRef = useRef(onBridgeUnavailable);
  useEffect(() => {
    onBridgeUnavailableRef.current = onBridgeUnavailable;
  }, [onBridgeUnavailable]);
  useEffect(() => {
    if (!enabled || !active || !inspectMode) return;
    if (childReadyRef.current) return;
    const READY_TIMEOUT_MS = 5000;
    const timer = setTimeout(() => {
      if (childReadyRef.current) return;
      setInspectStatus("Inspector-bron svarade inte — växlar till kartläge.");
      onBridgeUnavailableRef.current?.();
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [enabled, active, inspectMode, previewUrl, setInspectStatus]);

  useEffect(() => {
    if (!enabled || !active) return;
    const allowed = originForUrl(previewUrl);

    const handler = (event: MessageEvent) => {
      const win = iframeRef.current?.contentWindow;
      // Primär gräns: window-identitet — bara vår preview-iframes window. Saknas
      // window (ej monterad) kan vi inte verifiera → avvisa (aldrig "skippa kollen").
      if (!win || event.source !== win) return;
      // Origin måste matcha previewens origin. `"null"` = sandboxad/opaque dokument
      // (väntat för vissa previews) och tillåts. För alla andra origins: om vi inte
      // kunde härleda förväntad origin (malformed/avsaknad previewUrl) avvisar vi
      // hellre än att tyst acceptera vilken origin som helst.
      if (event.origin !== "null" && (!allowed || event.origin !== allowed)) return;

      const data = event.data as
        | { type?: string; source?: string; payload?: BridgeElement }
        | null;
      if (!data || typeof data.type !== "string") return;
      // Only accept messages stamped by our injected bridge script — a generated
      // preview page shares the iframe's window/origin and could otherwise post a
      // forged inspect message.
      if (data.source !== "sajtmaskin-inspect") return;

      if (data.type === INSPECT_BRIDGE_MESSAGE.ready) {
        childReadyRef.current = true;
        postMode(liveRef.current);
        return;
      }

      // Hover/pick are only honored while inspection is actively live; otherwise a
      // page could inject fake inspector points/toasts merely because bridge mode
      // is selected.
      if (!liveRef.current) return;

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
        // B-fix (#164/#197): föredra den faktiska klickpunkten från bridge-
        // scriptet; elementets mittpunkt är bara fallback (äldre script utan
        // click-fält). Mittpunkten pekar fel för stora element (hero/sektion).
        const cx =
          typeof el.click?.x === "number" ? el.click.x : rect ? rect.x + rect.width / 2 : 0;
        const cy =
          typeof el.click?.y === "number" ? el.click.y : rect ? rect.y + rect.height / 2 : 0;
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
