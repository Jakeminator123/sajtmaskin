"use client";

import { INSPECT_BRIDGE_MESSAGE } from "@/lib/builder/inspect-bridge-feature";
import { dispatchInspectCaptureEvent } from "@/lib/builder/inspect-events";
import type { BridgeSectionCandidate } from "@/lib/builder/section-analyzer";
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

export type BridgeRect = { x: number; y: number; width: number; height: number };

/** Untrusted payload som det injicerade scriptet postar upp. */
export type BridgeElement = {
  tag?: string;
  id?: string | null;
  className?: string | null;
  text?: string | null;
  /** Elementets egna textnoder (inte barnens) — grunden för klassificeringen. */
  ownText?: string | null;
  childElementCount?: number;
  src?: string | null;
  alt?: string | null;
  ariaLabel?: string | null;
  role?: string | null;
  href?: string | null;
  selector?: string | null;
  nearestHeading?: string | null;
  /** From `data-sajtmaskin-source` when the preview annotates DOM nodes. */
  sourcePath?: string | null;
  rect?: BridgeRect;
  viewport?: { w: number; h: number };
  /** Faktisk klickpunkt i viewport-koordinater (B-fix #164/#197). */
  click?: { x?: number; y?: number };
};

/** Ett valt element med sin kodträff — allt menyn behöver för att öppna. */
export type BridgePick = {
  element: BridgeElement & { tag: string };
  match: RegistryMatch | null;
  rect: BridgeRect | null;
  click: { x: number; y: number };
  viewport: { w: number; h: number };
};

/** Elementen som en uppdragen rektangel täcker. */
export type BridgeRegion = {
  rect: BridgeRect;
  viewport: { w: number; h: number };
  /**
   * Previewens scroll-läge när rektangeln drogs.
   *
   * `rect` är viewport-relativ. En konsument som återskapar sidan någon
   * annanstans (bildfångsten laddar den på nytt, alltid vid scroll 0) måste
   * rulla hit först, annars pekar rektangeln på fel del av dokumentet.
   */
  scroll: { x: number; y: number };
  elements: Array<{ element: BridgeElement & { tag: string }; match: RegistryMatch | null }>;
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

function matchForElement(
  registry: JsxElementRegistryItem[],
  element: BridgeElement,
): RegistryMatch | null {
  return matchCapturedElement(registry, {
    tag: element.tag,
    id: element.id,
    className: element.className,
    text: element.text,
    selector: element.selector,
  });
}

/**
 * Lägger en punkt i chatten för ett valt element — samma nyttolast som
 * inspektorn alltid har skickat. Ligger utanför hooken eftersom det numera är
 * ETT av menyvalen och inte längre det enda som händer vid ett klick.
 */
export function dispatchBridgeInspectPoint(pick: BridgePick, previewUrl: string | null): void {
  const { element, match, rect, click, viewport } = pick;
  const vw = viewport.w || rect?.width || 1;
  const vh = viewport.h || rect?.height || 1;
  const xPercent = Number(((click.x / vw) * 100).toFixed(2));
  const yPercent = Number(((click.y / vh) * 100).toFixed(2));
  const sourcePath = match?.item.filePath || element.sourcePath || null;
  const sourceLine = match?.item.lineNumber ?? null;
  const matchHint = sourcePath
    ? ` → ${sourcePath}${sourceLine != null ? `:${sourceLine}` : ""}`
    : "";

  dispatchInspectCaptureEvent({
    id: `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    demoUrl: previewUrl || "",
    xPercent,
    yPercent,
    viewportWidth: Math.round(vw),
    viewportHeight: Math.round(vh),
    pointSummary: `Bridge: <${element.tag}> vid ${xPercent}%/${yPercent}%${element.text ? ` "${element.text.slice(0, 60)}"` : ""}${matchHint}`,
    element: {
      tag: element.tag,
      id: element.id ?? null,
      className: element.className ?? null,
      text: element.text ?? null,
      ariaLabel: element.ariaLabel ?? null,
      role: element.role ?? null,
      href: element.href ?? null,
      selector: element.selector ?? null,
      nearestHeading: element.nearestHeading ?? null,
      sourcePath,
      sourceLine,
    },
    source: "local",
  });
}

/**
 * Bridge-engine: pratar med det injicerade scriptet i preview-iframen via
 * `postMessage`. Ersätter Playwright-vägen (map/capture) för egna/tier-2-previews
 * — koordinat→DOM sker i previewn själv (same-origin mot sig själv).
 *
 * Hooken tolkar och verifierar meddelandena men BESLUTAR inget: ett valt
 * element går vidare till `onPick`, som öppnar elementmenyn. Menyn äger sedan
 * vad som faktiskt händer (ändra text, byt bild, ta bort, skicka punkt).
 *
 * Inert om `enabled`/`active` är false (map/ai-vägarna orörda). Se
 * `docs/plans/avklarat/2026-06-19-inspector-rendering-arkitektur.md`.
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
  /** Tie-in: anropas med elementet och kod-träffen när något valts. */
  onPick?: (pick: BridgePick) => void;
  /**
   * Ny rect för det senast valda elementet (previewen scrollades/ändrade
   * storlek). Menyn och redigeringsrutan följer med i stället för att ligga
   * kvar på klickpunkten.
   */
  onRect?: (rect: BridgeRect) => void;
  /** Elementen som en uppdragen rektangel täcker. */
  onRegion?: (region: BridgeRegion) => void;
  /**
   * A-fix (#164/#197): anropas när bridge-scriptet inte annonserat `ready`
   * inom timeouten efter att inspektionsläget slagits på — previewn saknar
   * injektionen (gammal session, icke-injicerbar HTML, blockerat script).
   * Callern förväntas falla tillbaka till map/ai-motorn i stället för att
   * lämna inspektorn inert.
   */
  onBridgeUnavailable?: () => void;
  /**
   * Motsatsen till `onBridgeUnavailable`: bron annonserade `ready`. Lyssnaren
   * lever så länge `enabled` är sant — även när callern fallit ner till map —
   * så att en preview som blir injektionsbar först efter VM-booten kan tas i
   * bruk utan full sidladdning.
   */
  onBridgeReady?: () => void;
  /**
   * När true: be child om sektionsrektanglar (placement/composer). Kräver inte
   * att inspect-läget är på — placering stänger inspect men behöver zoner.
   */
  requestSections?: boolean;
  /** Sektionskandidater från bron → matas in i extractSectionZones-vägen. */
  onSections?: (candidates: BridgeSectionCandidate[]) => void;
  /**
   * Browser-runtime-fel från preview-iframen (hydration/uncaught/…).
   * Accepteras även när inspectMode är av — felen uppstår utan inspektion.
   */
  onClientError?: (payload: unknown) => void;
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
    onRect,
    onRegion,
    onBridgeUnavailable,
    onBridgeReady,
    requestSections = false,
    onSections,
    onClientError,
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

  const postRequestSections = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !targetOrigin) return;
    try {
      win.postMessage({ type: INSPECT_BRIDGE_MESSAGE.requestSections }, targetOrigin);
    } catch {
      /* cross-origin race during reload; ignore */
    }
  }, [iframeRef, targetOrigin]);

  const requestSectionsRef = useRef(requestSections);
  useEffect(() => {
    requestSectionsRef.current = requestSections;
  }, [requestSections]);

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

  // Placement/composer: hämta sektionszoner via bron (inte Playwright).
  useEffect(() => {
    if (!enabled || !active || !requestSections) return;
    if (!childReadyRef.current) return;
    postRequestSections();
  }, [enabled, active, requestSections, previewUrl, postRequestSections]);

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
  const onBridgeReadyRef = useRef(onBridgeReady);
  useEffect(() => {
    onBridgeReadyRef.current = onBridgeReady;
  }, [onBridgeReady]);
  const onClientErrorRef = useRef(onClientError);
  useEffect(() => {
    onClientErrorRef.current = onClientError;
  }, [onClientError]);
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
    if (!enabled) return;
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
        | {
            type?: string;
            source?: string;
            payload?: BridgeElement & {
              elements?: Array<BridgeElement | BridgeSectionCandidate>;
              scroll?: { x?: number; y?: number };
            };
          }
        | null;
      if (!data || typeof data.type !== "string") return;
      // Only accept messages stamped by our injected bridge script — a generated
      // preview page shares the iframe's window/origin and could otherwise post a
      // forged inspect message.
      if (data.source !== "sajtmaskin-inspect") return;

      if (data.type === INSPECT_BRIDGE_MESSAGE.ready) {
        childReadyRef.current = true;
        onBridgeReadyRef.current?.();
        postMode(liveRef.current);
        // Placement kan redan vara aktiv när bron blir ready.
        if (requestSectionsRef.current) postRequestSections();
        return;
      }

      // Browser-fel: före active/liveRef — fångas utan inspect-läge (scriptet
      // finns bara i builder-previews). Parent POST:ar vidare till error-log.
      if (data.type === INSPECT_BRIDGE_MESSAGE.clientError) {
        onClientErrorRef.current?.(data.payload);
        return;
      }

      if (!active) return;

      // Sektionszoner för placement — tillåtna även när inspectMode är av
      // (placering stänger inspect men behöver fortfarande ankare).
      if (data.type === INSPECT_BRIDGE_MESSAGE.sections) {
        if (!requestSectionsRef.current) return;
        const raw = Array.isArray(data.payload?.elements) ? data.payload.elements : [];
        onSections?.(raw as BridgeSectionCandidate[]);
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

      if (data.type === INSPECT_BRIDGE_MESSAGE.rect) {
        const rect = data.payload?.rect;
        if (rect) onRect?.(rect);
        return;
      }

      if (data.type === INSPECT_BRIDGE_MESSAGE.region) {
        const payload = data.payload;
        const rect = payload?.rect;
        const raw = Array.isArray(payload?.elements) ? payload.elements : [];
        if (!rect) return;
        const elements = raw
          .filter((item): item is BridgeElement & { tag: string } => Boolean(item?.tag))
          .map((item) => ({
            element: item,
            match: matchForElement(elementRegistryRef.current, item),
          }));
        setInspectStatus(`${elements.length} element markerade i ytan.`);
        onRegion?.({
          rect,
          viewport: payload?.viewport ?? { w: rect.width, h: rect.height },
          scroll: {
            x: Math.max(0, Math.round(Number(payload?.scroll?.x) || 0)),
            y: Math.max(0, Math.round(Number(payload?.scroll?.y) || 0)),
          },
          elements,
        });
        return;
      }

      if (data.type === INSPECT_BRIDGE_MESSAGE.pick) {
        const el = data.payload;
        if (!el?.tag) return;

        const match = matchForElement(elementRegistryRef.current, el);
        setLastCodeMatch(match);

        const rect = el.rect ?? null;
        const vw = el.viewport?.w || rect?.width || 1;
        const vh = el.viewport?.h || rect?.height || 1;
        // B-fix (#164/#197): föredra den faktiska klickpunkten från bridge-
        // scriptet; elementets mittpunkt är bara fallback (äldre script utan
        // click-fält). Mittpunkten pekar fel för stora element (hero/sektion).
        const cx =
          typeof el.click?.x === "number" ? el.click.x : rect ? rect.x + rect.width / 2 : 0;
        const cy =
          typeof el.click?.y === "number" ? el.click.y : rect ? rect.y + rect.height / 2 : 0;
        const matchHint = match ? ` → ${match.item.filePath}:${match.item.lineNumber}` : "";

        setInspectStatus(
          `<${el.tag}>${el.text ? ` "${el.text.slice(0, 50)}"` : ""}${matchHint}`,
        );

        onPick?.({
          element: el as BridgeElement & { tag: string },
          match,
          rect,
          click: { x: cx, y: cy },
          viewport: { w: vw, h: vh },
        });
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
    postRequestSections,
    onPick,
    onRect,
    onRegion,
    onSections,
  ]);
}
