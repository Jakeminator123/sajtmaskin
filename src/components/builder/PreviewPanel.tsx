"use client";

import {
  AlertCircle,
  BrainCircuit,
  Code2,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircleQuestion,
  MousePointer2,
  RefreshCw,
  Search,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { buildFileTree } from "@/lib/builder/fileTree";
import {
  readContactDetailsDraft,
  updateContactDetailsDraft,
  type ContactDetailsDraft,
} from "@/lib/builder/contact-editor";
import {
  readHeroContentDraft,
  updateHeroContentDraft,
  type HeroContentDraft,
} from "@/lib/builder/hero-editor";
import {
  readServiceItemsDraft,
  updateServiceItemsDraft,
  type ServiceItemDraft,
} from "@/lib/builder/services-editor";
import {
  readFaqItemsDraft,
  updateFaqItemsDraft,
  type FaqItemDraft,
} from "@/lib/builder/faq-editor";
import {
  readTestimonialItemsDraft,
  updateTestimonialItemsDraft,
  type TestimonialItemDraft,
} from "@/lib/builder/testimonials-editor";
import {
  readStatItemsDraft,
  updateStatItemsDraft,
  type StatItemDraft,
} from "@/lib/builder/stats-editor";
import {
  readProcessStepsDraft,
  updateProcessStepsDraft,
  type ProcessStepDraft,
} from "@/lib/builder/process-editor";
import {
  readProductItemsDraft,
  updateProductItemsDraft,
  type ProductItemDraft,
} from "@/lib/builder/product-editor";
import {
  readPricingCardsDraft,
  updatePricingCardsDraft,
  type PricingCardDraft,
} from "@/lib/builder/pricing-editor";
import {
  readPricingFeatureCardsDraft,
  updatePricingFeatureCardsDraft,
  type PricingFeatureCardDraft,
} from "@/lib/builder/pricing-features-editor";
import {
  readStaticMetadataDraft,
  updateStaticMetadataDraft,
  type StaticMetadataDraft,
} from "@/lib/builder/metadata-editor";
import {
  dispatchInspectCaptureEvent,
  dispatchPlacementSelectEvent,
  type PlacementSelectEventDetail,
} from "@/lib/builder/inspect-events";
import type { FileNode, ElementMapItem, ElementMapResponse } from "@/lib/builder/types";
import {
  buildJsxElementRegistry,
  matchCapturedElement,
  type RegistryMatch,
} from "@/lib/builder/jsx-element-registry";
import {
  extractSectionZones,
  nearestInsertionPoint,
  type InsertionPoint,
} from "@/lib/builder/sectionAnalyzer";
import { ElementRegistry } from "@/components/builder/ElementRegistry";
import { FileExplorer } from "@/components/builder/FileExplorer";
import { useIntegrationStatus } from "@/lib/hooks/useIntegrationStatus";
import { useInspectorWorkerStatus } from "@/lib/hooks/useInspectorWorkerStatus";
import { dispatchAutoFixEvent } from "@/lib/hooks/chat/auto-fix-events";
import { reportRenderOutcome } from "@/lib/gen/eval/render-telemetry";
import {
  INITIAL_PREVIEW_RENDER_OUTCOME_STATE,
  describePreviewDiagnosticCode,
  nextPreviewRenderOutcomeState,
  previewDiagnosticCodeFromKind,
  previewDiagnosticStageFromKind,
  shouldAutoFixPreviewDiagnostic,
  shouldReportPreviewOutcome,
} from "@/lib/gen/preview-diagnostics";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

type PreviewIssuePayload = {
  message?: string | null;
  name?: string | null;
  stack?: string | null;
  kind?: string | null;
  code?: string | null;
  stage?: string | null;
  source?: string | null;
};

type PreviewIframeMessage = {
  source?: string;
  type?: "preview-error" | "preview-ready" | "navigation-attempt";
  payload?: PreviewIssuePayload & { href?: string | null };
};

function detectOwnEnginePreviewIssue(doc: Document | null): PreviewIssuePayload | null {
  if (!doc?.body) return null;

  const diagnosticCode =
    doc.querySelector('meta[name="preview-error-code"]')?.getAttribute("content")?.trim() || null;
  const diagnosticStage =
    doc.querySelector('meta[name="preview-error-stage"]')?.getAttribute("content")?.trim() || null;
  const diagnosticSource =
    doc.querySelector('meta[name="preview-error-source"]')?.getAttribute("content")?.trim() || null;

  const root = doc.getElementById("root");
  const rootText = root?.innerText?.trim() || "";
  if (rootText.startsWith("Preview-fel")) {
    const kind = rootText.includes("Preview validation failed") ? "validation" : "runtime";
    return {
      message: rootText.replace(/^Preview-fel\s*/u, "").trim() || "Unknown preview error",
      kind,
      code: diagnosticCode || previewDiagnosticCodeFromKind(kind),
      stage: diagnosticStage || previewDiagnosticStageFromKind(kind),
      source: diagnosticSource || "own-engine-preview",
    };
  }

  if (!root) {
    const bodyText = doc.body.innerText.trim();
    if (bodyText) {
      return {
        message: bodyText,
        kind: "route",
        code: diagnosticCode || "preview_route_error",
        stage: diagnosticStage || "render-route",
        source: diagnosticSource || "preview-render-route",
      };
    }
  }

  return null;
}

function buildOwnEngineRoutePreviewUrl(currentUrl: string, nextHref: string): string | null {
  const href = nextHref.trim();
  if (!href.startsWith("/")) return null;

  try {
    const url = new URL(currentUrl, window.location.origin);
    url.searchParams.set("route", href);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function buildExternalRoutePreviewUrl(currentUrl: string, nextHref: string): string | null {
  const href = nextHref.trim();
  if (!href.startsWith("/")) return null;

  try {
    const url = new URL(currentUrl, window.location.origin);
    url.pathname = href;
    return currentUrl.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return null;
  }
}

function extractPreviewRoutesFromFileNames(fileNames: string[]): string[] {
  const routes = new Set<string>();

  const pushRoute = (segments: string[]) => {
    const normalized = segments
      .filter(Boolean)
      .map((segment) => segment.trim())
      .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));
    if (normalized.some((segment) => segment.includes("[") || segment.includes("]"))) return;
    routes.add(normalized.length > 0 ? `/${normalized.join("/")}` : "/");
  };

  for (const rawName of fileNames) {
    const name = rawName.replace(/\\/g, "/");

    const appMatch = name.match(/^(?:src\/)?app\/(.+)$/);
    if (appMatch) {
      const relative = appMatch[1];
      if (relative === "page.tsx" || relative.endsWith("/page.tsx")) {
        const routeDir = relative.replace(/\/?page\.tsx$/, "");
        pushRoute(routeDir ? routeDir.split("/") : []);
      }
      continue;
    }

    const pagesMatch = name.match(/^pages\/(.+)$/);
    if (pagesMatch) {
      const relative = pagesMatch[1];
      if (relative.startsWith("api/")) continue;
      if (!/\.(tsx|ts|jsx|js)$/.test(relative)) continue;
      const routeFile = relative.replace(/\.(tsx|ts|jsx|js)$/, "");
      const routePath = routeFile.endsWith("/index")
        ? routeFile.slice(0, -"/index".length)
        : routeFile === "index"
          ? ""
          : routeFile;
      pushRoute(routePath ? routePath.split("/") : []);
    }
  }

  const orderedRoutes = Array.from(routes).sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });
  return orderedRoutes;
}

interface PreviewPanelProps {
  chatId: string | null;
  versionId: string | null;
  demoUrl: string | null;
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
  placementMode?: boolean;
  pendingPlacementItem?: {
    title: string;
    description?: string | null;
  } | null;
  onPlacementComplete?: (detail: PlacementSelectEventDetail) => void;
}

type PreviewViewMode = "preview" | "code" | "registry";
type InspectEngine = "playwright" | "ai" | "map";
const PREVIEW_READY_TIMEOUT_MS = 10_000;
const PREVIEW_READY_POLL_MS = 250;

type AiMatchResult = {
  tag: string;
  text: string | null;
  className: string | null;
  filePath: string | null;
  lineNumber: number | null;
  confidence: string;
  reasoning: string | null;
};

type AiMatchResponse = {
  success: boolean;
  model?: string;
  element?: AiMatchResult | null;
  tokens?: { input: number; output: number; total: number };
  cost?: { usd: number; display: string };
  error?: string;
};

export function PreviewPanel({
  chatId,
  versionId,
  demoUrl,
  onNavigatePreviewUrl,
  isLoading: externalLoading,
  onClear,
  onFixPreview,
  refreshToken,
  onFilesSaved,
  imageGenerationsEnabled = true,
  imageGenerationsSupported = true,
  isBlobConfigured = false,
  awaitingInput = false,
  placementMode = false,
  pendingPlacementItem = null,
  onPlacementComplete,
}: PreviewPanelProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [iframeErrorMessage, setIframeErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [previewRoutes, setPreviewRoutes] = useState<string[]>([]);
  const [previewRoutesLoading, setPreviewRoutesLoading] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState<StaticMetadataDraft | null>(null);
  const [metadataSaveError, setMetadataSaveError] = useState<string | null>(null);
  const [isMetadataSaving, setIsMetadataSaving] = useState(false);
  const [heroDraft, setHeroDraft] = useState<HeroContentDraft | null>(null);
  const [heroSaveError, setHeroSaveError] = useState<string | null>(null);
  const [isHeroSaving, setIsHeroSaving] = useState(false);
  const [serviceItemsDraft, setServiceItemsDraft] = useState<ServiceItemDraft[] | null>(null);
  const [servicesSaveError, setServicesSaveError] = useState<string | null>(null);
  const [isServicesSaving, setIsServicesSaving] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDetailsDraft | null>(null);
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);
  const [isContactSaving, setIsContactSaving] = useState(false);
  const [faqItemsDraft, setFaqItemsDraft] = useState<FaqItemDraft[] | null>(null);
  const [faqSaveError, setFaqSaveError] = useState<string | null>(null);
  const [isFaqSaving, setIsFaqSaving] = useState(false);
  const [testimonialItemsDraft, setTestimonialItemsDraft] = useState<TestimonialItemDraft[] | null>(null);
  const [testimonialsSaveError, setTestimonialsSaveError] = useState<string | null>(null);
  const [isTestimonialsSaving, setIsTestimonialsSaving] = useState(false);
  const [statItemsDraft, setStatItemsDraft] = useState<StatItemDraft[] | null>(null);
  const [statsSaveError, setStatsSaveError] = useState<string | null>(null);
  const [isStatsSaving, setIsStatsSaving] = useState(false);
  const [processStepsDraft, setProcessStepsDraft] = useState<ProcessStepDraft[] | null>(null);
  const [processSaveError, setProcessSaveError] = useState<string | null>(null);
  const [isProcessSaving, setIsProcessSaving] = useState(false);
  const [productItemsDraft, setProductItemsDraft] = useState<ProductItemDraft[] | null>(null);
  const [productsSaveError, setProductsSaveError] = useState<string | null>(null);
  const [isProductsSaving, setIsProductsSaving] = useState(false);
  const [pricingCardsDraft, setPricingCardsDraft] = useState<PricingCardDraft[] | null>(null);
  const [pricingSaveError, setPricingSaveError] = useState<string | null>(null);
  const [isPricingSaving, setIsPricingSaving] = useState(false);
  const [pricingFeatureCardsDraft, setPricingFeatureCardsDraft] =
    useState<PricingFeatureCardDraft[] | null>(null);
  const [pricingFeaturesSaveError, setPricingFeaturesSaveError] = useState<string | null>(null);
  const [isPricingFeaturesSaving, setIsPricingFeaturesSaving] = useState(false);
  const [rawEditMode, setRawEditMode] = useState(false);
  const [rawCodeDraft, setRawCodeDraft] = useState("");
  const [rawCodeSaveError, setRawCodeSaveError] = useState<string | null>(null);
  const [isRawCodeSaving, setIsRawCodeSaving] = useState(false);
  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [selectedRegistryLine, setSelectedRegistryLine] = useState<number | null>(null);
  const { integrationStatus, integrationError } = useIntegrationStatus(demoUrl);
  const { inspectorWorkerStatus, inspectorWorkerMessage } = useInspectorWorkerStatus();
  const [isViewSwitchPending, startViewSwitchTransition] = useTransition();
  const [inspectMode, setInspectMode] = useState(false);
  const [inspectEngine, setInspectEngine] = useState<InspectEngine>("map");
  const [isCapturePending, setIsCapturePending] = useState(false);
  const [inspectStatus, setInspectStatus] = useState<string | null>(null);
  const [inspectPulse, setInspectPulse] = useState<InspectPulseMarker | null>(null);
  const [lastCodeMatch, setLastCodeMatch] = useState<RegistryMatch | null>(null);
  const [lastAiCostDisplay, setLastAiCostDisplay] = useState<string | null>(null);
  const [totalAiCostUsd, setTotalAiCostUsd] = useState(0);
  const [elementMap, setElementMap] = useState<ElementMapItem[]>([]);
  const [elementMapLoading, setElementMapLoading] = useState(false);
  const [inspectorUnavailable, setInspectorUnavailable] = useState(false);
  const [hoveredMapElement, setHoveredMapElement] = useState<ElementMapItem | null>(null);
  const [hoveredPlacement, setHoveredPlacement] = useState<InsertionPoint | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const inspectPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeScrollRef = useRef<HTMLDivElement | null>(null);
  const previewReadyTimerRef = useRef<number | null>(null);
  const elementRegistryRef = useRef<ReturnType<typeof buildJsxElementRegistry>>([]);
  const previewIssueKeysRef = useRef<Set<string>>(new Set());
  const renderOutcomeStateRef = useRef(INITIAL_PREVIEW_RENDER_OUTCOME_STATE);
  const inspectFetchTokenRef = useRef(0);

  const updateFileTreeContent = useCallback(
    (nodes: FileNode[], targetPath: string, nextContent: string): FileNode[] =>
      nodes.map((node) => {
        if (node.type === "file" && node.path === targetPath) {
          return { ...node, content: nextContent };
        }
        if (node.children?.length) {
          return {
            ...node,
            children: updateFileTreeContent(node.children, targetPath, nextContent),
          };
        }
        return node;
      }),
    [],
  );

  const clearPreviewReadyTimer = useCallback(() => {
    if (previewReadyTimerRef.current) {
      window.clearTimeout(previewReadyTimerRef.current);
      previewReadyTimerRef.current = null;
    }
  }, []);

  const buildPreviewSrc = useCallback((url: string, token?: number) => {
    let src = url;
    if (token) {
      const separator = src.includes("?") ? "&" : "?";
      src = `${src}${separator}t=${token}`;
    }
    return src;
  }, []);

  const reportPreviewIssue = useCallback(
    async (payload: PreviewIssuePayload) => {
      if (!chatId || !versionId) return;

      const message = payload.message?.trim();
      if (!message) return;

      const kind = payload.kind?.trim() || "runtime";
      const code = payload.code?.trim() || previewDiagnosticCodeFromKind(kind);
      const stage = payload.stage?.trim() || previewDiagnosticStageFromKind(kind);
      const source = payload.source?.trim() || "own-engine-preview";
      const dedupeKey = `${chatId}:${versionId}:${code}:${message}`;
      if (previewIssueKeysRef.current.has(dedupeKey)) return;
      previewIssueKeysRef.current.add(dedupeKey);

      const reason = describePreviewDiagnosticCode(code) ?? "Previewfel upptackt.";
      const meta = {
        source,
        demoUrl,
        kind,
        previewKind: kind,
        previewCode: code,
        previewStage: stage,
        previewSource: source,
        name: payload.name ?? null,
        message,
        stack: payload.stack ?? null,
      };

      try {
        await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              level: "error",
              category: "preview",
              message: reason,
              meta,
            }),
          },
        );
      } catch (error) {
        console.warn("[Preview] Failed to persist preview issue:", error);
      }

      if (shouldAutoFixPreviewDiagnostic(code)) {
        dispatchAutoFixEvent({
          chatId,
          versionId,
          reasons: [reason],
          meta,
        });
        toast.error("Preview-fel upptäckt. Försöker reparera automatiskt.", { duration: 5000 });
      } else {
        toast.error(reason, { duration: 5000 });
      }
    },
    [chatId, versionId, demoUrl],
  );

  const reportOwnEngineRenderFailure = useCallback(
    (payload: PreviewIssuePayload) => {
      void reportPreviewIssue(payload);
      if (!chatId || !versionId) return;
      if (!shouldReportPreviewOutcome(renderOutcomeStateRef.current, versionId, "failure")) return;
      renderOutcomeStateRef.current = nextPreviewRenderOutcomeState(versionId, "failure");
      const errorMsg =
        typeof payload.message === "string" && payload.message.trim()
          ? payload.message
          : "Preview render error";
      const errorKind = typeof payload.kind === "string" ? payload.kind : "runtime";
      const errorCode =
        typeof payload.code === "string" ? payload.code : previewDiagnosticCodeFromKind(errorKind);
      const errorStage =
        typeof payload.stage === "string"
          ? payload.stage
          : previewDiagnosticStageFromKind(errorKind);
      void reportRenderOutcome({
        chatId,
        versionId,
        success: false,
        source: "own-engine",
        demoUrl: demoUrl ?? undefined,
        errorMessage: errorMsg,
        errorCategory: errorKind,
        errorCode,
        errorStage,
      });
    },
    [chatId, versionId, demoUrl, reportPreviewIssue],
  );

  const fetchFilesForRegistry = useCallback(async () => {
    if (!chatId || !versionId || files.length > 0) return;
    try {
      const response = await fetch(
        `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(versionId)}`,
      );
      const data = (await response.json().catch(() => null)) as {
        files?: Array<{ name: string; content: string; locked?: boolean }>;
      } | null;
      if (!response.ok) return;
      const flatFiles = Array.isArray(data?.files) ? data.files : [];
      if (flatFiles.length > 0) {
        setFiles(buildFileTree(flatFiles));
      }
    } catch {
      /* best-effort */
    }
  }, [chatId, versionId, files.length]);

  const fetchPreviewRoutes = useCallback(async () => {
    if (!chatId || !versionId) {
      setPreviewRoutes([]);
      return;
    }

    setPreviewRoutesLoading(true);
    try {
      const response = await fetch(
        `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(versionId)}`,
      );
      const data = (await response.json().catch(() => null)) as {
        files?: Array<{ name: string }>;
      } | null;
      if (!response.ok) {
        setPreviewRoutes([]);
        return;
      }
      const fileNames = Array.isArray(data?.files) ? data.files.map((file) => file.name) : [];
      setPreviewRoutes(extractPreviewRoutesFromFileNames(fileNames));
    } catch {
      setPreviewRoutes([]);
    } finally {
      setPreviewRoutesLoading(false);
    }
  }, [chatId, versionId]);

  const fetchElementMap = useCallback(
    async (
      url: string,
      width: number,
      height: number,
      requestToken = inspectFetchTokenRef.current,
    ) => {
      if (requestToken !== inspectFetchTokenRef.current) return 0;
      setElementMapLoading(true);
      setInspectorUnavailable(false);
      try {
        const inspectorUrl = url.startsWith("/") ? `${window.location.origin}${url}` : url;

        const isOwnEnginePreview = inspectorUrl.includes("/api/preview-render");

        const res = await fetch("/api/inspector-element-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: inspectorUrl,
            viewportWidth: width,
            viewportHeight: height,
            maxElements: 300,
          }),
        });
        const data = (await res.json().catch(() => null)) as ElementMapResponse | null;
        if (res.ok && data?.success && Array.isArray(data.elements)) {
          if (requestToken !== inspectFetchTokenRef.current) return 0;
          setElementMap(data.elements);
          return data.elements.length;
        }
        if (requestToken !== inspectFetchTokenRef.current) return 0;
        setElementMap([]);
        setInspectorUnavailable(true);
        if (isOwnEnginePreview) {
          console.info(
            "[inspector] Own-engine preview — inspector requires Playwright or inspector-worker to be running.",
          );
        }
        return 0;
      } catch {
        if (requestToken !== inspectFetchTokenRef.current) return 0;
        setElementMap([]);
        setInspectorUnavailable(true);
        return 0;
      } finally {
        if (requestToken === inspectFetchTokenRef.current) {
          setElementMapLoading(false);
        }
      }
    },
    [],
  );

  const handleToggleInspect = useCallback(() => {
    if (!demoUrl) return;
    setInspectMode((prev) => {
      const next = !prev;
      const requestToken = ++inspectFetchTokenRef.current;
      if (next) {
        setIframeLoading(true);
        setIframeError(false);
        setIframeErrorMessage(null);
        const iframe = iframeRef.current;
        if (iframe) {
          iframe.src = buildPreviewSrc(demoUrl, Date.now());
        }
        fetchFilesForRegistry();
        const container = iframeRef.current?.parentElement;
        const w = container?.clientWidth || 1280;
        const h = container?.clientHeight || 800;
        fetchElementMap(demoUrl, w, h, requestToken).then((count) => {
          if (requestToken === inspectFetchTokenRef.current && count > 0) {
            setInspectStatus(`Elementkarta laddad: ${count} element. Hovra för att identifiera.`);
          }
        });
      } else {
        setHoveredMapElement(null);
        setElementMap([]);
        setElementMapLoading(false);
      }
      return next;
    });
    setLastCodeMatch(null);
    setInspectStatus("Laddar elementkarta...");
  }, [buildPreviewSrc, demoUrl, fetchFilesForRegistry, fetchElementMap]);

  const flatFilesForAi = useMemo(() => {
    const result: Array<{ name: string; content: string }> = [];
    const walk = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === "file" && node.content)
          result.push({ name: node.path, content: node.content });
        if (node.children?.length) walk(node.children);
      }
    };
    walk(files);
    return result;
  }, [files]);

  const sectionZones = useMemo(() => extractSectionZones(elementMap), [elementMap]);

  const handlePlacementMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!placementMode) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const yPercent = Number(((y / rect.height) * 100).toFixed(2));
      const insertion = nearestInsertionPoint(yPercent, sectionZones);
      setHoveredPlacement(insertion);
    },
    [placementMode, sectionZones],
  );

  const handlePlacementClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!demoUrl || !placementMode || iframeLoading || externalLoading) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const xPercent = Number(((x / rect.width) * 100).toFixed(2));
      const yPercent = Number(((y / rect.height) * 100).toFixed(2));
      const insertion = nearestInsertionPoint(yPercent, sectionZones);

      const detail: PlacementSelectEventDetail = {
        id: `placement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        demoUrl,
        xPercent,
        yPercent,
        lineYPercent: insertion.lineYPercent,
        viewportWidth: Math.round(rect.width),
        viewportHeight: Math.round(rect.height),
        placement: insertion.placement,
        placementLabel: insertion.label,
        anchorSection: insertion.anchorSection,
      };
      dispatchPlacementSelectEvent(detail);
      onPlacementComplete?.(detail);
      toast.success(`Placering vald: ${insertion.label}`);
    },
    [demoUrl, placementMode, iframeLoading, externalLoading, sectionZones, onPlacementComplete],
  );

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
      setLastCodeMatch(null);
      setLastAiCostDisplay(null);

      if (inspectEngine === "map") {
        const el = hoveredMapElement;
        if (!el) {
          setIsCapturePending(false);
          toast("Hovra över ett element först.");
          return;
        }

        const codeMatch = matchCapturedElement(elementRegistryRef.current, {
          tag: el.tag,
          id: el.id,
          className: el.className,
          text: el.text,
          selector: el.selector,
        });
        setLastCodeMatch(codeMatch);

        const matchHint = codeMatch
          ? ` → ${codeMatch.item.filePath}:${codeMatch.item.lineNumber}`
          : "";
        setInspectStatus(`<${el.tag}>${el.text ? ` "${el.text.slice(0, 50)}"` : ""}${matchHint}`);
        toast.success(
          `Valde <${el.tag}>${codeMatch ? ` i ${codeMatch.item.filePath}:${codeMatch.item.lineNumber}` : ""}`,
        );

        dispatchInspectCaptureEvent({
          id: captureId,
          demoUrl,
          xPercent,
          yPercent,
          viewportWidth: Math.round(rect.width),
          viewportHeight: Math.round(rect.height),
          pointSummary: `Map: <${el.tag}> vid ${xPercent}%/${yPercent}%${el.text ? ` "${el.text.slice(0, 60)}"` : ""}${matchHint}`,
          element: {
            tag: el.tag,
            id: el.id,
            className: el.className,
            text: el.text,
            ariaLabel: null,
            role: null,
            href: null,
            selector: el.selector,
            nearestHeading: null,
          },
          source: "local",
        });

        setIsCapturePending(false);
        return;
      }

      if (inspectEngine === "ai") {
        setInspectStatus("AI analyserar klickposition...");
        try {
          let aiFiles = flatFilesForAi;
          if (aiFiles.length === 0 && chatId && versionId) {
            setInspectStatus("Hämtar kodfiler...");
            try {
              const filesRes = await fetch(
                `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(versionId)}`,
              );
              const filesData = (await filesRes.json().catch(() => null)) as {
                files?: Array<{ name: string; content: string }>;
              } | null;
              if (filesRes.ok && Array.isArray(filesData?.files) && filesData.files.length > 0) {
                aiFiles = filesData.files;
                setFiles(buildFileTree(filesData.files));
              }
            } catch {
              /* best-effort */
            }
            setInspectStatus("AI analyserar klickposition...");
          }

          const response = await fetch("/api/inspector-ai-match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              xPercent,
              yPercent,
              viewportWidth: Math.round(rect.width),
              viewportHeight: Math.round(rect.height),
              files: aiFiles,
            }),
          });
          const data = (await response.json().catch(() => null)) as AiMatchResponse | null;

          if (data?.cost?.display) setLastAiCostDisplay(data.cost.display);
          if (data?.cost?.usd) setTotalAiCostUsd((prev) => prev + data.cost!.usd);

          if (!response.ok || !data?.success) {
            toast.error(data?.error || "AI-matchning misslyckades.");
            setInspectStatus(`AI-fel: ${data?.error || "okänt"}`);
            return;
          }

          const el = data.element;
          if (!el || !el.filePath) {
            setInspectStatus(
              `AI kunde inte identifiera elementet vid ${xPercent}%/${yPercent}%. (${data.cost?.display || ""})`,
            );
            return;
          }

          const registryHit = matchCapturedElement(elementRegistryRef.current, {
            tag: el.tag,
            className: el.className,
            text: el.text,
          });
          setLastCodeMatch(registryHit);

          const tokenInfo = data.tokens ? ` ${data.tokens.total} tokens` : "";
          const costInfo = data.cost?.display ? ` (${data.cost.display})` : "";
          const confLabel =
            el.confidence === "high" ? "hög" : el.confidence === "medium" ? "medel" : "låg";
          setInspectStatus(
            `AI: <${el.tag}> i ${el.filePath}:${el.lineNumber ?? "?"} [${confLabel}]${tokenInfo}${costInfo}` +
              (el.reasoning ? `\n${el.reasoning}` : ""),
          );

          if (registryHit) {
            toast.success(`AI hittade <${el.tag}> i ${el.filePath}:${el.lineNumber}`);
          } else {
            toast(
              `AI-gissning: <${el.tag}> i ${el.filePath}:${el.lineNumber} (${confLabel} konfidens)`,
            );
          }

          dispatchInspectCaptureEvent({
            id: captureId,
            demoUrl,
            xPercent,
            yPercent,
            viewportWidth: Math.round(rect.width),
            viewportHeight: Math.round(rect.height),
            pointSummary: `AI: <${el.tag}> vid ${el.filePath}:${el.lineNumber} (${confLabel})`,
            element: {
              tag: el.tag,
              id: null,
              className: el.className || null,
              text: el.text || null,
              ariaLabel: null,
              role: null,
              href: null,
              selector: null,
              nearestHeading: null,
            },
            source: "local",
          });
        } catch {
          toast.error("Nätverksfel vid AI-matchning.");
          setInspectStatus("AI-matchning misslyckades (nätverksfel).");
        } finally {
          setIsCapturePending(false);
        }
        return;
      }

      setInspectStatus("Skapar punktbild (Playwright)...");

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
          error: response.ok ? undefined : data?.error || "Kunde inte skapa punktbild",
        });

        if (!response.ok) {
          toast.error(data?.error || "Punkt tillagd utan bild.");
          setInspectStatus("Punkt tillagd utan bild (kunde inte skapa preview).");
          return;
        }

        toast.success("Punkt tillagd i chatten.");

        const codeMatch = data?.element
          ? matchCapturedElement(elementRegistryRef.current, {
              tag: data.element.tag,
              id: data.element.id,
              className: data.element.className,
              text: data.element.text,
              selector: data.element.selector,
            })
          : null;
        setLastCodeMatch(codeMatch);

        if (data?.pointSummary) {
          const matchHint = codeMatch
            ? ` → ${codeMatch.item.filePath}:${codeMatch.item.lineNumber}`
            : "";
          setInspectStatus(
            `${data.pointSummary}${data.source ? ` (${data.source})` : ""}${matchHint}`,
          );
        } else {
          setInspectStatus(`Senaste punkt: x ${xPercent}% • y ${yPercent}%`);
        }
        if (data?.element?.tag && ["html", "body"].includes(data.element.tag)) {
          toast(
            "Tip: klicka närmare själva elementet (t.ex. knapptexten) för mer exakt DOM-träff.",
          );
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
    [
      demoUrl,
      inspectMode,
      inspectEngine,
      isCapturePending,
      iframeLoading,
      externalLoading,
      flatFilesForAi,
      chatId,
      versionId,
      hoveredMapElement,
    ],
  );

  const isOwnEnginePreview = useMemo(() => {
    if (!demoUrl) return false;
    return demoUrl.startsWith("/api/preview-render");
  }, [demoUrl]);

  useEffect(() => {
    return () => {
      if (inspectPulseTimerRef.current) {
        clearTimeout(inspectPulseTimerRef.current);
      }
      clearPreviewReadyTimer();
    };
  }, [clearPreviewReadyTimer]);

  useEffect(() => {
    previewIssueKeysRef.current.clear();
    renderOutcomeStateRef.current = INITIAL_PREVIEW_RENDER_OUTCOME_STATE;
    setIframeErrorMessage(null);
  }, [chatId, versionId, demoUrl]);

  useEffect(() => {
    if (!demoUrl) return;
    setIframeLoading(true);
    setIframeError(false);
    setIframeErrorMessage(null);
  }, [demoUrl, refreshToken]);

  useEffect(() => {
    void fetchPreviewRoutes();
  }, [fetchPreviewRoutes]);

  useEffect(() => {
    const handlePreviewMessage = (event: MessageEvent<PreviewIframeMessage>) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object" || data.source !== "sajtmaskin-preview") return;
      if (!isOwnEnginePreview) return;

      if (data.type === "navigation-attempt") {
        const href = typeof data.payload?.href === "string" ? data.payload.href : "";
        if (!demoUrl || !href) return;
        const nextUrl = buildOwnEngineRoutePreviewUrl(demoUrl, href);
        if (nextUrl && nextUrl !== demoUrl) {
          onNavigatePreviewUrl?.(nextUrl);
        }
        return;
      }

      if (data.type === "preview-ready" && chatId && versionId) {
        setIframeLoading(false);
        setIframeError(false);
        setIframeErrorMessage(null);
        if (!shouldReportPreviewOutcome(renderOutcomeStateRef.current, versionId, "success")) {
          return;
        }
        renderOutcomeStateRef.current = nextPreviewRenderOutcomeState(versionId, "success");
        void reportRenderOutcome({
          chatId,
          versionId,
          success: true,
          source: "own-engine",
          demoUrl: demoUrl ?? undefined,
        });
        return;
      }

      if (data.type !== "preview-error") return;
      reportOwnEngineRenderFailure(data.payload ?? {});
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, [
    demoUrl,
    chatId,
    versionId,
    isOwnEnginePreview,
    onNavigatePreviewUrl,
    reportOwnEngineRenderFailure,
  ]);

  useEffect(() => {
    if (!demoUrl) return;
    setElementMap([]);
    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timerId = window.setTimeout(() => {
          window.clearTimeout(timerId);
          resolve();
        }, ms);
      });

    const run = async () => {
      // Retry map extraction up to ~10s to avoid false empty/502 during warmup.
      const delays = [2000, 3000, 5000];
      for (const delay of delays) {
        await sleep(delay);
        if (cancelled) return;
        const container = iframeRef.current?.parentElement;
        const w = container?.clientWidth || 1280;
        const h = container?.clientHeight || 800;
        const count = await fetchElementMap(demoUrl, w, h);
        if (cancelled) return;
        if (count > 0) return;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [demoUrl, versionId, fetchElementMap]);

  useEffect(() => {
    if (!placementMode) return;
    setInspectMode(false);
    setHoveredMapElement(null);
  }, [placementMode]);

  useEffect(() => {
    if (!placementMode || !demoUrl) {
      setHoveredPlacement(null);
      return;
    }
    const container = iframeRef.current?.parentElement;
    const w = container?.clientWidth || 1280;
    const h = container?.clientHeight || 800;
    void fetchElementMap(demoUrl, w, h);
  }, [placementMode, demoUrl, fetchElementMap]);

  const canShowCode = Boolean(chatId && versionId);
  const isCodeView = viewMode !== "preview";
  const showElementRegistry = viewMode === "registry";

  const handleToggleCode = useCallback(() => {
    if (!canShowCode) return;
    startViewSwitchTransition(() => {
      setViewMode((prev) => (prev === "code" ? "preview" : "code"));
      setSelectedRegistryId(null);
      setSelectedRegistryLine(null);
    });
  }, [canShowCode, startViewSwitchTransition]);

  const handleToggleElementRegistry = useCallback(() => {
    if (!canShowCode) return;
    startViewSwitchTransition(() => {
      setViewMode((prev) => (prev === "registry" ? "preview" : "registry"));
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

  const editableMetadata = useMemo(
    () =>
      selectedFile
        ? readStaticMetadataDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableHeroContent = useMemo(
    () =>
      selectedFile
        ? readHeroContentDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableServiceItems = useMemo(
    () =>
      selectedFile
        ? readServiceItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableContactDetails = useMemo(
    () => (selectedFile ? readContactDetailsDraft(selectedFile.content || "") : null),
    [selectedFile],
  );

  const editableFaqItems = useMemo(
    () =>
      selectedFile
        ? readFaqItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableTestimonialItems = useMemo(
    () =>
      selectedFile
        ? readTestimonialItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableStatItems = useMemo(
    () =>
      selectedFile
        ? readStatItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableProcessSteps = useMemo(
    () =>
      selectedFile
        ? readProcessStepsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editableProductItems = useMemo(
    () =>
      selectedFile
        ? readProductItemsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editablePricingCards = useMemo(
    () =>
      selectedFile
        ? readPricingCardsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  const editablePricingFeatureCards = useMemo(
    () =>
      selectedFile
        ? readPricingFeatureCardsDraft(selectedFile.path, selectedFile.content || "")
        : null,
    [selectedFile],
  );

  useEffect(() => {
    setMetadataDraft(editableMetadata ? { ...editableMetadata } : null);
    setMetadataSaveError(null);
  }, [editableMetadata, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setHeroDraft(editableHeroContent ? { ...editableHeroContent } : null);
    setHeroSaveError(null);
  }, [editableHeroContent, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setServiceItemsDraft(
      editableServiceItems ? editableServiceItems.map((item) => ({ ...item })) : null,
    );
    setServicesSaveError(null);
  }, [editableServiceItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setContactDraft(editableContactDetails ? { ...editableContactDetails } : null);
    setContactSaveError(null);
  }, [editableContactDetails, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setFaqItemsDraft(
      editableFaqItems ? editableFaqItems.map((item) => ({ ...item })) : null,
    );
    setFaqSaveError(null);
  }, [editableFaqItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setTestimonialItemsDraft(
      editableTestimonialItems
        ? editableTestimonialItems.map((item) => ({ ...item }))
        : null,
    );
    setTestimonialsSaveError(null);
  }, [editableTestimonialItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setStatItemsDraft(editableStatItems ? editableStatItems.map((item) => ({ ...item })) : null);
    setStatsSaveError(null);
  }, [editableStatItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setProcessStepsDraft(
      editableProcessSteps ? editableProcessSteps.map((item) => ({ ...item })) : null,
    );
    setProcessSaveError(null);
  }, [editableProcessSteps, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setProductItemsDraft(
      editableProductItems ? editableProductItems.map((item) => ({ ...item })) : null,
    );
    setProductsSaveError(null);
  }, [editableProductItems, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setPricingCardsDraft(
      editablePricingCards ? editablePricingCards.map((item) => ({ ...item })) : null,
    );
    setPricingSaveError(null);
  }, [editablePricingCards, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setPricingFeatureCardsDraft(
      editablePricingFeatureCards
        ? editablePricingFeatureCards.map((item) => ({
            ...item,
            features: [...item.features],
          }))
        : null,
    );
    setPricingFeaturesSaveError(null);
  }, [editablePricingFeatureCards, selectedFile?.path, selectedFile?.content]);

  useEffect(() => {
    setRawEditMode(false);
    setRawCodeDraft(selectedFile?.content || "");
    setRawCodeSaveError(null);
  }, [selectedFile?.path, selectedFile?.content]);

  const metadataDirty = Boolean(
    metadataDraft &&
      editableMetadata &&
      (metadataDraft.title !== editableMetadata.title ||
        metadataDraft.description !== editableMetadata.description),
  );

  const heroDirty = Boolean(
    heroDraft &&
      editableHeroContent &&
      (heroDraft.title !== editableHeroContent.title ||
        heroDraft.intro !== editableHeroContent.intro ||
        heroDraft.ctaLabel !== editableHeroContent.ctaLabel),
  );

  const servicesDirty = Boolean(
    serviceItemsDraft &&
      editableServiceItems &&
      JSON.stringify(serviceItemsDraft) !== JSON.stringify(editableServiceItems),
  );

  const contactDirty = Boolean(
    contactDraft &&
      editableContactDetails &&
      (contactDraft.email !== editableContactDetails.email ||
        contactDraft.phone !== editableContactDetails.phone),
  );

  const faqDirty = Boolean(
    faqItemsDraft &&
      editableFaqItems &&
      JSON.stringify(faqItemsDraft) !== JSON.stringify(editableFaqItems),
  );

  const testimonialsDirty = Boolean(
    testimonialItemsDraft &&
      editableTestimonialItems &&
      JSON.stringify(testimonialItemsDraft) !== JSON.stringify(editableTestimonialItems),
  );

  const statsDirty = Boolean(
    statItemsDraft &&
      editableStatItems &&
      JSON.stringify(statItemsDraft) !== JSON.stringify(editableStatItems),
  );

  const processDirty = Boolean(
    processStepsDraft &&
      editableProcessSteps &&
      JSON.stringify(processStepsDraft) !== JSON.stringify(editableProcessSteps),
  );

  const productsDirty = Boolean(
    productItemsDraft &&
      editableProductItems &&
      JSON.stringify(productItemsDraft) !== JSON.stringify(editableProductItems),
  );

  const pricingDirty = Boolean(
    pricingCardsDraft &&
      editablePricingCards &&
      JSON.stringify(pricingCardsDraft) !== JSON.stringify(editablePricingCards),
  );

  const pricingFeaturesDirty = Boolean(
    pricingFeatureCardsDraft &&
      editablePricingFeatureCards &&
      JSON.stringify(pricingFeatureCardsDraft) !== JSON.stringify(editablePricingFeatureCards),
  );

  const rawCodeDirty = Boolean(selectedFile && rawCodeDraft !== (selectedFile.content || ""));

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
    if (!isCodeView || !chatId || !versionId) return;
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
        if (!response.ok)
          throw new Error(data?.error || `Failed to fetch files (HTTP ${response.status})`);
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
  }, [isCodeView, chatId, versionId, refreshToken, findFirstFile, getPreferredFilePath]);

  const saveSelectedFileContent = useCallback(async (nextContent: string) => {
    if (!chatId || !versionId || !selectedFile) {
      throw new Error("Ingen aktiv fil att spara.");
    }

    const currentContent = selectedFile.content || "";
    if (nextContent === currentContent) return false;

    try {
      const response = await fetch(
        `/api/v0/chats/${encodeURIComponent(chatId)}/files`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            versionId,
            fileName: selectedFile.path,
            content: nextContent,
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(data?.error || `Kunde inte spara metadata (HTTP ${response.status})`);
      }

      setFiles((prev) => updateFileTreeContent(prev, selectedFile.path, nextContent));
      onFilesSaved?.();
      return true;
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Kunde inte spara filinnehåll",
      );
    }
  }, [chatId, versionId, selectedFile, updateFileTreeContent, onFilesSaved]);

  const handleSaveMetadata = useCallback(async () => {
    if (!selectedFile || !metadataDraft) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateStaticMetadataDraft(currentContent, metadataDraft);

    setIsMetadataSaving(true);
    setMetadataSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Metadata sparad i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara metadata";
      setMetadataSaveError(message);
      toast.error(message);
    } finally {
      setIsMetadataSaving(false);
    }
  }, [selectedFile, metadataDraft, saveSelectedFileContent]);

  const handleSaveHeroContent = useCallback(async () => {
    if (!selectedFile || !heroDraft || !editableHeroContent) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateHeroContentDraft(currentContent, editableHeroContent, heroDraft);

    setIsHeroSaving(true);
    setHeroSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Hero-innehåll sparat i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara hero-innehåll";
      setHeroSaveError(message);
      toast.error(message);
    } finally {
      setIsHeroSaving(false);
    }
  }, [selectedFile, heroDraft, editableHeroContent, saveSelectedFileContent]);

  const handleSaveServiceItems = useCallback(async () => {
    if (!selectedFile || !serviceItemsDraft || !editableServiceItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateServiceItemsDraft(currentContent, serviceItemsDraft);

    setIsServicesSaving(true);
    setServicesSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Tjänstepaket sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara tjänstepaket";
      setServicesSaveError(message);
      toast.error(message);
    } finally {
      setIsServicesSaving(false);
    }
  }, [selectedFile, serviceItemsDraft, editableServiceItems, saveSelectedFileContent]);

  const handleSaveContactDetails = useCallback(async () => {
    if (!selectedFile || !contactDraft || !editableContactDetails) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateContactDetailsDraft(currentContent, editableContactDetails, contactDraft);

    setIsContactSaving(true);
    setContactSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Kontaktuppgifter sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara kontaktuppgifter";
      setContactSaveError(message);
      toast.error(message);
    } finally {
      setIsContactSaving(false);
    }
  }, [selectedFile, contactDraft, editableContactDetails, saveSelectedFileContent]);

  const handleSaveFaqItems = useCallback(async () => {
    if (!selectedFile || !faqItemsDraft || !editableFaqItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateFaqItemsDraft(currentContent, faqItemsDraft);

    setIsFaqSaving(true);
    setFaqSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("FAQ sparad i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara FAQ";
      setFaqSaveError(message);
      toast.error(message);
    } finally {
      setIsFaqSaving(false);
    }
  }, [selectedFile, faqItemsDraft, editableFaqItems, saveSelectedFileContent]);

  const handleSaveTestimonialItems = useCallback(async () => {
    if (!selectedFile || !testimonialItemsDraft || !editableTestimonialItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateTestimonialItemsDraft(currentContent, testimonialItemsDraft);

    setIsTestimonialsSaving(true);
    setTestimonialsSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Omdömen sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara omdömen";
      setTestimonialsSaveError(message);
      toast.error(message);
    } finally {
      setIsTestimonialsSaving(false);
    }
  }, [selectedFile, testimonialItemsDraft, editableTestimonialItems, saveSelectedFileContent]);

  const handleSaveStatItems = useCallback(async () => {
    if (!selectedFile || !statItemsDraft || !editableStatItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateStatItemsDraft(currentContent, statItemsDraft);

    setIsStatsSaving(true);
    setStatsSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Nyckeltal sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara nyckeltal";
      setStatsSaveError(message);
      toast.error(message);
    } finally {
      setIsStatsSaving(false);
    }
  }, [selectedFile, statItemsDraft, editableStatItems, saveSelectedFileContent]);

  const handleSaveProcessSteps = useCallback(async () => {
    if (!selectedFile || !processStepsDraft || !editableProcessSteps) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateProcessStepsDraft(currentContent, processStepsDraft);

    setIsProcessSaving(true);
    setProcessSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Processteg sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara processteg";
      setProcessSaveError(message);
      toast.error(message);
    } finally {
      setIsProcessSaving(false);
    }
  }, [selectedFile, processStepsDraft, editableProcessSteps, saveSelectedFileContent]);

  const handleSaveProductItems = useCallback(async () => {
    if (!selectedFile || !productItemsDraft || !editableProductItems) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updateProductItemsDraft(currentContent, productItemsDraft);

    setIsProductsSaving(true);
    setProductsSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Produkter sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara produkter";
      setProductsSaveError(message);
      toast.error(message);
    } finally {
      setIsProductsSaving(false);
    }
  }, [selectedFile, productItemsDraft, editableProductItems, saveSelectedFileContent]);

  const handleSavePricingCards = useCallback(async () => {
    if (!selectedFile || !pricingCardsDraft || !editablePricingCards) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updatePricingCardsDraft(currentContent, pricingCardsDraft);

    setIsPricingSaving(true);
    setPricingSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Prisplaner sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara prisplaner";
      setPricingSaveError(message);
      toast.error(message);
    } finally {
      setIsPricingSaving(false);
    }
  }, [selectedFile, pricingCardsDraft, editablePricingCards, saveSelectedFileContent]);

  const handleSavePricingFeatures = useCallback(async () => {
    if (!selectedFile || !pricingFeatureCardsDraft || !editablePricingFeatureCards) return;
    const currentContent = selectedFile.content || "";
    const nextContent = updatePricingFeatureCardsDraft(
      currentContent,
      pricingFeatureCardsDraft,
    );

    setIsPricingFeaturesSaving(true);
    setPricingFeaturesSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(nextContent);
      if (didSave) toast.success("Pricing-features sparade i aktiv version.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara pricing-features";
      setPricingFeaturesSaveError(message);
      toast.error(message);
    } finally {
      setIsPricingFeaturesSaving(false);
    }
  }, [
    selectedFile,
    pricingFeatureCardsDraft,
    editablePricingFeatureCards,
    saveSelectedFileContent,
  ]);

  const handleSaveRawCode = useCallback(async () => {
    if (!selectedFile) return;
    setIsRawCodeSaving(true);
    setRawCodeSaveError(null);
    try {
      const didSave = await saveSelectedFileContent(rawCodeDraft);
      if (didSave) {
        setRawEditMode(false);
        toast.success("Filändringar sparade i aktiv version.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kunde inte spara filändringar";
      setRawCodeSaveError(message);
      toast.error(message);
    } finally {
      setIsRawCodeSaving(false);
    }
  }, [selectedFile, rawCodeDraft, saveSelectedFileContent]);

  const elementRegistry = useMemo(() => buildJsxElementRegistry(files), [files]);
  elementRegistryRef.current = elementRegistry;

  useEffect(() => {
    if (!showElementRegistry || !selectedRegistryLine) return;
    const container = codeScrollRef.current;
    if (!container) return;
    const approxLineHeight = 18;
    container.scrollTo({
      top: Math.max(0, (selectedRegistryLine - 4) * approxLineHeight),
      behavior: "smooth",
    });
  }, [showElementRegistry, selectedRegistryLine, selectedPath]);

  const handleIframeLoad = useCallback(() => {
    clearPreviewReadyTimer();

    const iframe = iframeRef.current;
    if (!iframe) {
      setIframeLoading(false);
      setIframeError(false);
      setIframeErrorMessage(null);
      return;
    }

    // For own-engine preview, wait until iframe DOM actually contains rendered content.
    if (isOwnEnginePreview) {
      const startedAt = Date.now();
      const checkReady = () => {
        try {
          const doc = iframe.contentDocument;
          const previewIssue = detectOwnEnginePreviewIssue(doc);
          if (previewIssue) {
            setIframeLoading(false);
            setIframeError(false);
            setIframeErrorMessage(null);
            clearPreviewReadyTimer();
            reportOwnEngineRenderFailure(previewIssue);
            return;
          }
          const root = doc?.getElementById("root");
          const hasRootChildren = Boolean(root && root.childElementCount > 0);
          const hasBodyContent = Boolean((doc?.body?.innerText || "").trim().length > 0);
          const hasSubstantialDom = Boolean((doc?.body?.querySelectorAll("*").length || 0) > 12);
          if (hasRootChildren || hasBodyContent || hasSubstantialDom) {
            setIframeLoading(false);
            setIframeError(false);
            setIframeErrorMessage(null);
            clearPreviewReadyTimer();
            return;
          }
        } catch {
          setIframeLoading(false);
          setIframeError(true);
          setIframeErrorMessage(describePreviewDiagnosticCode("preview_document_unavailable"));
          clearPreviewReadyTimer();
          reportOwnEngineRenderFailure({
            message: "Preview iframe document could not be read.",
            kind: "transport",
            code: "preview_document_unavailable",
            stage: "iframe",
            source: "preview-ready-poll",
          });
          return;
        }

        if (Date.now() - startedAt >= PREVIEW_READY_TIMEOUT_MS) {
          setIframeLoading(false);
          setIframeError(true);
          setIframeErrorMessage(describePreviewDiagnosticCode("preview_ready_timeout"));
          clearPreviewReadyTimer();
          reportOwnEngineRenderFailure({
            message: `Preview remained blank after waiting ${PREVIEW_READY_TIMEOUT_MS}ms.`,
            kind: "transport",
            code: "preview_ready_timeout",
            stage: "iframe",
            source: "preview-ready-poll",
          });
          return;
        }

        previewReadyTimerRef.current = window.setTimeout(checkReady, PREVIEW_READY_POLL_MS);
      };

      previewReadyTimerRef.current = window.setTimeout(checkReady, PREVIEW_READY_POLL_MS);
      return;
    }

    setIframeLoading(false);
    setIframeError(false);
    setIframeErrorMessage(null);
  }, [clearPreviewReadyTimer, isOwnEnginePreview, reportOwnEngineRenderFailure]);

  const handleIframeError = useCallback(() => {
    clearPreviewReadyTimer();
    setIframeLoading(false);
    setIframeError(true);
    setIframeErrorMessage(describePreviewDiagnosticCode("preview_transport_error"));
    if (isOwnEnginePreview) {
      reportOwnEngineRenderFailure({
        message: "Preview iframe failed to load.",
        kind: "transport",
        code: "preview_transport_error",
        stage: "iframe",
        source: "preview-iframe",
      });
    }
  }, [clearPreviewReadyTimer, isOwnEnginePreview, reportOwnEngineRenderFailure]);

  const handleRefresh = () => {
    clearPreviewReadyTimer();
    setIframeLoading(true);
    setIframeError(false);
    setIframeErrorMessage(null);
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

  const activePreviewRoute = useMemo(() => {
    if (!demoUrl) return null;
    try {
      if (isOwnEnginePreview) {
        const current = new URL(demoUrl, window.location.origin);
        return current.searchParams.get("route") || "/";
      }
      const current = new URL(demoUrl, window.location.origin);
      return current.pathname || "/";
    } catch {
      return null;
    }
  }, [demoUrl, isOwnEnginePreview]);

  const handleNavigateRoute = useCallback(
    (route: string) => {
      if (!demoUrl) return;
      const nextUrl = isOwnEnginePreview
        ? buildOwnEngineRoutePreviewUrl(demoUrl, route)
        : buildExternalRoutePreviewUrl(demoUrl, route);
      if (!nextUrl || nextUrl === demoUrl) return;
      onNavigatePreviewUrl?.(nextUrl);
      setIframeLoading(true);
      setIframeError(false);
      setIframeErrorMessage(null);
    },
    [demoUrl, isOwnEnginePreview, onNavigatePreviewUrl],
  );

  const handleClear = () => {
    if (!onClear) return;
    clearPreviewReadyTimer();
    setIframeLoading(true);
    setIframeError(false);
    setIframeErrorMessage(null);
    onClear();
  };

  const blobStatus = useMemo(
    () => integrationStatus?.items.find((item) => item.id === "vercel-blob") || null,
    [integrationStatus],
  );
  const isSandboxPreview = useMemo(() => {
    if (!demoUrl) return false;
    try {
      return /sandbox/i.test(new URL(demoUrl).hostname);
    } catch {
      return demoUrl.toLowerCase().includes("sandbox");
    }
  }, [demoUrl]);
  const isV0Preview = Boolean(
    demoUrl && !isOwnEnginePreview && demoUrl.includes("vusercontent.net"),
  );
  const surfaceDescriptor = useMemo(() => {
    if (viewMode === "registry") {
      return {
        label: "Elementregister",
        detail: "Kodläge för att matcha UI-element mot filer och rader.",
        className: "border-purple-900/40 bg-purple-950/25 text-purple-100",
        badgeClassName: "border-purple-500/30 bg-purple-500/10 text-purple-200",
      };
    }
    if (viewMode === "code") {
      return {
        label: "Kodvy",
        detail: "Visar versionsfilerna direkt i buildern.",
        className: "border-zinc-800 bg-zinc-950/50 text-zinc-200",
        badgeClassName: "border-zinc-500/30 bg-zinc-500/10 text-zinc-200",
      };
    }
    if (isOwnEnginePreview) {
      return {
        label: "Runtime preview",
        detail:
          "Primär sanningsyta under iteration. Renderas från den genererade koden i builderns egen runtime och fångar previewfel direkt.",
        className: "border-sky-900/40 bg-sky-950/30 text-sky-100",
        badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-200",
      };
    }
    if (isSandboxPreview) {
      return {
        label: "Sandbox preview",
        detail:
          "Närmare riktig Next.js-runtime än fallback-preview, men kan fortfarande ha separat miljö och token-setup.",
        className: "border-amber-900/40 bg-amber-950/30 text-amber-100",
        badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      };
    }
    if (isV0Preview) {
      return {
        label: "Fallback preview",
        detail:
          "Visar en extern previewyta. Bra för snabb kontroll, men den kan avvika från lokal runtime och publicerad build.",
        className: "border-yellow-900/40 bg-yellow-950/30 text-yellow-100",
        badgeClassName: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
      };
    }
    return {
      label: "Extern preview",
      detail: "Visar den aktuella preview-URL:en för vald version.",
      className: "border-zinc-800 bg-zinc-950/50 text-zinc-200",
      badgeClassName: "border-zinc-500/30 bg-zinc-500/10 text-zinc-200",
    };
  }, [viewMode, isOwnEnginePreview, isSandboxPreview, isV0Preview]);
  if (!demoUrl && !isCodeView) {
    const isInitialEmpty = !chatId && !versionId && !externalLoading;
    const title = awaitingInput
      ? "AI väntar på ditt svar"
      : isInitialEmpty
        ? "Välkommen"
        : "Ingen förhandsvisning ännu";
    const subtitle = awaitingInput
      ? "V0 behöver input innan preview kan genereras — se chatten till vänster."
      : externalLoading
        ? "AI tänker... preview kommer strax."
        : isInitialEmpty
          ? "Skriv en prompt till vänster så genererar vi första preview."
          : "Preview saknas för senaste versionen. Testa att generera igen eller reparera.";
    const showFixAction = Boolean(
      onFixPreview && !externalLoading && !isInitialEmpty && !awaitingInput,
    );
    const EmptyIcon = awaitingInput ? MessageCircleQuestion : isInitialEmpty ? Wand2 : AlertCircle;
    return (
      <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-500">
        <EmptyIcon className="mb-4 h-12 w-12" />
        <p className="mb-2 text-lg font-medium tracking-tight" suppressHydrationWarning>
          {title}
        </p>
        <p className="text-sm" suppressHydrationWarning>
          {subtitle}
        </p>
        {showFixAction && (
          <Button className="mt-4" onClick={onFixPreview} disabled={externalLoading}>
            Försök reparera preview
          </Button>
        )}
      </div>
    );
  }

  const isLoading = externalLoading || iframeLoading;
  const previewSrc = demoUrl ? buildPreviewSrc(demoUrl, refreshToken) : "";
  const showBlobWarning = Boolean(
    demoUrl && !isOwnEnginePreview && blobStatus && !blobStatus.enabled,
  );
  const showExternalWarning = Boolean(demoUrl && isV0Preview);
  const showSandboxWarning = Boolean(demoUrl && !isOwnEnginePreview && isSandboxPreview);
  const showImagesDisabledWarning = Boolean(demoUrl && !imageGenerationsEnabled);
  const showImagesUnsupportedWarning = Boolean(
    demoUrl && imageGenerationsEnabled && !imageGenerationsSupported,
  );
  const showBlobConfigWarning = Boolean(demoUrl && imageGenerationsEnabled && !isBlobConfigured);
  const showWorkerLamp = inspectorWorkerStatus !== "disabled";
  const workerLampClass =
    inspectorWorkerStatus === "healthy"
      ? "bg-emerald-400"
      : inspectorWorkerStatus === "unknown"
        ? "bg-amber-400 animate-pulse"
        : "bg-rose-400";
  const workerLampTitle =
    inspectorWorkerStatus === "healthy"
      ? "Inspector worker är online."
      : inspectorWorkerStatus === "unknown"
        ? "Kontrollerar inspector worker..."
        : inspectorWorkerMessage || "Inspector worker är offline. Fallback används.";
  const showPlacementOverlay = placementMode && Boolean(demoUrl);
  const showInspectOverlay = inspectMode && !showPlacementOverlay;

  return (
    <div className="flex h-full flex-col bg-black/40">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold tracking-tight text-white">Preview</h3>
          <Badge variant="outline" className={surfaceDescriptor.badgeClassName}>
            {surfaceDescriptor.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {showWorkerLamp && (
            <div
              className="mr-1 inline-flex items-center gap-1 rounded border border-gray-700 bg-black/40 px-2 py-1 text-[11px] text-gray-400"
              title={workerLampTitle}
            >
              <span className={cn("h-2 w-2 rounded-full", workerLampClass)} />
              <span>Worker</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleInspect}
            disabled={!demoUrl || placementMode}
            title={
              placementMode
                ? "Placering aktiv - avsluta placering först"
                : "Markera punkt i preview och skicka till chatten"
            }
            className={cn(
              "text-gray-400 hover:text-white",
              inspectMode && "bg-emerald-900/50 text-emerald-300 hover:text-emerald-200",
            )}
          >
            <Search className="mr-1 h-4 w-4" />
            Inspektera preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleElementRegistry}
            disabled={!canShowCode || isViewSwitchPending}
            title={canShowCode ? "Inspektera kod via elementregister" : "Ingen kod tillgänglig än"}
            className={cn(
              "text-gray-400 hover:text-white",
              showElementRegistry && "bg-purple-900/40 text-purple-200 hover:text-purple-100",
            )}
          >
            <Code2 className="mr-1 h-4 w-4" />
            Elementregister
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleCode}
            disabled={!canShowCode || isViewSwitchPending}
            title={canShowCode ? "Visa kod" : "Ingen kod tillgänglig än"}
            className={cn(
              "text-gray-400 hover:text-white",
              viewMode === "code" && "bg-gray-800 text-white hover:text-white",
            )}
          >
            <FileText className="mr-1 h-4 w-4" />
            Kodvy
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
      <div className={cn("border-b px-4 py-2 text-xs", surfaceDescriptor.className)}>
        {surfaceDescriptor.detail}
      </div>
      {!isCodeView && (previewRoutesLoading || previewRoutes.length > 0) && (
        <div className="border-b border-gray-800 bg-black/30 px-4 py-2">
          <div className="mb-1 text-[11px] font-medium text-gray-300">Sidor i skapad preview</div>
          <div className="flex flex-wrap gap-1.5">
            {previewRoutesLoading && previewRoutes.length === 0 ? (
              <span className="text-[11px] text-gray-500">
                Läser routes från versionens filer...
              </span>
            ) : (
              previewRoutes.map((route) => (
                <Button
                  key={route}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-6 border-gray-700 px-2 text-[11px] text-gray-300 hover:bg-gray-800 hover:text-white",
                    activePreviewRoute === route && "border-sky-500/60 bg-sky-500/10 text-sky-200",
                  )}
                  onClick={() => handleNavigateRoute(route)}
                  title={`Visa ${route}`}
                >
                  {route}
                </Button>
              ))
            )}
          </div>
        </div>
      )}
      {!isCodeView &&
        !isOwnEnginePreview &&
        (showBlobWarning ||
          showExternalWarning ||
          showSandboxWarning ||
          integrationError ||
          showImagesDisabledWarning ||
          showImagesUnsupportedWarning ||
          showBlobConfigWarning) && (
          <div className="border-b border-yellow-900/40 bg-yellow-950/30 px-4 py-2 text-xs text-yellow-200">
            {showExternalWarning && (
              <div>
                Sajmaskinens preview körs i utvecklingsmilö för snabbhet. Externa media‑URL:er kan
                ge 404 eller blockeras. Ladda upp media via mediabiblioteket för publika
                Blob‑URL:er.
              </div>
            )}
            {showSandboxWarning && (
              <div>
                Preview körs från sandbox. Sandbox har separat runtime och kan sakna samma
                miljövariabler som din ordinarie miljö (t.ex. blob-token).
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
              <div>
                Bildgenerering är inte tillgänglig just nu (saknad/ogiltig AI-konfiguration).
              </div>
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

      {isCodeView ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r border-gray-800 bg-black/50">
            {showElementRegistry ? (
              <ElementRegistry
                items={elementRegistry}
                selectedId={selectedRegistryId}
                isLoading={filesLoading}
                error={filesError}
                onSelect={(item) => {
                  setSelectedRegistryId(item.id);
                  setSelectedRegistryLine(item.lineNumber);
                  setSelectedPath(item.filePath);
                }}
              />
            ) : (
              <FileExplorer
                files={files}
                selectedPath={selectedPath}
                onFileSelect={(file) => {
                  setSelectedRegistryId(null);
                  setSelectedRegistryLine(null);
                  setSelectedPath(file.path);
                }}
                isLoading={filesLoading}
                error={filesError}
              />
            )}
          </div>
          <div ref={codeScrollRef} className="flex-1 overflow-auto p-4">
            {!selectedFile ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Ingen fil vald
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-gray-300">{selectedFile.path}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rawEditMode ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRawEditMode(false);
                            setRawCodeDraft(selectedFile.content || "");
                            setRawCodeSaveError(null);
                          }}
                          disabled={isRawCodeSaving}
                        >
                          Avbryt redigering
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void handleSaveRawCode()}
                          disabled={!rawCodeDirty || isRawCodeSaving}
                        >
                          {isRawCodeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Spara fil
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setRawEditMode(true)}>
                        Redigera fil
                      </Button>
                    )}
                  </div>
                </div>
                {metadataDraft && editableMetadata ? (
                  <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-cyan-100">Metadata-editor</div>
                        <div className="text-xs text-cyan-200/80">
                          Spara title och description direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveMetadata()}
                        disabled={!metadataDirty || isMetadataSaving}
                      >
                        {isMetadataSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara metadata
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-cyan-100" htmlFor="metadata-title">
                          Title
                        </label>
                        <Input
                          id="metadata-title"
                          value={metadataDraft.title}
                          onChange={(event) =>
                            setMetadataDraft((prev) =>
                              prev ? { ...prev, title: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <label
                          className="text-xs font-medium text-cyan-100"
                          htmlFor="metadata-description"
                        >
                          Description
                        </label>
                        <Textarea
                          id="metadata-description"
                          value={metadataDraft.description}
                          onChange={(event) =>
                            setMetadataDraft((prev) =>
                              prev ? { ...prev, description: event.target.value } : prev,
                            )
                          }
                          rows={3}
                        />
                      </div>
                      {metadataSaveError ? (
                        <div className="text-xs text-rose-300">{metadataSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {heroDraft && editableHeroContent ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-amber-100">Hero-editor</div>
                        <div className="text-xs text-amber-200/80">
                          Uppdatera hero-rubrik, ingress och CTA direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveHeroContent()}
                        disabled={!heroDirty || isHeroSaving}
                      >
                        {isHeroSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara hero
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-amber-100" htmlFor="hero-title">
                          Rubrik
                        </label>
                        <Input
                          id="hero-title"
                          value={heroDraft.title}
                          onChange={(event) =>
                            setHeroDraft((prev) =>
                              prev ? { ...prev, title: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-amber-100" htmlFor="hero-intro">
                          Ingress
                        </label>
                        <Textarea
                          id="hero-intro"
                          value={heroDraft.intro}
                          onChange={(event) =>
                            setHeroDraft((prev) =>
                              prev ? { ...prev, intro: event.target.value } : prev,
                            )
                          }
                          rows={3}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-amber-100" htmlFor="hero-cta">
                          CTA-text
                        </label>
                        <Input
                          id="hero-cta"
                          value={heroDraft.ctaLabel}
                          onChange={(event) =>
                            setHeroDraft((prev) =>
                              prev ? { ...prev, ctaLabel: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      {heroSaveError ? (
                        <div className="text-xs text-rose-300">{heroSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {serviceItemsDraft && editableServiceItems ? (
                  <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-fuchsia-100">Tjänsteeditor</div>
                        <div className="text-xs text-fuchsia-200/80">
                          Uppdatera tjänstetitlar och beskrivningar direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveServiceItems()}
                        disabled={!servicesDirty || isServicesSaving}
                      >
                        {isServicesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara tjänster
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {serviceItemsDraft.map((item, index) => (
                        <div
                          key={`service-item-${index}`}
                          className="rounded-md border border-fuchsia-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-fuchsia-100">
                            Tjänst {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-fuchsia-100"
                                htmlFor={`service-title-${index}`}
                              >
                                Titel
                              </label>
                              <Input
                                id={`service-title-${index}`}
                                value={item.title}
                                onChange={(event) =>
                                  setServiceItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, title: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-fuchsia-100"
                                htmlFor={`service-description-${index}`}
                              >
                                Beskrivning
                              </label>
                              <Textarea
                                id={`service-description-${index}`}
                                value={item.description}
                                onChange={(event) =>
                                  setServiceItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, description: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {servicesSaveError ? (
                        <div className="text-xs text-rose-300">{servicesSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {faqItemsDraft && editableFaqItems ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-amber-100">FAQ-editor</div>
                        <div className="text-xs text-amber-200/80">
                          Uppdatera frågor och svar direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveFaqItems()}
                        disabled={!faqDirty || isFaqSaving}
                      >
                        {isFaqSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara FAQ
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {faqItemsDraft.map((item, index) => (
                        <div
                          key={`faq-item-${index}`}
                          className="rounded-md border border-amber-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-amber-100">
                            FAQ {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-amber-100"
                                htmlFor={`faq-question-${index}`}
                              >
                                Fråga
                              </label>
                              <Input
                                id={`faq-question-${index}`}
                                value={item.question}
                                onChange={(event) =>
                                  setFaqItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, question: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-amber-100"
                                htmlFor={`faq-answer-${index}`}
                              >
                                Svar
                              </label>
                              <Textarea
                                id={`faq-answer-${index}`}
                                value={item.answer}
                                onChange={(event) =>
                                  setFaqItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, answer: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {faqSaveError ? (
                        <div className="text-xs text-rose-300">{faqSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {testimonialItemsDraft && editableTestimonialItems ? (
                  <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-sky-100">Omdömeseditor</div>
                        <div className="text-xs text-sky-200/80">
                          Uppdatera namn, roll och citat direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveTestimonialItems()}
                        disabled={!testimonialsDirty || isTestimonialsSaving}
                      >
                        {isTestimonialsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara omdömen
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {testimonialItemsDraft.map((item, index) => (
                        <div
                          key={`testimonial-item-${index}`}
                          className="rounded-md border border-sky-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-sky-100">
                            Omdöme {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-sky-100"
                                htmlFor={`testimonial-name-${index}`}
                              >
                                Namn
                              </label>
                              <Input
                                id={`testimonial-name-${index}`}
                                value={item.name}
                                onChange={(event) =>
                                  setTestimonialItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, name: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-sky-100"
                                htmlFor={`testimonial-role-${index}`}
                              >
                                Roll
                              </label>
                              <Input
                                id={`testimonial-role-${index}`}
                                value={item.role}
                                onChange={(event) =>
                                  setTestimonialItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, role: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-sky-100"
                                htmlFor={`testimonial-quote-${index}`}
                              >
                                Citat
                              </label>
                              <Textarea
                                id={`testimonial-quote-${index}`}
                                value={item.quote}
                                onChange={(event) =>
                                  setTestimonialItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, quote: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {testimonialsSaveError ? (
                        <div className="text-xs text-rose-300">{testimonialsSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {statItemsDraft && editableStatItems ? (
                  <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-violet-100">Nyckeltalseditor</div>
                        <div className="text-xs text-violet-200/80">
                          Uppdatera etiketter och värden direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveStatItems()}
                        disabled={!statsDirty || isStatsSaving}
                      >
                        {isStatsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara nyckeltal
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {statItemsDraft.map((item, index) => (
                        <div
                          key={`stat-item-${index}`}
                          className="rounded-md border border-violet-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-violet-100">
                            Nyckeltal {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-violet-100"
                                htmlFor={`stat-label-${index}`}
                              >
                                Etikett
                              </label>
                              <Input
                                id={`stat-label-${index}`}
                                value={item.label}
                                onChange={(event) =>
                                  setStatItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, label: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-violet-100"
                                htmlFor={`stat-value-${index}`}
                              >
                                Värde
                              </label>
                              <Input
                                id={`stat-value-${index}`}
                                value={item.value}
                                onChange={(event) =>
                                  setStatItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, value: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {statsSaveError ? (
                        <div className="text-xs text-rose-300">{statsSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {processStepsDraft && editableProcessSteps ? (
                  <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-orange-100">Processtegeditor</div>
                        <div className="text-xs text-orange-200/80">
                          Uppdatera process-/steps-listan direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveProcessSteps()}
                        disabled={!processDirty || isProcessSaving}
                      >
                        {isProcessSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara processteg
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {processStepsDraft.map((item, index) => (
                        <div
                          key={`process-step-${index}`}
                          className="rounded-md border border-orange-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-orange-100">
                            Steg {index + 1}
                          </div>
                          <div className="grid gap-1">
                            <label
                              className="text-xs font-medium text-orange-100"
                              htmlFor={`process-step-${index}`}
                            >
                              Text
                            </label>
                            <Textarea
                              id={`process-step-${index}`}
                              value={item.text}
                              onChange={(event) =>
                                setProcessStepsDraft((prev) =>
                                  prev
                                    ? prev.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? { ...entry, text: event.target.value }
                                          : entry,
                                      )
                                    : prev,
                                )
                              }
                              rows={3}
                            />
                          </div>
                        </div>
                      ))}
                      {processSaveError ? (
                        <div className="text-xs text-rose-300">{processSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {productItemsDraft && editableProductItems ? (
                  <div className="rounded-md border border-pink-500/30 bg-pink-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-pink-100">Produkteditor</div>
                        <div className="text-xs text-pink-200/80">
                          Uppdatera produktnamn och pris direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveProductItems()}
                        disabled={!productsDirty || isProductsSaving}
                      >
                        {isProductsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara produkter
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {productItemsDraft.map((item, index) => (
                        <div
                          key={`product-item-${index}`}
                          className="rounded-md border border-pink-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-pink-100">
                            Produkt {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-pink-100"
                                htmlFor={`product-name-${index}`}
                              >
                                Namn
                              </label>
                              <Input
                                id={`product-name-${index}`}
                                value={item.name}
                                onChange={(event) =>
                                  setProductItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, name: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-pink-100"
                                htmlFor={`product-price-${index}`}
                              >
                                Pris
                              </label>
                              <Input
                                id={`product-price-${index}`}
                                value={item.price}
                                onChange={(event) =>
                                  setProductItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, price: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {productsSaveError ? (
                        <div className="text-xs text-rose-300">{productsSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {pricingCardsDraft && editablePricingCards ? (
                  <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-cyan-100">Pricing-editor</div>
                        <div className="text-xs text-cyan-200/80">
                          Uppdatera namn, pris och beskrivning för prisplaner i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSavePricingCards()}
                        disabled={!pricingDirty || isPricingSaving}
                      >
                        {isPricingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara pricing
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {pricingCardsDraft.map((item, index) => (
                        <div
                          key={`pricing-card-${index}`}
                          className="rounded-md border border-cyan-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-cyan-100">
                            Prisplan {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-cyan-100"
                                htmlFor={`pricing-name-${index}`}
                              >
                                Namn
                              </label>
                              <Input
                                id={`pricing-name-${index}`}
                                value={item.name}
                                onChange={(event) =>
                                  setPricingCardsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, name: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-cyan-100"
                                htmlFor={`pricing-price-${index}`}
                              >
                                Pris
                              </label>
                              <Input
                                id={`pricing-price-${index}`}
                                value={item.price}
                                onChange={(event) =>
                                  setPricingCardsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, price: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-cyan-100"
                                htmlFor={`pricing-description-${index}`}
                              >
                                Beskrivning
                              </label>
                              <Textarea
                                id={`pricing-description-${index}`}
                                value={item.description}
                                onChange={(event) =>
                                  setPricingCardsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, description: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {pricingSaveError ? (
                        <div className="text-xs text-rose-300">{pricingSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {pricingFeatureCardsDraft && editablePricingFeatureCards ? (
                  <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-teal-100">
                          Pricing features-editor
                        </div>
                        <div className="text-xs text-teal-200/80">
                          Uppdatera feature-listorna för prisplaner direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSavePricingFeatures()}
                        disabled={!pricingFeaturesDirty || isPricingFeaturesSaving}
                      >
                        {isPricingFeaturesSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Spara features
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {pricingFeatureCardsDraft.map((card, cardIndex) => (
                        <div
                          key={`pricing-feature-card-${cardIndex}`}
                          className="rounded-md border border-teal-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-teal-100">
                            {card.name}
                          </div>
                          <div className="grid gap-3">
                            {card.features.map((feature, featureIndex) => (
                              <div
                                key={`pricing-feature-${cardIndex}-${featureIndex}`}
                                className="grid gap-1"
                              >
                                <label
                                  className="text-xs font-medium text-teal-100"
                                  htmlFor={`pricing-feature-${cardIndex}-${featureIndex}`}
                                >
                                  Feature {featureIndex + 1}
                                </label>
                                <Input
                                  id={`pricing-feature-${cardIndex}-${featureIndex}`}
                                  value={feature}
                                  onChange={(event) =>
                                    setPricingFeatureCardsDraft((prev) =>
                                      prev
                                        ? prev.map((entry, entryIndex) =>
                                            entryIndex === cardIndex
                                              ? {
                                                  ...entry,
                                                  features: entry.features.map(
                                                    (entryFeature, entryFeatureIndex) =>
                                                      entryFeatureIndex === featureIndex
                                                        ? event.target.value
                                                        : entryFeature,
                                                  ),
                                                }
                                              : entry,
                                          )
                                        : prev,
                                    )
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {pricingFeaturesSaveError ? (
                        <div className="text-xs text-rose-300">{pricingFeaturesSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {contactDraft && editableContactDetails ? (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-emerald-100">Kontakteditor</div>
                        <div className="text-xs text-emerald-200/80">
                          Uppdatera `mailto:` och `tel:` direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveContactDetails()}
                        disabled={!contactDirty || isContactSaving}
                      >
                        {isContactSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara kontakt
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-emerald-100" htmlFor="contact-email">
                          E-post
                        </label>
                        <Input
                          id="contact-email"
                          value={contactDraft.email}
                          onChange={(event) =>
                            setContactDraft((prev) =>
                              prev ? { ...prev, email: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-emerald-100" htmlFor="contact-phone">
                          Telefon
                        </label>
                        <Input
                          id="contact-phone"
                          value={contactDraft.phone}
                          onChange={(event) =>
                            setContactDraft((prev) =>
                              prev ? { ...prev, phone: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      {contactSaveError ? (
                        <div className="text-xs text-rose-300">{contactSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {showElementRegistry && selectedRegistryLine && (
                  <div className="text-xs text-purple-300">Målrad: {selectedRegistryLine}</div>
                )}
                {rawEditMode ? (
                  <div className="space-y-2">
                    <Textarea
                      value={rawCodeDraft}
                      onChange={(event) => setRawCodeDraft(event.target.value)}
                      className="min-h-[420px] font-mono text-xs"
                    />
                    {rawCodeSaveError ? (
                      <div className="text-xs text-rose-300">{rawCodeSaveError}</div>
                    ) : null}
                  </div>
                ) : (
                  <CodeBlock
                    code={selectedFile.content || ""}
                    language={getLanguageFromName(selectedFile.name)}
                    showLineNumbers
                  >
                    <CodeBlockCopyButton className="text-gray-300 hover:text-white" />
                  </CodeBlock>
                )}
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
              <p className="mb-2 text-center text-sm text-gray-400">
                {iframeErrorMessage ||
                  "Preview kunde inte laddas i iframe. Öppna i ny flik istället."}
              </p>
              <p className="mb-4 text-center text-xs text-gray-500">
                Öppna i ny flik eller försök reparera previewn om felet kvarstår.
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

          {showPlacementOverlay && (
            <>
              <div
                className={cn(
                  "absolute inset-0 z-20 cursor-crosshair bg-sky-950/10",
                  (iframeLoading || externalLoading) && "pointer-events-none",
                )}
                onClick={handlePlacementClick}
                onMouseMove={handlePlacementMouseMove}
                onMouseLeave={() => setHoveredPlacement(null)}
              />
              {hoveredPlacement && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-dashed border-sky-400"
                  style={{ top: `${hoveredPlacement.lineYPercent}%` }}
                >
                  <div className="absolute -top-6 left-3 rounded bg-sky-950/90 px-2 py-1 text-[11px] text-sky-200 shadow-lg">
                    {hoveredPlacement.label}
                  </div>
                </div>
              )}
              <div className="absolute top-3 right-3 left-3 z-30 rounded border border-sky-700/70 bg-sky-950/85 px-3 py-2 text-xs text-sky-100 shadow-lg backdrop-blur-sm">
                <div className="font-semibold tracking-tight text-sky-300">Placering aktiv</div>
                <div className="mt-1">
                  Klicka i previewn för att placera{" "}
                  <span className="font-medium text-white">
                    {pendingPlacementItem?.title || "det valda elementet"}
                  </span>
                  .
                </div>
                {pendingPlacementItem?.description ? (
                  <div className="mt-1 text-sky-200/85">{pendingPlacementItem.description}</div>
                ) : null}
                <div className="mt-1 text-[11px] text-sky-200/80">
                  {elementMapLoading
                    ? "Laddar elementkarta för exakt placering..."
                    : `Identifierade zoner: ${sectionZones.length}`}
                </div>
              </div>
            </>
          )}

          {showInspectOverlay && (
            <>
              <div
                className={cn(
                  "absolute inset-0 z-20 cursor-crosshair bg-emerald-950/5",
                  isCapturePending && "pointer-events-none",
                )}
                onClick={handleCaptureClick}
                onMouseMove={
                  inspectEngine === "map" && elementMap.length > 0
                    ? (e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (rect.width <= 0 || rect.height <= 0) return;
                        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                        let best: ElementMapItem | null = null;
                        let bestArea = Infinity;
                        for (const el of elementMap) {
                          const vp = el.vpPercent;
                          if (
                            xPct >= vp.x &&
                            xPct <= vp.x + vp.w &&
                            yPct >= vp.y &&
                            yPct <= vp.y + vp.h
                          ) {
                            const area = vp.w * vp.h;
                            if (area < bestArea && area > 0.01) {
                              best = el;
                              bestArea = area;
                            }
                          }
                        }
                        setHoveredMapElement(best);
                      }
                    : undefined
                }
                onMouseLeave={
                  inspectEngine === "map" ? () => setHoveredMapElement(null) : undefined
                }
              />
              {inspectEngine === "map" && hoveredMapElement && (
                <div
                  className="pointer-events-none absolute z-25 border-2 border-violet-400 bg-violet-500/10"
                  style={{
                    left: `${hoveredMapElement.vpPercent.x}%`,
                    top: `${hoveredMapElement.vpPercent.y}%`,
                    width: `${hoveredMapElement.vpPercent.w}%`,
                    height: `${hoveredMapElement.vpPercent.h}%`,
                  }}
                >
                  <div className="absolute bottom-full left-0 mb-1 max-w-64 truncate rounded bg-zinc-900/95 px-2 py-1 text-[11px] text-violet-200 shadow-lg">
                    &lt;{hoveredMapElement.tag}&gt;
                    {hoveredMapElement.text ? ` "${hoveredMapElement.text.slice(0, 40)}"` : ""}
                    {hoveredMapElement.className
                      ? ` .${hoveredMapElement.className.split(/\s+/).slice(0, 2).join(".")}`
                      : ""}
                  </div>
                </div>
              )}
              {inspectPulse && (
                <div
                  key={inspectPulse.key}
                  className="pointer-events-none absolute z-30"
                  style={{ left: inspectPulse.x, top: inspectPulse.y }}
                >
                  <span className="absolute inline-flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-rose-400 bg-rose-500/30" />
                  <span className="absolute inline-flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 shadow-[0_0_0_2px_rgba(0,0,0,0.35)] ring-2 ring-white/90" />
                </div>
              )}
              <div className="absolute right-0 bottom-0 left-0 z-30 border-t border-emerald-800/60 bg-zinc-950/95 px-4 py-3 text-xs text-gray-300 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tracking-tight text-emerald-400">
                        Inspektion aktiv
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900/80 px-1.5 py-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setInspectEngine("playwright")}
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
                            inspectEngine === "playwright"
                              ? "bg-emerald-800 text-emerald-200"
                              : "text-zinc-500 hover:text-zinc-300",
                          )}
                          title="Playwright: headless browser (screenshot + DOM)"
                        >
                          <Zap className="h-2.5 w-2.5" />
                          PW
                        </button>
                        <button
                          type="button"
                          onClick={() => setInspectEngine("ai")}
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
                            inspectEngine === "ai"
                              ? "bg-purple-800 text-purple-200"
                              : "text-zinc-500 hover:text-zinc-300",
                          )}
                          title="AI: gpt-4o-mini analyserar koden"
                        >
                          <BrainCircuit className="h-2.5 w-2.5" />
                          AI
                        </button>
                        <button
                          type="button"
                          onClick={() => setInspectEngine("map")}
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
                            inspectEngine === "map"
                              ? "bg-violet-800 text-violet-200"
                              : "text-zinc-500 hover:text-zinc-300",
                          )}
                          title="Map: forkompilerad elementkarta med hover"
                        >
                          <MousePointer2 className="h-2.5 w-2.5" />
                          Map
                        </button>
                      </span>
                      {inspectEngine === "map" && (
                        <span className="text-[10px] text-violet-400/70">
                          {elementMapLoading
                            ? "Laddar karta..."
                            : inspectorUnavailable
                              ? "Inspector kräver Playwright eller inspector-worker"
                              : `${elementMap.length} element`}
                        </span>
                      )}
                      {totalAiCostUsd > 0 && (
                        <span
                          className="text-[10px] text-amber-400/70"
                          title="Total AI-kostnad denna session"
                        >
                          session: ${totalAiCostUsd.toFixed(4)}
                          {lastAiCostDisplay ? ` (senaste: ${lastAiCostDisplay})` : ""}
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-400">
                      {inspectEngine === "map"
                        ? "Hovra för att markera element. Klicka för att välja."
                        : inspectEngine === "ai"
                          ? "Klicka i previewn — AI identifierar elementet i koden."
                          : "Klicka i previewn — Playwright tar screenshot + hittar DOM-element."}
                    </div>
                    {inspectStatus && (
                      <div className="mt-1 whitespace-pre-line text-zinc-500">{inspectStatus}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isCapturePending && (
                      <div className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
                        Skapar bild...
                      </div>
                    )}
                    {lastCodeMatch && (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectMode(false);
                          startViewSwitchTransition(() => {
                            setViewMode("registry");
                            setSelectedRegistryId(lastCodeMatch.item.id);
                            setSelectedRegistryLine(lastCodeMatch.item.lineNumber);
                            setSelectedPath(lastCodeMatch.item.filePath);
                          });
                        }}
                        className="rounded bg-purple-900/60 px-2 py-1 text-[11px] font-medium text-purple-200 transition-colors hover:bg-purple-800/70 hover:text-white"
                        title={`Visa ${lastCodeMatch.item.filePath}:${lastCodeMatch.item.lineNumber}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Code2 className="h-3.5 w-3.5" />
                          Visa i kod
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleToggleInspect}
                      className="rounded bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:text-white"
                      title="Stäng inspektion"
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
