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
  FileText,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { builderModeToggleClassName } from "@/lib/builder/icon-language";
import { VoiceRecorder } from "@/components/forms/voice-recorder";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type PromptSourceMeta } from "@/lib/builder/prompt-builder";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";
import { buildInspectPointsPrompt } from "@/lib/builder/focus-point-prompt";
import {
  FIGMA_PREVIEW_NOT_CONFIGURED,
  type FigmaPreviewResponse,
} from "@/lib/api/figma-preview-contract";
import {
  resolveOpenClawPreparedPromptSource,
  type OpenClawPreparedPromptSource,
} from "@/lib/openclaw/prepared-prompt";
import { readOpenClawPowers, useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import {
  INSPECT_CAPTURE_EVENT,
  type InspectCapturedElement,
  type InspectCaptureEventDetail,
} from "@/lib/builder/inspect-events";
import { INIT_BRIEF_STATUS_EVENT, type InitBriefStatusDetail } from "@/lib/hooks/useInitBrief";
import { toast } from "sonner";

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

export function ChatInterface({
  chatId,
  initialPrompt,
  onCreateChat,
  onSendMessage,
  isFigmaInputOpen: controlledFigmaInputOpen,
  onFigmaInputOpenChange,
  isBusy,
  isPreparingPrompt = false,
  mediaEnabled = false,
  continuePlanMode = false,
  followUpBaseInfo,
  previewModes,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
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
  const inputDisabled = isSending || isBusy;
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
    if (!isPreparingPrompt) setInitBriefStatus(null);
  }, [isPreparingPrompt]);

  const handleInputChange = (value: string) => {
    setInput(value);
  };

  const prefilledPromptRef = useRef<string | null>(null);
  const lastChatIdRef = useRef<string | null>(chatId);
  useEffect(() => {
    if (chatId) return;
    if (!initialPrompt) return;
    if (prefilledPromptRef.current === initialPrompt) return;
    if (input.trim()) return;
    setInput(initialPrompt);
    prefilledPromptRef.current = initialPrompt;
  }, [chatId, initialPrompt, input]);

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
            `Preview failed (HTTP ${response.status})`;
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

  const handleSubmit = async ({ text }: { text: string }) => {
    if (submitDisabled) return;
    const trimmed = text.trim();
    if (!trimmed && !hasSuccessFiles) return;
    const baseMessage = trimmed || "Use the attached files as visual references for the design.";
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

  return (
    <div className="border-border bg-background border-t p-4">
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
        className="border-input bg-background rounded-lg border shadow-sm"
      >
        <PromptInputHeader className="flex-col items-stretch gap-2">
          <p className="text-muted-foreground text-[11px] leading-4" suppressHydrationWarning>
            Verktyg
          </p>
          <div className="flex flex-wrap gap-1.5">
            {/* "Avancerat"-popovern togs bort 2026-07-31: efter att
                temaväljaren flyttade till Byggval-reglagen (ägarbeslut,
                se preview-panelens välkomstläge) blev popovern en
                enda-knapps-meny som bara gömde "Plan" bakom ett extra
                klick. Plan renderas nu som en vanlig verktygsknapp,
                samma mönster som de andra Verktyg-radsknapparna nedan. */}
            <button
              type="button"
              onClick={() => void handlePlanRequest()}
              disabled={inputDisabled || !input.trim()}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-800/50 px-2.5 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
              title="Gör en plan eller PRD innan kod"
            >
              <FileText className="size-3" />
              Plan
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
          </div>
        </PromptInputHeader>
        {(isFigmaInputOpen || figmaUrl.trim()) && (
          <div className="space-y-2 px-3 pb-2">
            <div className="flex items-center gap-2">
              <Input
                value={figmaUrl}
                onChange={(event) => setFigmaUrl(event.target.value)}
                placeholder="Figma URL (delningslänk)"
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
                  alt={figmaPreviewName || "Figma preview"}
                  className="h-14 w-20 rounded-sm object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-xs">Figma preview</p>
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
        {inspectPoints.length > 0 && (
          <div className="space-y-1 px-3 pb-2">
            <div className="text-muted-foreground text-[11px]">
              Markerade punkter från preview
            </div>
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
                    className="absolute -top-1 -right-1 rounded-full bg-zinc-900 p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
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
                        alt={`Preview punkt ${index + 1}`}
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
                        Lägger med koordinater{point.filename ? ` + ${point.filename}` : ""} i nästa meddelande.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <PromptInputBody>
          <PromptInputTextarea
            data-openclaw-text-target="builder.chat.primary"
            data-openclaw-text-label="Builderns huvudprompt"
            placeholder={
              chatId
                ? "Skriv en uppdatering... (Enter för att skicka)"
                : "Beskriv vad du vill bygga... (Enter för att skicka)"
            }
            aria-label={chatId ? "Skriv en uppdatering" : "Beskriv vad du vill bygga"}
            autoComplete="off"
            disabled={inputDisabled}
            className="text-foreground min-h-[96px] border-0 text-[15px] shadow-none placeholder:text-zinc-400 focus-visible:ring-0"
          />
        </PromptInputBody>
        <PromptInputFooter className="flex-col items-stretch gap-1.5">
          {showPreparingPrompt && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              {initBriefStatus ?? "Förbereder prompt..."}
            </div>
          )}
          <div className="flex items-end justify-between gap-2">
            <PromptInputTools className="flex flex-wrap items-center gap-1.5">
              {mediaEnabled && (
                <>
                  <FileUploadZone
                    projectId={null}
                    files={files}
                    onFilesChange={setFiles}
                    disabled={inputDisabled}
                    compact
                  />
                  <button
                    type="button"
                    onClick={() => setIsMediaDrawerOpen(true)}
                    disabled={inputDisabled}
                    className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] disabled:opacity-50"
                    title="Öppna mediabibliotek"
                  >
                    <ImageIcon className="size-3" />
                    Media
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTextUploaderOpen(true)}
                    disabled={inputDisabled}
                    className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] disabled:opacity-50"
                    title="Lägg till text eller PDF"
                  >
                    <FileText className="size-3" />
                    Text
                  </button>
                </>
              )}
              <VoiceRecorder
                compact
                disabled={inputDisabled}
                onTranscript={(text) =>
                  setInput((prev) => (prev ? `${prev} ${text}` : text))
                }
              />
            </PromptInputTools>
            <PromptInputSubmit
              data-openclaw-send-target="builder.chat.primary"
              disabled={submitDisabled}
            >
              {isSending ? <Loader2 className="size-4 animate-spin" /> : undefined}
            </PromptInputSubmit>
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
