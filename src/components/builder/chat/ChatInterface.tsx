"use client";

import {
  PromptInput,
  PromptInputBody,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  FileUploadZone,
  filesToAttachments,
  filesToPromptText,
  type UploadedFile,
  type V0UserFileAttachment,
} from "@/components/media/file-upload-zone";
import { MediaDrawer } from "@/components/media/media-drawer";
import { TextUploader } from "@/components/media/text-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Bot,
  ChevronDown,
  FileText,
  Globe,
  Hammer,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  classifyComposerIntent,
  composerAllowsAgentBuild,
  describeComposerDecision,
  hasScopedComposerChangeRestriction,
  isAgentProposalReference,
  isComposerMode,
  isReadOnlyComposerRequest,
  resolveComposerDecision,
  type ComposerAttachmentKind,
  type ComposerDecision,
  type ComposerMode,
  type ComposerRouteTone,
} from "@/lib/builder/composer-route";
import { cn } from "@/lib/utils";
import { resolveAgentProposalReference, type AgentProposalReference } from "@/lib/builder/composer-route-reference";
import { readActiveBuilderTarget } from "@/lib/openclaw/builder-target";
import { OpenClawPowersControl } from "@/components/openclaw/OpenClawPowersControl";
import { useOpenClawPowers } from "@/components/openclaw/useOpenClawPowers";
import { ComposerModeToggle } from "./sajtagent/ComposerModeToggle";
import { useSajtagent } from "./sajtagent/SajtagentProvider";
import { SajtagentAvatar } from "./sajtagent/SajtagentAvatar";
import type { AuditComposerToken } from "@/lib/builder/audit-handoff";
import { builderModeToggleClassName } from "@/lib/builder/icon-language";
import { VoiceRecorder } from "@/components/forms/voice-recorder";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { type PromptSourceMeta } from "@/lib/builder/prompt-builder";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";
import { buildInspectPointsPrompt } from "@/lib/builder/focus-point-prompt";
import {
  FIGMA_PREVIEW_NOT_CONFIGURED,
  type FigmaPreviewResponse,
} from "@/lib/api/figma-preview-contract";
import {
  isOpenClawPreparedSend,
  resolveOpenClawPreparedPromptSource,
  type OpenClawPreparedPromptSource,
} from "@/lib/openclaw/prepared-prompt";
import { readOpenClawPowers, revokeOpenClawBuildConsent, useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import {
  INSPECT_CAPTURE_EVENT,
  type InspectCapturedElement,
  type InspectCaptureEventDetail,
} from "@/lib/builder/inspect-events";
import {
  consumeMatchingPendingBuilderDraft,
  currentBuilderReturnTo,
} from "@/lib/builder/pending-builder-draft";
import { INIT_BRIEF_STATUS_EVENT, type InitBriefStatusDetail } from "@/lib/hooks/useInitBrief";
import {
  FILL_CHAT_INPUT_EVENT,
  type FillChatInputDetail,
} from "@/lib/builder/fill-chat-input";
import { toast } from "sonner";
import type { ModelTier } from "@/lib/validations/chat-schemas";
import { ModelTierSlider } from "./ModelTierSlider";

type MessageOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
  planMode?: boolean;
  promptSourceMeta?: PromptSourceMeta;
  /** OpenClaw prepared-prompt fast lane — see `prepared-prompt.ts`. */
  promptSource?: OpenClawPreparedPromptSource;
};

type InspectPointToken = {
  id: string;
  demoUrl: string;
  capturedUrl?: string;
  xPercent: number;
  yPercent: number;
  viewportWidth: number;
  viewportHeight: number;
  previewDataUrl?: string;
  uploading: boolean;
  uploadError?: string;
  fileId?: string;
  filename?: string;
  pointSummary?: string;
  element?: InspectCapturedElement;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  source?: "worker" | "local";
};

type MediaUploadResponse = {
  success?: boolean;
  media?: {
    id?: string | number;
    url?: string;
    filename?: string;
    mimeType?: string;
    storageType?: string;
  };
  error?: string;
};

function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const parts = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!parts) return null;
  const mimeType = parts[1];
  const base64 = parts[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mimeType });
}

function getExtensionFromDataUrl(dataUrl?: string): string {
  if (!dataUrl) return "png";
  const mime = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || "";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "png";
}

interface ChatInterfaceProps {
  chatId: string | null;
  initialPrompt?: string | null;
  auditHandoff?: AuditComposerToken | null;
  onCreateChat?: (message: string, options?: MessageOptions) => Promise<boolean | void>;
  onSendMessage?: (
    message: string,
    options?: MessageOptions,
  ) => Promise<SendMessageOutcome>;
  isFigmaInputOpen?: boolean;
  onFigmaInputOpenChange?: (open: boolean) => void;
  isBusy?: boolean;
  isPreparingPrompt?: boolean;
  mediaEnabled?: boolean;
  continuePlanMode?: boolean;
  builderAwaitingReply?: boolean;
  /**
   * P19 Steg 3 — basversions-indikator. When the active (selected) version
   * differs from the preferred usable version (`selectPreferredEngineVersion`),
   * the composer shows a badge explaining which base the next follow-up will
   * be sent against. `null` means the user is on the preferred version and no
   * badge is rendered. Never hide this when active is newer-but-rejected —
   * that warning is intentional (false-green if silenced).
   */
  followUpBaseInfo?: {
    baseLabel: string;
    preferredLabel: string;
    /** Active is older than preferred, vs newer/rejected (failed/superseded). */
    kind: "stale-selection" | "rejected-active";
  } | null;
  /**
   * Previewlägena som styrs härifrån: `Lägg till block` och
   * `Inspektera preview`. Lägena ägs av builderskalet (ömsesidigt uteslutande),
   * chatpanelen renderar bara knapparna. `null` = ingen preview att styra.
   */
  previewModes?: {
    composerOpen: boolean;
    onToggleComposer: () => void;
    composerDisabled?: boolean;
    inspectAvailable: boolean;
    inspectOpen: boolean;
    onToggleInspect: () => void;
    inspectDisabled?: boolean;
  } | null;
  selectedModelTier?: ModelTier;
  onSelectedModelTierChange?: (tier: ModelTier) => void;
}

const IMAGE_EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function normalizeDesignUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(".")) return `https://${trimmed}`;
  return trimmed;
}

function getImageAttachmentFromUrl(url: string): V0UserFileAttachment | null {
  if (!url) return null;
  const match = url.toLowerCase().match(/\.(png|jpe?g|webp|gif|svg)(?:\?|#|$)/);
  if (!match) return null;
  const ext = match[1];
  const mimeType = IMAGE_EXTENSION_MIME[ext];
  const normalizedExt = ext === "jpg" ? "jpeg" : ext;

  return {
    type: "user_file",
    url,
    filename: `reference.${normalizedExt}`,
    mimeType,
  };
}

function isFigmaUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "figma.com" || hostname.endsWith(".figma.com");
  } catch {
    return false;
  }
}

/**
 * Läget gäller per chatt (UX-05, 2026-11-11). Förut sparades det globalt, så
 * ett Bygg-val följde med till nästa projekt och gjorde en fråga där till ett
 * betalande bygge. En ny chatt, eller ingen chatt alls, börjar alltid i Auto.
 */
const COMPOSER_MODE_STORAGE_PREFIX = "sajtmaskin:composerMode:";
/** Den globala nyckeln före 2026-11-11. Rensas så ett gammalt Bygg inte lever kvar. */
const LEGACY_COMPOSER_MODE_STORAGE_KEY = "sajtmaskin:composerMode";

function readStoredComposerMode(chatId: string | null): ComposerMode {
  if (!chatId || typeof window === "undefined") return "auto";
  try {
    sessionStorage.removeItem(LEGACY_COMPOSER_MODE_STORAGE_KEY);
    const stored = sessionStorage.getItem(`${COMPOSER_MODE_STORAGE_PREFIX}${chatId}`);
    return isComposerMode(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

function storeComposerMode(chatId: string | null, mode: ComposerMode): void {
  if (!chatId || typeof window === "undefined") return;
  try {
    const key = `${COMPOSER_MODE_STORAGE_PREFIX}${chatId}`;
    if (mode === "auto") sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, mode);
  } catch {
    // ignore storage errors
  }
}

const ROUTE_TONE_STYLE: Record<ComposerRouteTone, { icon: LucideIcon; text: string; iconClass: string }> = {
  neutral: { icon: Sparkles, text: "text-muted-foreground", iconClass: "text-muted-foreground" },
  agent: { icon: Bot, text: "text-foreground", iconClass: "text-brand-teal" },
  build: { icon: Hammer, text: "text-foreground", iconClass: "text-primary" },
  blocked: { icon: AlertCircle, text: "text-amber-600 dark:text-amber-300", iconClass: "" },
};

export function ChatInterface({
  chatId,
  initialPrompt,
  auditHandoff = null,
  onCreateChat,
  onSendMessage,
  isFigmaInputOpen: controlledFigmaInputOpen,
  onFigmaInputOpenChange,
  isBusy,
  isPreparingPrompt = false,
  mediaEnabled = false,
  continuePlanMode = false,
  builderAwaitingReply = false,
  followUpBaseInfo,
  previewModes,
  selectedModelTier,
  onSelectedModelTierChange,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const activeComposerChatRef = useRef(chatId);
  activeComposerChatRef.current = chatId;
  const [isSending, setIsSending] = useState(false);
  const [promptAssistBusy, setPromptAssistBusy] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [internalFigmaInputOpen, setInternalFigmaInputOpen] = useState(false);
  const [isTextUploaderOpen, setIsTextUploaderOpen] = useState(false);
  const [figmaPreviewUrl, setFigmaPreviewUrl] = useState<string | null>(null);
  const [figmaPreviewName, setFigmaPreviewName] = useState<string | null>(null);
  const [figmaPreviewError, setFigmaPreviewError] = useState<string | null>(null);
  const [figmaPreviewLoading, setFigmaPreviewLoading] = useState(false);
  /** Server has no Figma token — expected state, not an error the user can fix. */
  const [figmaPreviewUnavailable, setFigmaPreviewUnavailable] = useState(false);
  const [inspectPoints, setInspectPoints] = useState<InspectPointToken[]>([]);
  const isFigmaInputOpen = controlledFigmaInputOpen ?? internalFigmaInputOpen;
  const setFigmaInputOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(isFigmaInputOpen) : next;
      if (onFigmaInputOpenChange) {
        onFigmaInputOpenChange(resolved);
        return;
      }
      setInternalFigmaInputOpen(resolved);
    },
    [isFigmaInputOpen, onFigmaInputOpenChange],
  );

  const hasUploading = files.some((file) => file.status === "uploading");
  const hasSuccessFiles = files.some((file) => file.status === "success");

  // En chatt (plan 2026-10-22): samma input når både byggmotorn och
  // Sajtagenten. Agenten finns bara med en provider (buildern) och en
  // befintlig chatt; utan den är allt som förut.
  const agent = useSajtagent();
  const agentAvailable = Boolean(agent?.available && chatId);
  const agentConfigured = Boolean(agent?.configured ?? agent?.available);
  const agentStreaming = Boolean(agent?.isStreaming);
  // Oklar text går till agenten bara när den själv kan starta bygget
  // (`start_build` kräver armerad autonomi); annars är byggmotorn närmast.
  const agentCanBuild = useOpenClawPowers().armedAutonomy;
  // Läget bär sin chatt: under renderingen där chatId just bytts är läget
  // redan Auto, innan effekten hunnit läsa den nya chattens sparade val.
  const [modeState, setModeState] = useState<{ chatId: string | null; mode: ComposerMode }>(
    () => ({ chatId, mode: "auto" }),
  );
  useEffect(() => {
    setModeState({ chatId, mode: readStoredComposerMode(chatId) });
  }, [chatId]);
  const composerMode: ComposerMode = modeState.chatId === chatId ? modeState.mode : "auto";
  const handleComposerModeChange = useCallback(
    (mode: ComposerMode) => {
      setModeState({ chatId, mode });
      storeComposerMode(chatId, mode);
    },
    [chatId],
  );
  const routeLabelId = useId();
  const toolsRowId = useId();
  // Sekundära verktyg (Plan, Förbättra texten, block, inspektion, media,
  // röst, modell) ligger i EN rad bakom «Verktyg» (UX-granskningen
  // 2026-11-11, C2). Raden döljs men avmonteras inte, så en pågående
  // röstinspelning eller ett modellval överlever att den fälls ihop.
  const [toolsOpen, setToolsOpen] = useState(false);
  const previewModeActive = Boolean(previewModes?.composerOpen || previewModes?.inspectOpen);
  // Block och inspektion styrs bara härifrån. Slås ett läge på visas raden,
  // så läget och knappen som stänger det syns.
  useEffect(() => {
    if (previewModeActive) setToolsOpen(true);
  }, [previewModeActive]);

  // Medan ett bygge pågår är byggmotorn låst, men en fråga till Sajtagenten
  // («vad händer nu?») ska fortfarande gå att ställa. Inputen hålls därför
  // öppen när agenten finns; byggvägen spärras i handleSubmit i stället.
  const builderLocked = Boolean(isBusy);
  const inputDisabled = isSending || promptAssistBusy || (builderLocked && !agentConfigured);
  const submitDisabled = inputDisabled || hasUploading;
  const showPreparingPrompt = Boolean(isPreparingPrompt);

  // N4/A2: Deep Brief-statusen ("Skapar brief...", "Brief klar...") kommer
  // som ett window-event från useInitBrief.ts — den körs innan chatten (och
  // därmed AgentLogCard) ens finns, så den kan inte gå via chat-state/props.
  // Faller tillbaka till den generiska texten nedan om inget event hunnit
  // komma (t.ex. prompt-assist av).
  const [initBriefStatus, setInitBriefStatus] = useState<string | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<InitBriefStatusDetail>).detail;
      setInitBriefStatus(typeof detail?.status === "string" ? detail.status : null);
    };
    window.addEventListener(INIT_BRIEF_STATUS_EVENT, handler as EventListener);
    return () => window.removeEventListener(INIT_BRIEF_STATUS_EVENT, handler as EventListener);
  }, []);
  useEffect(() => {
    const handler = (event: Event) => {
      const text = (event as CustomEvent<FillChatInputDetail>).detail?.text;
      if (typeof text === "string" && text.trim()) setInput(text);
    };
    window.addEventListener(FILL_CHAT_INPUT_EVENT, handler as EventListener);
    return () => window.removeEventListener(FILL_CHAT_INPUT_EVENT, handler as EventListener);
  }, []);
  useEffect(() => {
    if (!isPreparingPrompt) setInitBriefStatus(null);
  }, [isPreparingPrompt]);

  const handleInputChange = (value: string) => {
    setInput(value);
  };

  const prefilledPromptRef = useRef<string | null>(null);
  const lastChatIdRef = useRef<string | null>(chatId);
  const restoredOauthDraftRef = useRef(false);
  useEffect(() => {
    if (chatId) return;
    if (auditHandoff) return;
    if (!initialPrompt) return;
    if (prefilledPromptRef.current === initialPrompt) return;
    if (input.trim()) return;
    setInput(initialPrompt);
    prefilledPromptRef.current = initialPrompt;
  }, [chatId, initialPrompt, input, auditHandoff]);

  useEffect(() => {
    if (restoredOauthDraftRef.current) return;
    restoredOauthDraftRef.current = true;
    const draft = consumeMatchingPendingBuilderDraft(currentBuilderReturnTo());
    if (!draft) return;
    setInput(draft.text);
    if (draft.attachmentUrls.length > 0) {
      setFiles(
        draft.attachmentUrls.map((url, index) => ({
          id: `oauth-restored-${index}`,
          url,
          filename: url.split("/").pop()?.split("?")[0] || "bilaga",
          mimeType: "application/octet-stream",
          size: 0,
          status: "success" as const,
          isPublicUrl: true,
        })),
      );
    }
  }, []);

  useEffect(() => {
    const prevChatId = lastChatIdRef.current;
    if (!prevChatId && chatId) {
      setInput("");
      setFiles([]);
      setFigmaUrl("");
      setFigmaInputOpen(false);
      setInspectPoints([]);
    }
    lastChatIdRef.current = chatId;
  }, [chatId, setFigmaInputOpen]);

  const normalizedFigmaUrl = useMemo(() => normalizeDesignUrl(figmaUrl), [figmaUrl]);

  useEffect(() => {
    if (!normalizedFigmaUrl || !isFigmaUrl(normalizedFigmaUrl)) {
      setFigmaPreviewUrl(null);
      setFigmaPreviewName(null);
      setFigmaPreviewError(null);
      setFigmaPreviewLoading(false);
      setFigmaPreviewUnavailable(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    const debounceId = window.setTimeout(async () => {
      setFigmaPreviewLoading(true);
      setFigmaPreviewError(null);
      setFigmaPreviewUnavailable(false);

      try {
        const response = await fetch("/api/figma/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: normalizedFigmaUrl }),
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => ({}))) as FigmaPreviewResponse;
        if (!response.ok) {
          if (data?.code === FIGMA_PREVIEW_NOT_CONFIGURED) {
            if (!isActive) return;
            setFigmaPreviewUrl(null);
            setFigmaPreviewName(null);
            setFigmaPreviewUnavailable(true);
            return;
          }
          const message =
            (data && typeof data === "object" && data.error) ||
            `Förhandsbilden kunde inte hämtas (HTTP ${response.status})`;
          throw new Error(String(message));
        }

        const imageUrl = typeof data?.imageUrl === "string" ? data.imageUrl : "";
        if (!imageUrl) {
          throw new Error("Ingen Figma-preview tillgänglig");
        }

        if (!isActive) return;
        setFigmaPreviewUrl(imageUrl);
        setFigmaPreviewName(typeof data?.fileName === "string" ? data.fileName : null);
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setFigmaPreviewUrl(null);
        setFigmaPreviewName(null);
        setFigmaPreviewError(error instanceof Error ? error.message : "Kunde inte hämta preview");
      } finally {
        if (isActive) setFigmaPreviewLoading(false);
      }
    }, 500);

    return () => {
      isActive = false;
      window.clearTimeout(debounceId);
      controller.abort();
    };
  }, [normalizedFigmaUrl]);

  const uploadInspectPreview = useCallback(async (previewDataUrl: string, filename: string) => {
    const file = dataUrlToFile(previewDataUrl, filename);
    if (!file) {
      throw new Error("Ogiltig preview-bild");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("description", "Inspector point preview");
    const response = await fetch("/api/media/upload", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json().catch(() => null)) as MediaUploadResponse | null;

    if (!response.ok || !result?.success || !result.media?.url) {
      throw new Error(result?.error || "Kunde inte ladda upp inspector-bild");
    }

    return { media: result.media, file };
  }, []);

  const handleRemoveInspectPoint = useCallback((pointId: string) => {
    setInspectPoints((prevPoints) => {
      const target = prevPoints.find((point) => point.id === pointId);
      if (target?.fileId) {
        setFiles((prevFiles) => prevFiles.filter((file) => file.id !== target.fileId));
      }
      return prevPoints.filter((point) => point.id !== pointId);
    });
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<InspectCaptureEventDetail>).detail;
      if (!detail?.id || !detail.demoUrl) return;

      const pointId = detail.id;
      const fileName = `inspect-${Math.round(detail.xPercent)}-${Math.round(detail.yPercent)}.${getExtensionFromDataUrl(detail.previewDataUrl)}`;

      setInspectPoints((prevPoints) => {
        if (prevPoints.some((point) => point.id === pointId)) return prevPoints;
        const nextPoint: InspectPointToken = {
          id: pointId,
          demoUrl: detail.demoUrl,
          capturedUrl: detail.capturedUrl,
          xPercent: detail.xPercent,
          yPercent: detail.yPercent,
          viewportWidth: detail.viewportWidth,
          viewportHeight: detail.viewportHeight,
          previewDataUrl: detail.previewDataUrl,
          pointSummary: detail.pointSummary,
          element: detail.element,
          clip: detail.clip,
          source: detail.source,
          uploading: Boolean(detail.previewDataUrl),
          uploadError: detail.error,
        };
        return [nextPoint, ...prevPoints].slice(0, 8);
      });

      if (detail.error) {
        toast.error("Punkt tillagd utan preview-bild.");
        return;
      }
      const previewDataUrl = detail.previewDataUrl;
      if (!previewDataUrl) return;

      void (async () => {
        try {
          const { media, file } = await uploadInspectPreview(previewDataUrl, fileName);
          const uploadedId = String(media.id || `inspect-upload-${Date.now()}`);
          const uploadedFile: UploadedFile = {
            id: uploadedId,
            url: media.url || "",
            filename: file.name,
            mimeType: media.mimeType || file.type || "image/jpeg",
            size: file.size,
            status: "success",
            purpose: `inspect point x=${detail.xPercent.toFixed(1)} y=${detail.yPercent.toFixed(1)}${
              detail.element?.nearestHeading ? ` heading=${detail.element.nearestHeading}` : ""
            }`,
            isPublicUrl:
              media.storageType === "blob" || (media.url || "").includes("blob.vercel-storage.com"),
          };

          setFiles((prevFiles) => {
            if (
              prevFiles.some((entry) => entry.id === uploadedId) ||
              prevFiles.some((entry) => entry.url === uploadedFile.url)
            ) {
              return prevFiles;
            }
            return [uploadedFile, ...prevFiles];
          });

          setInspectPoints((prevPoints) =>
            prevPoints.map((point) =>
              point.id === pointId
                ? {
                    ...point,
                    uploading: false,
                    uploadError: undefined,
                    fileId: uploadedId,
                    filename: uploadedFile.filename,
                  }
                : point,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Kunde inte ladda upp punktbild";
          setInspectPoints((prevPoints) =>
            prevPoints.map((point) =>
              point.id === pointId
                ? {
                    ...point,
                    uploading: false,
                    uploadError: message,
                  }
                : point,
            ),
          );
          toast.error("Punkt tillagd utan bilaga (uppladdning misslyckades).");
        }
      })();
    };

    window.addEventListener(INSPECT_CAPTURE_EVENT, handler as EventListener);
    return () => window.removeEventListener(INSPECT_CAPTURE_EVENT, handler as EventListener);
  }, [uploadInspectPreview]);

  // (Prompt-prefill-lyssnaren togs bort 2026-07-31: Byggval-reglagen går
  // strukturerat via INIT_BUILD_CHOICES_EVENT → useCreateChat och skriver
  // aldrig i chattens input; exempel-chipsen försvann med #673.)

  const handlePlanRequest = async () => {
    if (inputDisabled) return;
    const current = input.trim();
    if (!current) {
      toast.error("Skriv en kort beskrivning innan du skapar en plan.");
      return;
    }

    await sendMessagePayload(current, { clearDraft: false, planMode: true });
  };

  const handlePromptAssist = async () => {
    if (inputDisabled || promptAssistBusy) return;
    const current = input.trim();
    if (!current) {
      toast.error("Skriv något att rätta först.");
      return;
    }

    setPromptAssistBusy(true);
    try {
      const response = await fetch("/api/ai/prompt-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: current }),
      });
      const payload = (await response.json().catch(() => null)) as { text?: unknown } | null;
      if (!response.ok || typeof payload?.text !== "string" || !payload.text.trim()) {
        toast.error("Kunde inte rätta utkastet. Försök igen.");
        return;
      }
      const rewritten = payload.text.trim();
      setInput((prev) => (prev.trim() === current ? rewritten : prev));
    } catch {
      toast.error("Kunde inte rätta utkastet. Försök igen.");
    } finally {
      setPromptAssistBusy(false);
    }
  };

  const resolveFigmaAttachment = async (
    figmaLink: string,
  ): Promise<V0UserFileAttachment | null> => {
    if (!figmaLink) return null;
    const directImage = getImageAttachmentFromUrl(figmaLink);
    if (directImage) return directImage;
    if (!isFigmaUrl(figmaLink)) return null;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch("/api/figma/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: figmaLink }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      const imageUrl = typeof data?.imageUrl === "string" ? data.imageUrl : "";
      if (!imageUrl) return null;

      const fileNameRaw = typeof data?.fileName === "string" ? data.fileName : "";
      const safeFileName =
        fileNameRaw
          .replace(/[^a-z0-9-_]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || "figma-preview";

      return {
        type: "user_file",
        url: imageUrl,
        filename: `${safeFileName}.png`,
        mimeType: "image/png",
        purpose: "figma-reference",
      };
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const buildMessagePayload = async (baseMessage: string) => {
    const figmaLink = normalizedFigmaUrl;
    const inspectPointsPrompt = buildInspectPointsPrompt(inspectPoints);
    const contextBlocks = [
      figmaLink ? `Use this Figma design as a reference: ${figmaLink}` : "",
      inspectPointsPrompt,
    ].filter(Boolean);
    const finalMessage = contextBlocks.length
      ? `${baseMessage}\n\n${contextBlocks.join("\n\n")}`
      : baseMessage;
    const fileAttachments = hasSuccessFiles ? filesToAttachments(files) : [];
    const figmaAttachment = await resolveFigmaAttachment(figmaLink);
    const attachments =
      figmaAttachment &&
      !fileAttachments.some((attachment) => attachment.url === figmaAttachment.url)
        ? [...fileAttachments, figmaAttachment]
        : fileAttachments;
    const finalAttachments = attachments.length ? attachments : undefined;
    const attachmentPrompt = hasSuccessFiles ? filesToPromptText(files) : "";

    return { finalMessage, finalAttachments, attachmentPrompt };
  };

  const sendMessagePayload = async (
    baseMessage: string,
    options: { clearDraft?: boolean; planMode?: boolean; promptSourceMeta?: PromptSourceMeta } = {},
  ) => {
    // Inputen hålls öppen under ett bygge för Sajtagentens skull; byggvägen
    // (plan, textuppladdning, vanligt utskick) väntar tills turen är klar.
    if (builderLocked) {
      toast("Ett bygge pågår. Vänta tills det är klart.");
      return;
    }
    setIsSending(true);
    try {
      const payload = await buildMessagePayload(baseMessage);
      if (!payload.finalMessage.trim()) return;
      // OpenClaw prepared-prompt fast lane: tag a follow-up send whose FINAL
      // message is exactly what OpenClaw filled into this composer (a power
      // granted, no user edits, no appended Figma/inspect blocks or
      // attachments). Init sends never tag — the lane only skips the follow-up
      // delta-brief.
      const openClawState = useOpenClawStore.getState();
      const openClawPromptSource = chatId
        ? resolveOpenClawPreparedPromptSource({
            editEnabled: readOpenClawPowers().any,
            preparedFill: openClawState.preparedFill,
            message: payload.finalMessage,
            hasAttachments: Boolean(payload.finalAttachments?.length),
            attachmentPrompt: payload.attachmentPrompt,
          })
        : null;
      const msgOpts: MessageOptions = {
        attachments: payload.finalAttachments,
        attachmentPrompt: payload.attachmentPrompt,
        planMode: options.planMode,
        promptSourceMeta: options.promptSourceMeta,
        promptSource: openClawPromptSource ?? undefined,
      };
      if (!chatId) {
        if (!onCreateChat) return;
        const created = await onCreateChat(payload.finalMessage, msgOpts);
        if (created === false) return;
      } else {
        if (!onSendMessage) return;
        const outcome = await onSendMessage(payload.finalMessage, msgOpts);
        // Utfallskontraktet (BB#shadcn-lane1): en avvisad tur som servern INTE
        // skrev ner (`turnRecorded: false` — 409 stale base, 412 tier-3-env)
        // finns bara här, så utkastet inklusive bilagor, Figma-länk och
        // inspect-punkter måste ligga kvar. Förut rensades allt eftersom
        // sändvägen resolvade utan kast. Skrev servern ner turen ligger prompten
        // i tråden i stället och utkastet rensas — annars finns den på två
        // ställen och ett omsänd kan dubblera turen (bugbot på #610).
        if (outcome.status === "rejected" && !outcome.turnRecorded) return;
      }
      // The fill was consumed by THIS send (tagged or not) — drop the marker
      // unconditionally so a later send can't inherit it. Deliberately outside
      // the clearDraft-branch (Bugbot): plan-läge skickar med clearDraft:false,
      // och markören fick inte överleva dit — ett senare codegen-utskick med
      // samma text ska ta normalvägen, inte ärva taggen.
      if (openClawState.preparedFill) {
        useOpenClawStore.getState().setPreparedFill(null);
      }
      if (options.clearDraft !== false) {
        setInput("");
        setFiles([]);
        setFigmaUrl("");
        setFigmaInputOpen(false);
        setInspectPoints([]);
      }
    } finally {
      setIsSending(false);
    }
  };

  const hasComposerAttachments =
    hasSuccessFiles || Boolean(normalizedFigmaUrl) || inspectPoints.length > 0;

  const resolveDecisionFor = (text: string): ComposerDecision => {
    // Prepared build instructions keep their route; a field marker cannot
    // override a question, explicit read-only request or unresolved reference.
    if (
      composerMode !== "agent" &&
      classifyComposerIntent(text) !== "agent" &&
      !isReadOnlyComposerRequest(text) &&
      !isAgentProposalReference(text) &&
      isOpenClawPreparedSend({
        preparedFill: useOpenClawStore.getState().preparedFill,
        message: text,
      })
    ) {
      return { route: "build" };
    }
    return resolveComposerDecision({
      mode: composerMode,
      text,
      hasChat: Boolean(chatId),
      hasAttachments: hasComposerAttachments,
      agentAvailable,
      agentConfigured,
      agentCanBuild,
      builderAwaitingReply: builderAwaitingReply || continuePlanMode,
    });
  };
  const composerAttachmentKinds: ComposerAttachmentKind[] = [
    ...(hasSuccessFiles ? (["file"] as const) : []),
    ...(normalizedFigmaUrl ? (["figma"] as const) : []),
    ...(inspectPoints.length > 0 ? (["inspect"] as const) : []),
  ];
  const describeDecision = (decision: ComposerDecision, emptyDraft = false) =>
    describeComposerDecision(decision, {
      mode: composerMode,
      hasChat: Boolean(chatId),
      builderLocked,
      emptyDraft,
      attachmentKinds: composerAttachmentKinds,
    });

  const handleSubmit = async ({ text }: { text: string }) => {
    if (submitDisabled) return;
    const trimmed = text.trim();
    const hasAuditToken = Boolean(auditHandoff && !chatId);
    if (!trimmed && !hasSuccessFiles && !hasAuditToken) return;

    const restrictBuild = composerMode === "agent" || isReadOnlyComposerRequest(trimmed);
    if (restrictBuild || hasScopedComposerChangeRestriction(trimmed)) revokeOpenClawBuildConsent();
    const decision = resolveDecisionFor(trimmed);
    const route = decision.route;
    if (route === "blocked") {
      // Samma text som etiketten vid Skicka: vad som hände och vad man kan göra.
      toast(`${describeDecision(decision).hint} Utkastet finns kvar.`);
      return;
    }
    if (trimmed && agent && route === "agent") {
      if (agentStreaming) {
        toast("Sajtagenten svarar fortfarande — vänta en stund.");
        return;
      }
      let proposalReference: AgentProposalReference | undefined;
      if (isAgentProposalReference(trimmed)) {
        const target = readActiveBuilderTarget();
        const resolution = resolveAgentProposalReference({
          text: trimmed,
          messages: useOpenClawStore.getState().messages,
          target: target?.chatId === chatId ? target : null,
        });
        if (resolution.kind === "clarify") {
          toast(resolution.message);
          return;
        }
        proposalReference = resolution.reference;
      }
      const sendingChatId = chatId;
      void agent.send(trimmed, {
        allowBuild: composerAllowsAgentBuild({ mode: composerMode, text: trimmed }),
        restrictBuild,
        proposalReference,
        onDispatchAccepted: () => {
          if (activeComposerChatRef.current === sendingChatId) {
            setInput((current) => current.trim() === trimmed ? "" : current);
          }
        },
      }).catch(() => toast("Sajtagenten kunde inte ta emot frågan. Ditt utkast finns kvar."));
      return;
    }
    if (builderLocked) {
      toast("Ett bygge pågår. Vänta tills det är klart, eller ställ en fråga till Sajtagenten.");
      return;
    }
    const baseMessage =
      trimmed ||
      (hasAuditToken
        ? initialPrompt ||
          (auditHandoff?.domain
            ? `Bygg en förbättrad sajt för ${auditHandoff.domain}`
            : "Bygg en förbättrad sajt utifrån audit")
        : "Use the attached files as visual references for the design.");
    await sendMessagePayload(baseMessage, {
      planMode: continuePlanMode || undefined,
    });
  };

  const handleTextContentReady = async (content: string, filename: string) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    const baseMessage = `Use the following content from "${filename}" as source text:\n\n${trimmedContent}`;
    await sendMessagePayload(baseMessage);
  };

  const handleMediaSelect = (item: {
    id: string;
    url: string;
    filename?: string;
    mimeType?: string;
  }) => {
    setFiles((prev) => {
      if (prev.some((f) => f.url === item.url || f.id === item.id)) {
        return prev;
      }
      return [
        {
          id: item.id,
          url: item.url,
          filename: item.filename || item.url.split("/").pop() || "media",
          mimeType: item.mimeType || "application/octet-stream",
          size: 0,
          status: "success",
          isPublicUrl: true,
        },
        ...prev,
      ];
    });
  };

  const routeDescription = describeDecision(
    resolveDecisionFor(input.trim()),
    !input.trim() && !hasComposerAttachments,
  );
  const routeStyle = ROUTE_TONE_STYLE[routeDescription.tone];
  const RouteIcon = routeStyle.icon;
  const showModeToggle = agentConfigured || Boolean(chatId);
  const disabledComposerModes: ComposerMode[] = [
    ...(builderLocked ? (["build"] as const) : []),
    ...(agentConfigured ? [] : (["agent"] as const)),
  ];

  return (
    <div className="border-border bg-background border-t p-4">
      {agentAvailable ? <SajtagentAvatar key={chatId} /> : null}
      {followUpBaseInfo && (
        // P19 Steg 3 — basversions-indikator. The composer sends the next
        // follow-up against the currently active version (see
        // `useSendMessage.ts` — `engineBaseVersionId` is populated from
        // `activeVersionId`). Surface that so the user never assumes they
        // are on the preferred usable base. Uses amber since this is an
        // "attention" state, not an error state.
        <div
          role="status"
          aria-live="polite"
          data-testid="followup-base-badge"
          className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"
        >
          <Layers className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          {followUpBaseInfo.kind === "rejected-active" ? (
            <p>
              Du redigerar <span className="font-semibold">{followUpBaseInfo.baseLabel}</span>, som inte
              gick att bygga. Nästa meddelande bygger på {followUpBaseInfo.baseLabel} — växla till{" "}
              <span className="font-semibold">{followUpBaseInfo.preferredLabel}</span> om du vill utgå
              från den senaste som fungerade.
            </p>
          ) : (
            <p>
              Du redigerar <span className="font-semibold">{followUpBaseInfo.baseLabel}</span>. Det finns
              en nyare fungerande version (
              <span className="font-semibold">{followUpBaseInfo.preferredLabel}</span>
              ). Nästa meddelande bygger på {followUpBaseInfo.baseLabel} — växla om du vill utgå
              därifrån.
            </p>
          )}
        </div>
      )}
      <PromptInput
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        disabled={inputDisabled}
        allowEmptySubmit={Boolean(auditHandoff && !chatId)}
        className="border-border/80 bg-background focus-within:border-brand-blue/50 focus-within:ring-brand-blue/10 overflow-hidden rounded-2xl border shadow-[0_8px_30px_-18px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow] focus-within:ring-2"
      >
        <PromptInputHeader className="flex-col items-stretch gap-2 border-0 px-3 pt-3 pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {showModeToggle ? (
              <ComposerModeToggle
                value={composerMode}
                onChange={handleComposerModeChange}
                disabledModes={disabledComposerModes}
              />
            ) : (
              <p className="text-foreground text-xs font-medium">
                {chatId ? "Fortsätt med din sajt" : "Din idé börjar här"}
              </p>
            )}
            {agentConfigured ? <OpenClawPowersControl /> : null}
          </div>
        </PromptInputHeader>

        {(isFigmaInputOpen || figmaUrl.trim()) && (
          <div className="space-y-2 px-3 pb-2">
            <div className="flex items-center gap-2">
              <Input
                value={figmaUrl}
                onChange={(event) => setFigmaUrl(event.target.value)}
                placeholder="Figma-länk (delningslänk)"
                autoComplete="url"
                disabled={inputDisabled}
                className="h-8 min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setFigmaUrl("");
                  setFigmaInputOpen(false);
                }}
                disabled={inputDisabled}
              >
                Rensa
              </Button>
            </div>
            {figmaPreviewLoading && (
              <div className="text-muted-foreground text-xs">Hämtar Figma-preview...</div>
            )}
            {figmaPreviewError && <div className="text-xs text-red-500">{figmaPreviewError}</div>}
            {figmaPreviewUnavailable && (
              <div className="text-muted-foreground text-[11px]">
                Förhandsbild är inte aktiverad. Länken skickas ändå med som designreferens.
              </div>
            )}
            {figmaPreviewUrl && (
              <div className="border-border bg-muted/30 flex items-center gap-3 rounded-md border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={figmaPreviewUrl}
                  alt={figmaPreviewName || "Förhandsbild från Figma"}
                  className="h-14 w-20 rounded-sm object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-xs">Förhandsbild från Figma</p>
                  {figmaPreviewName && (
                    <p className="text-foreground truncate text-xs">{figmaPreviewName}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(figmaPreviewUrl, "_blank", "noopener,noreferrer")}
                >
                  Öppna
                </Button>
              </div>
            )}
          </div>
        )}
        {!chatId && auditHandoff && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
            <div
              className="border-border bg-muted text-foreground inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium"
              title={auditHandoff.domain ? `Audit: ${auditHandoff.domain}` : "Audit"}
            >
              <Globe className="size-3.5" aria-hidden="true" />
              <span>{auditHandoff.domain || "Audit"}</span>
            </div>
          </div>
        )}
        {inspectPoints.length > 0 && (
          <div className="space-y-1 px-3 pb-2">
            <div className="text-muted-foreground text-[11px]">Markerade punkter från preview</div>
            <div className="flex flex-wrap items-center gap-2">
              {inspectPoints.map((point, index) => (
                <div key={point.id} className="group relative">
                  <button
                    type="button"
                    className="border-border bg-muted text-foreground hover:bg-accent inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[11px] font-semibold"
                    title={`Punkt ${index + 1}: x ${point.xPercent.toFixed(1)}% y ${point.yPercent.toFixed(1)}%`}
                  >
                    {index + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveInspectPoint(point.id)}
                    className="absolute -top-1 -right-1 rounded-full bg-zinc-900 p-0.5 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                    title="Ta bort punkt"
                  >
                    <X className="size-3" />
                  </button>
                  <div className="border-border bg-popover text-popover-foreground pointer-events-none absolute bottom-9 left-0 z-30 hidden w-56 rounded-md border p-2 shadow-lg group-hover:block">
                    <div className="text-xs font-medium">Punkt {index + 1}</div>
                    <div className="text-muted-foreground text-[11px]">
                      x {point.xPercent.toFixed(1)}% • y {point.yPercent.toFixed(1)}%
                    </div>
                    {point.pointSummary && (
                      <div className="text-muted-foreground mt-1 line-clamp-3 text-[11px]">
                        {point.pointSummary}
                      </div>
                    )}
                    {point.element?.nearestHeading && (
                      <div className="text-muted-foreground mt-1 text-[11px]">
                        Rubrik: {point.element.nearestHeading}
                      </div>
                    )}
                    {point.element?.selector && (
                      <div className="mt-1 line-clamp-2 font-mono text-[10px] text-zinc-400">
                        {point.element.selector}
                      </div>
                    )}
                    {point.capturedUrl && point.capturedUrl !== point.demoUrl && (
                      <div className="text-muted-foreground mt-1 line-clamp-2 text-[10px]">
                        URL: {point.capturedUrl}
                      </div>
                    )}
                    {point.previewDataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={point.previewDataUrl}
                        alt={`Förhandsbild, punkt ${index + 1}`}
                        className="mt-1 h-24 w-full rounded object-cover"
                      />
                    )}
                    {point.uploading && (
                      <div className="text-muted-foreground mt-1 text-[11px]">
                        Laddar upp punktbild...
                      </div>
                    )}
                    {point.uploadError && (
                      <div className="mt-1 text-[11px] text-red-500">{point.uploadError}</div>
                    )}
                    {!point.uploading && !point.uploadError && (
                      <div className="text-muted-foreground mt-1 text-[11px]">
                        Lägger med koordinater{point.filename ? ` + ${point.filename}` : ""} i nästa
                        meddelande.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <PromptInputBody className="px-3 pt-3 pb-2">
          <PromptInputTextarea
            data-openclaw-text-target="builder.chat.primary"
            data-openclaw-text-label="Builderns huvudprompt"
            placeholder={
              chatId
                ? agentAvailable
                  ? "Fråga Sajtagenten eller beskriv en ändring... (Enter för att skicka)"
                  : "Skriv en uppdatering... (Enter för att skicka)"
                : "Beskriv vad du vill bygga... (Enter för att skicka)"
            }
            aria-label={chatId ? "Skriv en uppdatering" : "Beskriv vad du vill bygga"}
            autoComplete="off"
            disabled={inputDisabled}
            className="text-foreground placeholder:text-muted-foreground/70 min-h-20 border-0 px-1 py-1 text-[15px] leading-6 shadow-none focus-visible:ring-0 sm:min-h-24"
          />
        </PromptInputBody>
        <PromptInputFooter className="border-border/60 bg-muted/20 flex-col items-stretch gap-2 px-3 py-2.5">
          {showPreparingPrompt && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              {initBriefStatus ?? "Förbereder prompt..."}
            </div>
          )}
          {agentStreaming && agent ? (
            <div
              className="text-muted-foreground flex items-center justify-between gap-2 text-xs"
              data-testid="composer-agent-streaming"
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Sajtagenten svarar…
              </span>
              <button
                type="button"
                onClick={agent.stop}
                className="border-border/70 hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                aria-label="Stoppa Sajtagenten"
              >
                <Square className="size-3" aria-hidden="true" />
                Stoppa
              </button>
            </div>
          ) : null}
          <div
            id={toolsRowId}
            role="group"
            aria-label="Fler verktyg"
            hidden={!toolsOpen}
            className={cn("flex-wrap items-center gap-1.5", toolsOpen ? "flex" : "hidden")}
            data-testid="composer-tools"
          >
            {/* "Avancerat"-popovern togs bort 2026-07-31; sedan 2026-11-11
                ligger Plan och de andra sekundära verktygen i den här raden,
                som «Verktyg» fäller ut. */}
            <button
              type="button"
              onClick={() => void handlePlanRequest()}
              disabled={inputDisabled || builderLocked || !input.trim()}
              className="border-border/70 bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
              title="Gör en plan eller PRD innan kod"
            >
              <FileText className="size-3" />
              Plan
            </button>
            <button
              type="button"
              onClick={() => void handlePromptAssist()}
              disabled={inputDisabled || promptAssistBusy || !input.trim()}
              className="border-border/70 bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
              title="Rätta och strukturera utkastet utan att skicka"
            >
              {promptAssistBusy ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              Förbättra texten
            </button>
            {previewModes ? (
              <>
                <button
                  type="button"
                  onClick={previewModes.onToggleComposer}
                  disabled={previewModes.composerDisabled}
                  aria-pressed={previewModes.composerOpen}
                  aria-label={previewModes.composerOpen ? "Stäng block" : "Lägg till block"}
                  title="Lägg till färdiga block och innehåll i previewen"
                  className={builderModeToggleClassName(previewModes.composerOpen, "violet")}
                >
                  {/* Ikon-only (Del D): av/på bärs av färg + aria-pressed. Öppet
                      läge byter dessutom ikon (Plus → X) så läget syns på en
                      skärmdump utan text. */}
                  {previewModes.composerOpen ? (
                    <X className="size-3" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </button>
                {previewModes.inspectAvailable ? (
                  <button
                    type="button"
                    onClick={previewModes.onToggleInspect}
                    disabled={previewModes.inspectDisabled}
                    aria-pressed={previewModes.inspectOpen}
                    aria-label={
                      previewModes.inspectOpen ? "Sluta inspektera" : "Inspektera preview"
                    }
                    title="Klicka på något i previewen för att ändra text, byta bild, ta bort det eller skicka det till chatten"
                    className={builderModeToggleClassName(previewModes.inspectOpen, "emerald")}
                  >
                    {previewModes.inspectOpen ? (
                      <SearchX className="size-3" />
                    ) : (
                      <Search className="size-3" />
                    )}
                  </button>
                ) : null}
              </>
            ) : null}
            {mediaEnabled && (
              <>
                <button
                  type="button"
                  onClick={() => setIsMediaDrawerOpen(true)}
                  disabled={inputDisabled}
                  className="border-border/70 bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  title="Öppna mediabibliotek"
                >
                  <ImageIcon className="size-3" />
                  Media
                </button>
                <button
                  type="button"
                  onClick={() => setIsTextUploaderOpen(true)}
                  disabled={inputDisabled}
                  className="border-border/70 bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  title="Lägg till text eller PDF"
                >
                  <FileText className="size-3" />
                  Text/PDF
                </button>
              </>
            )}
            <VoiceRecorder
              key={chatId ?? "new-chat"}
              compact
              disabled={inputDisabled}
              onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
            />
            {selectedModelTier && onSelectedModelTierChange ? (
              <ModelTierSlider
                value={selectedModelTier}
                onChange={onSelectedModelTierChange}
                disabled={inputDisabled}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <PromptInputTools className="flex-wrap items-end gap-1.5">
              {mediaEnabled && (
                <FileUploadZone
                  projectId={null}
                  files={files}
                  onFilesChange={setFiles}
                  disabled={inputDisabled}
                  compact
                />
              )}
              <button
                type="button"
                onClick={() => setToolsOpen((open) => !open)}
                aria-expanded={toolsOpen}
                aria-controls={toolsRowId}
                title={
                  previewModeActive && !toolsOpen
                    ? "Ett verktyg är på i förhandsvisningen"
                    : "Plan, Förbättra texten, block, inspektion, media, röst och modell"
                }
                className={cn(
                  "border-border/70 bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring relative inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  toolsOpen && "bg-accent text-foreground",
                )}
              >
                <SlidersHorizontal className="size-3" aria-hidden="true" />
                Verktyg
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform motion-reduce:transition-none",
                    toolsOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
                {previewModeActive && !toolsOpen ? (
                  <span
                    className="bg-primary absolute -top-0.5 -right-0.5 size-2 rounded-full"
                    aria-hidden="true"
                    data-testid="composer-tools-active-dot"
                  />
                ) : null}
              </button>
            </PromptInputTools>
            {/* Etiketten och Skicka hör ihop och bryts aldrig isär (UX-07).
                Etiketten läser samma beslut som utskicket i handleSubmit. */}
            <div className="flex min-w-44 flex-1 items-center justify-end gap-2">
              <div
                id={routeLabelId}
                className={cn("flex min-w-0 flex-col items-end gap-0.5 text-right text-xs", routeStyle.text)}
                data-testid="composer-route-hint"
                data-route-tone={routeDescription.tone}
                aria-live="polite"
                aria-atomic="true"
                title={routeDescription.hint}
              >
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <RouteIcon className={cn("size-3.5 shrink-0", routeStyle.iconClass)} aria-hidden="true" />
                  {routeDescription.label}
                </span>
                {routeDescription.tone === "blocked" ? (
                  <span className="text-muted-foreground font-normal">{routeDescription.hint}</span>
                ) : (
                  <span className="sr-only">{routeDescription.hint}</span>
                )}
              </div>
              {/* Ett blockerat utskick ska se avstängt ut. Enter i textrutan
                  ger fortfarande beskedet om vad man kan göra. */}
              <PromptInputSubmit
                className="focus-visible:ring-brand-blue/50 focus-visible:ring-offset-background size-10 shrink-0 rounded-xl shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                data-openclaw-send-target="builder.chat.primary"
                aria-label="Skicka"
                aria-describedby={routeLabelId}
                disabled={submitDisabled || routeDescription.tone === "blocked"}
              >
                {isSending ? <Loader2 className="size-4 animate-spin" /> : undefined}
              </PromptInputSubmit>
            </div>
          </div>
        </PromptInputFooter>
      </PromptInput>

      {mediaEnabled && (
        <MediaDrawer
          isOpen={isMediaDrawerOpen}
          onClose={() => setIsMediaDrawerOpen(false)}
          onFileSelect={handleMediaSelect}
        />
      )}

      {mediaEnabled && (
        <TextUploader
          isOpen={isTextUploaderOpen}
          onClose={() => setIsTextUploaderOpen(false)}
          onContentReady={handleTextContentReady}
          disabled={inputDisabled}
        />
      )}
    </div>
  );
}
