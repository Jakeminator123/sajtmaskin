import type { PlacementSelectEventDetail } from "@/lib/builder/inspect-events";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";
import type { EngineVersionDisplayStatus } from "@/lib/db/engine-version-lifecycle";
import type { AlternatePreviewUrls } from "@/lib/gen/preview/legacy/compatibility-shim";
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
  type?: "preview-error" | "preview-ready" | "navigation-attempt";
  payload?: PreviewIssuePayload & { href?: string | null };
};

export interface PreviewPanelProps {
  chatId: string | null;
  versionId: string | null;
  /** Active preview URL (iframe target); not the API JSON field name. */
  previewUrl: string | null;
  /** Tier 1 + tier 2 URLs stored on the active version — se `docs/architecture/preview-deploy.md`. */
  alternatePreviewUrls?: AlternatePreviewUrls;
  onNavigatePreviewUrl?: (url: string) => void;
  isLoading?: boolean;
  onClear?: () => void;
  onFixPreview?: () => void;
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
  /** Ask controller to verify server session and recover preview if needed. */
  onPreviewSessionSuspect?: () => void;
  placementMode?: boolean;
  pendingPlacementItem?: {
    title: string;
    description?: string | null;
  } | null;
  onPlacementComplete?: (detail: PlacementSelectEventDetail) => void;
  simplified?: boolean;
  onComposerAiFallback?: (payload: ComposerAiFallbackPayload) => void | Promise<void>;
  generationPhase?: import("./GenerationProgress").GenerationPhase;
  onInlineEditPrompt?: (prompt: string, file?: File) => void;
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
