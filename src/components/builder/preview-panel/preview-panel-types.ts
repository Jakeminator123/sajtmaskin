import type { PlacementSelectEventDetail } from "@/lib/builder/inspect-events";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";
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
  /** Active preview URL (iframe / sandbox target); not the API JSON field name. */
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
  /** Last SSE sandbox/build failure for this session (cleared on sandbox-ready or version change). */
  sandboxBuildError?: { stage: string; message: string } | null;
  /** `npm run build` result in Vercel sandbox after dev (own-engine); separate from dev-preview. */
  sandboxProdBuild?: { verified: boolean; logSnippet?: string } | null;
  sandboxPending?: boolean;
  /** Server-known sandbox VM id for heartbeat / status (own-engine). */
  activeSandboxId?: string | null;
  previewLifecycle?: PreviewLifecycleState;
  /** Ask controller to verify server session and recover sandbox if needed. */
  onPreviewSessionSuspect?: () => void;
  placementMode?: boolean;
  pendingPlacementItem?: {
    title: string;
    description?: string | null;
  } | null;
  onPlacementComplete?: (detail: PlacementSelectEventDetail) => void;
}

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
