import type { PlacementSelectEventDetail } from "@/lib/builder/inspect-events";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";
import type {
  EngineVersionDisplayStatus,
  EngineVersionLifecycleStage,
} from "@/lib/db/engine-version-lifecycle";
import type { AlternatePreviewUrls } from "@/lib/gen/preview/preview-url-classifier";
import type { VersionMismatchOverlayPayload } from "@/lib/gen/preview/preview-host-client";
import type { PreviewIssuePayload } from "./iframe-diagnostics";

export type CaptureResponse = {
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

export type InspectPulseMarker = {
  x: number;
  y: number;
  key: number;
};

export type PreviewIframeMessage = {
  source?: string;
  type?:
    | "preview-error"
    | "preview-ready"
    | "navigation-attempt"
    | "preview-starting"
    | "build-out-request";
  payload?: PreviewIssuePayload & {
    href?: string | null;
    path?: string;
    intent?: string | null;
    name?: string | null;
  };
};

/**
 * Kontext för en build-out-förfrågan. Shell-sidorna bakar in `intent` + `name`
 * från `PlannedRoute` så builder-shellen kan formulera en prompt som matchar
 * det som redan förberetts i backend i stället för en generisk text.
 */
export interface BuildOutRouteRequestContext {
  path: string;
  intent?: string | null;
  name?: string | null;
}

export interface PreviewPanelProps {
  chatId: string | null;
  versionId: string | null;
  /** Active preview URL (iframe target); not the API JSON field name. */
  previewUrl: string | null;
  /** Tier 1 + tier 2 URLs stored on the active version — se `docs/architecture/fas3-preview-and-deploy.md`. */
  alternatePreviewUrls?: AlternatePreviewUrls;
  onNavigatePreviewUrl?: (url: string) => void;
  isLoading?: boolean;
  onClear?: () => void;
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
  onFilesSaved?: () => void;
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
  previewLifecycle?: PreviewLifecycleState;
  activeVersionStatus?: EngineVersionDisplayStatus | null;
  activeVersionSummary?: string | null;
  activeVersionIsLatest?: boolean;
  /** Non-blocking overlay payload when the selected version and preview-VM diverge. */
  versionMismatchPayload?: VersionMismatchOverlayPayload | null;
  /** Ask controller to verify server session and recover preview if needed. */
  onPreviewSessionSuspect?: () => void;
  placementMode?: boolean;
  pendingPlacementItem?: {
    title: string;
    description?: string | null;
  } | null;
  onPlacementComplete?: (detail: PlacementSelectEventDetail) => void;
  simplified?: boolean;
  /** Own-engine / chat: skicka AI‑fallback när deterministisk patch inte är möjlig. */
  onComposerAiFallback?: (payload: ComposerAiFallbackPayload) => void | Promise<void>;
  generationPhase?: import("./GenerationProgress").GenerationPhase;
  onInlineEditPrompt?: (prompt: string, file?: File) => void;
  onSuggestionClick?: (prompt: string) => void;
  /**
   * Build-out-request från shell-sidors "Skapa sida"-knapp eller från
   * preview-chrome:s "Bygg ut"-pil. Om ej angett faller vi tillbaka till
   * `onSuggestionClick` med en generisk prompt. Builder-shellen bör koppla
   * detta till `smartSendMessage` så gäst-gating och toast fungerar.
   */
  onBuildOutRouteRequest?: (context: BuildOutRouteRequestContext) => void;
  /**
   * F2 vs F3 stage of the active version. Controls visibility of the
   * "Bygg integrationer" (F3 trigger) button in the preview chrome. F2 (`design`)
   * shows the button; F3 (`integrations`) hides it (already in F3).
   * See `.cursor/rules/env-flow-f2-mute.mdc`.
   */
  lifecycleStage?: EngineVersionLifecycleStage | null;
  /**
   * Whether the builder shell is busy (creating chat, streaming a previous
   * generation, loading a template, preparing a prompt). Forwarded down to
   * `PreviewPanelF3Trigger` so a second "Bygg integrationer" click cannot race the
   * F3 stream that the previous click is currently running.
   */
  isBusy?: boolean;
  /** Called when F3 trigger reports missing tier-3 env keys. */
  onF3MissingEnv?: (payload: {
    parentVersionId: string;
    missingByIntegration: Array<{ key: string; name: string; missing: string[] }>;
  }) => void;
  /** Called when F3 readiness check passes. */
  onF3Ready?: (payload: {
    parentVersionId: string;
    requirements: Array<{
      key: string;
      name: string;
      requiredRealEnvKeys: string[];
    }>;
  }) => void;
  /**
   * Count of files whose merge was rejected by the shrink-guard during
   * finalize for the active version. Surfaced as a compact warning chip
   * in the preview chrome so the user understands why the preview may
   * still reflect scaffold copy on certain pages.
   */
  rejectedShrinkCount?: number;
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
export type InspectEngine = "playwright" | "ai" | "map";

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
