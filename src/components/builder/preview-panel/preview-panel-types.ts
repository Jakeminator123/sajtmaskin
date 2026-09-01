import type { PlacementSelectEventDetail } from "@/lib/builder/inspect-events";
import type { ShadcnInsertHandler } from "@/lib/builder/shadcn-insert";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";
import type { DesignTheme } from "@/lib/builder/theme-presets";
import type { EngineVersionLifecycleStage } from "@/lib/db/engine-version-lifecycle";
import type { VersionDisplayStatus } from "@/lib/builder/version-status-display";
import type { VersionMismatchOverlayPayload } from "@/lib/gen/preview/preview-host-client";
import type { PreviewSurfaceState } from "./usePreviewSurfaceMode";

export type CaptureResponse = {
  success?: boolean;
  staleIdentity?: boolean;
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

export type InspectPulseMarker = {
  x: number;
  y: number;
  key: number;
};

export interface PreviewPanelProps {
  chatId: string | null;
  versionId: string | null;
  /**
   * Färgtema-preset till Byggval-reglagen i välkomstläget (flyttad från
   * Avancerat 2026-07-31). Delar shell-state med genereringen (`designTheme`
   * → `themeColors`). Endast använd av empty-state-ytan.
   */
  designTheme?: DesignTheme;
  onDesignThemeChange?: (theme: DesignTheme) => void;
  /** Låser temavalet under streaming (motsvarar gamla `isConfigLocked`). */
  themeLocked?: boolean;
  /** Active preview URL (iframe target); not the API JSON field name. */
  previewUrl: string | null;
  onNavigatePreviewUrl?: (url: string) => void;
  isLoading?: boolean;
  /**
   * Sant när appen arbetar med en generering (skapar chat, streamar, laddar
   * mall, förbereder prompt). Skilt från `isLoading`, som bara säger om den
   * blockerande overlayen får täcka previewn — den slutar medvetet blocka så
   * fort en live tier-2-preview finns, även mitt i en stream. Ytor som kan
   * starta en NY generering måste läsa den här, inte `isLoading`.
   */
  isGenerating?: boolean;
  onFixPreview?: () => void;
  /**
   * P0 stream-abort recovery (2026-04-26). When true, the most recent
   * generation/repair stream for this chat died before any version was
   * created (provider abort, transport reset, server-restart, staleness).
   * The empty-state surface uses this to suppress the "Försök reparera
   * preview" button (which would route into followup_general against a
   * non-existent version and trigger variant_lock_fallback) and offer
   * "Starta om generation" instead.
   */
  versionlessAborted?: boolean;
  /**
   * P0 stream-abort recovery (2026-04-26). Click handler bound to the
   * "Starta om generation" button shown when `versionlessAborted` is
   * true. Implementations are expected to spawn a *new* chat — never
   * reuse the dead chatId for a follow-up post.
   */
  onRestartGeneration?: () => void;
  refreshToken?: number;
  /**
   * Called after a manual file save. When the Fast Edit Lane created a new minor
   * version, `info` carries the new `versionId` plus the live preview metadata
   * (`previewUrl`/`previewSessionId`) so the builder can select the new version
   * AND keep the existing preview session (no re-bootstrap / no VM restart).
   * For in-place saves the fields are absent and the current version is kept.
   */
  onFilesSaved?: (info?: {
    versionId?: string;
    previewUrl?: string | null;
    previewSessionId?: string | null;
    lifecycleToken?: string | null;
    previewMode?: string | null;
  }) => void;
  imageGenerationsEnabled?: boolean;
  imageGenerationsSupported?: boolean;
  isBlobConfigured?: boolean;
  awaitingInput?: boolean;
  awaitingInputQuestion?: string | null;
  awaitingInputOptions?: string[];
  /** Last SSE preview/build failure for this session (cleared on `preview-ready` or version change). */
  previewBuildError?: { stage: string; message: string } | null;
  /** `npm run build` result in the tier-2 preview runtime after dev; separate from dev-preview. */
  previewProdBuild?: { verified: boolean; logSnippet?: string } | null;
  previewPending?: boolean;
  /** Server-known preview session id for heartbeat / status (own-engine). */
  activePreviewSessionId?: string | null;
  /** Host lifecycle fence for pagehide/hibernate; null only for a legacy lifecycle. */
  activePreviewLifecycleToken?: string | null;
  previewLifecycle?: PreviewLifecycleState;
  activeVersionStatus?: VersionDisplayStatus | null;
  activeVersionSummary?: string | null;
  /** Server-written promotion boundary used to scope preview client-error dedupe. */
  activeVersionPromotedAt?: string | Date | null;
  activeVersionIsLatest?: boolean;
  /** Latest repair pass index (0 when none), for bounded "Reparerar (X/2)" copy. */
  activeVersionRepairPassIndex?: number;
  /** Non-blocking overlay payload when the selected version and preview-VM diverge. */
  versionMismatchPayload?: VersionMismatchOverlayPayload | null;
  /** Ask controller to verify server session and recover preview if needed. */
  onPreviewSessionSuspect?: () => void;
  /**
   * Adopt a rotated tier-2 session identity: the host reports `running` for
   * the SAME version and canonical session URL but under a NEW
   * previewSessionId/lifecycleToken (VM re-keyed on boot after hibernate).
   * The controller updates activePreviewSessionMeta so the receipt chain can
   * restart with the live identity instead of failing closed forever (SM-074).
   */
  onPreviewSessionRotated?: (meta: {
    previewSessionId: string;
    versionId: string;
    lifecycleToken: string | null;
  }) => void;
  /**
   * Explicit/manual forced preview resync (overlay "Försök igen"-knappen).
   * Skiljer sig från `onPreviewSessionSuspect`: den senare är den automatiska
   * heartbeat/iframe-vägen (respekterar auto-resync-loopskyddet), medan denna
   * alltid tvingar en omstart oavsett loopskyddet.
   */
  onForcePreviewResync?: () => void;
  placementMode?: boolean;
  pendingPlacementItem?: {
    title: string;
    description?: string | null;
  } | null;
  onPlacementComplete?: (detail: PlacementSelectEventDetail) => void;
  /** Own-engine / chat: skicka AI‑fallback när deterministisk patch inte är möjlig. */
  onComposerAiFallback?: (payload: ComposerAiFallbackPayload) => void | Promise<void>;
  /**
   * Insättnings-lane v1 ("Lägg till"-ytan): valt registry-kort (Bläddra eller
   * Beskriv) → välformat prompt via `shadcn-insert.ts` → BEFINTLIGA
   * sendMessage/own-engine-vägen → generering + verify → ny version. Aldrig
   * rå filpatch. Saknas → insättningsknapparna i panelen är disabled.
   */
  onShadcnItemInsert?: ShadcnInsertHandler;
  /**
   * F2 vs F3 stage of the active version. Styr `+/- Sida`-kontrollerna
   * (F3 tar inte quick-edit). "Bygg integrationer" och Byggblock-popovern
   * bor numera i headerns verktygskluster (`BuilderPreviewTools`).
   * See `.cursor/rules/env-flow-f2-mute.mdc`.
   */
  lifecycleStage?: EngineVersionLifecycleStage | null;
  /**
   * Previewens lägen (composer/inspect/vy) ägs av builderskalet eftersom
   * kontrollerna sitter i chatpanelen och headern. Utelämnas den skapar
   * panelen en egen lokal ägare — bara för isolerad rendering (tester).
   */
  surface?: PreviewSurfaceState;
}

/** Payload när Visual Composer inte kan patcha `app/page.tsx` säkert (t.ex. `after-hero`). */
export type ComposerAiFallbackPayload = {
  blockId: string;
  placement: string;
  placementLabel: string;
  anchorSection?: PlacementSelectEventDetail["anchorSection"];
  /** Innehåll i startsidans fil (för `analyzeSections` i prompten), om det fanns i versionen. */
  homePageContent: string | null;
};

export type PreviewViewMode = "preview" | "code" | "registry";
export type InspectEngine = "playwright" | "ai" | "map" | "bridge";

export type AiMatchResult = {
  tag: string;
  text: string | null;
  className: string | null;
  filePath: string | null;
  lineNumber: number | null;
  confidence: string;
  reasoning: string | null;
};

export type AiMatchResponse = {
  success: boolean;
  model?: string;
  element?: AiMatchResult | null;
  tokens?: { input: number; output: number; total: number };
  cost?: { usd: number; display: string };
  error?: string;
};
