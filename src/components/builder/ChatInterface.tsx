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
  MediaDrawer,
  TextUploader,
  type UploadedFile,
  type V0UserFileAttachment,
} from "@/components/media";
import {
  ShadcnBlockPicker,
  type ShadcnBlockAction,
  type ShadcnBlockSelection,
  PLACEMENT_OPTIONS,
} from "@/components/builder/ShadcnBlockPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Blocks, FileText, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildShadcnBlockPrompt, buildShadcnComponentPrompt } from "@/lib/shadcn-registry-utils";
import { debugLog } from "@/lib/utils/debug";
import toast from "react-hot-toast";

type MessageOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
};

type FigmaPreviewResponse = {
  imageUrl?: string;
  fileName?: string;
  error?: string;
};

interface ChatInterfaceProps {
  chatId: string | null;
  initialPrompt?: string | null;
  onCreateChat?: (message: string, options?: MessageOptions) => Promise<boolean | void>;
  onSendMessage?: (message: string, options?: MessageOptions) => Promise<void>;
  onStartFromRegistry?: (selection: ShadcnBlockSelection) => Promise<void>;
  onEnhancePrompt?: (message: string) => Promise<string>;
  isBusy?: boolean;
  isPreparingPrompt?: boolean;
  designSystemMode?: boolean;
  mediaEnabled?: boolean;
  /** Current generated code for section analysis in component picker */
  currentCode?: string;
}

const DESIGN_SYSTEM_HINT = `DESIGN SYSTEM MODE:
- Use semantic CSS variables for theme tokens (bg/fg, primary, accent).
- Keep token definitions in globals.css or theme config, not hardcoded in components.
- Use cva + cn for variants; keep variants limited and composable.
- Create reusable UI primitives (buttons, inputs, cards) from shadcn/ui.
- Keep spacing scale consistent (4/8/12/16/24/32/48).
- Ensure good accessibility and dark-mode compatibility.

SHADCN/UI REQUIREMENTS:
- Use shadcn/ui components (@/components/ui/*) as the foundation.
- Include cn() from @/lib/utils for class merging.
- Use Radix primitives via shadcn when available.
- Use lucide-react for icons consistently.

VISUAL POLISH:
- Add subtle animations (hover states, transitions, scroll-reveal).
- Use layered backgrounds with gradients or tinted panels, not flat white.
- Include glassmorphism effects (backdrop-blur, bg-opacity) where appropriate.
- Create visual hierarchy with shadows, borders, and spacing.
- Make it feel like a polished app, not a basic template.
- Ensure good accessibility and dark-mode compatibility.`;

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
    return new URL(url).hostname.includes("figma.com");
  } catch {
    return false;
  }
}

export function ChatInterface({
  chatId,
  initialPrompt,
  onCreateChat,
  onSendMessage,
  onStartFromRegistry,
  onEnhancePrompt,
  isBusy,
  isPreparingPrompt = false,
  designSystemMode = false,
  mediaEnabled = false,
  currentCode,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [isFigmaInputOpen, setIsFigmaInputOpen] = useState(false);
  const [isTextUploaderOpen, setIsTextUploaderOpen] = useState(false);
  const [isShadcnPickerOpen, setIsShadcnPickerOpen] = useState(false);
  const [isDesignSystemAction, setIsDesignSystemAction] = useState(false);
  const [figmaPreviewUrl, setFigmaPreviewUrl] = useState<string | null>(null);
  const [figmaPreviewName, setFigmaPreviewName] = useState<string | null>(null);
  const [figmaPreviewError, setFigmaPreviewError] = useState<string | null>(null);
  const [figmaPreviewLoading, setFigmaPreviewLoading] = useState(false);

  const hasUploading = files.some((file) => file.status === "uploading");
  const hasSuccessFiles = files.some((file) => file.status === "success");
  const inputDisabled = isSending || isBusy;
  const submitDisabled = inputDisabled || hasUploading;
  const showPreparingPrompt = Boolean(isPreparingPrompt);

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
      setIsFigmaInputOpen(false);
    }
    lastChatIdRef.current = chatId;
  }, [chatId]);

  const normalizedFigmaUrl = useMemo(() => normalizeDesignUrl(figmaUrl), [figmaUrl]);

  useEffect(() => {
    if (!normalizedFigmaUrl || !isFigmaUrl(normalizedFigmaUrl)) {
      setFigmaPreviewUrl(null);
      setFigmaPreviewName(null);
      setFigmaPreviewError(null);
      setFigmaPreviewLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    const debounceId = window.setTimeout(async () => {
      setFigmaPreviewLoading(true);
      setFigmaPreviewError(null);

      try {
        const response = await fetch("/api/figma/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: normalizedFigmaUrl }),
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => ({}))) as FigmaPreviewResponse;
        if (!response.ok) {
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

  const handleEnhancePrompt = async () => {
    if (!onEnhancePrompt) return;
    const current = input.trim();
    if (!current) return;

    setIsEnhancing(true);
    try {
      const enhanced = await onEnhancePrompt(current);
      const trimmedEnhanced = enhanced.trim();
      if (trimmedEnhanced) {
        setInput(trimmedEnhanced);
        debugLog("AI", "Prompt manually enhanced", { length: trimmedEnhanced.length });
      }
    } catch (error) {
      console.error("Prompt enhance failed:", error);
      toast.error("Kunde inte förbättra prompten just nu.");
    } finally {
      setIsEnhancing(false);
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
      };
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const buildMessagePayload = async (baseMessage: string) => {
    const figmaLink = normalizedFigmaUrl;
    const contextBlocks = [
      designSystemMode ? DESIGN_SYSTEM_HINT : "",
      figmaLink ? `Use this Figma design as a reference: ${figmaLink}` : "",
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
    options: { clearDraft?: boolean } = {},
  ) => {
    setIsSending(true);
    try {
      const payload = await buildMessagePayload(baseMessage);
      if (!payload.finalMessage.trim()) return;
      if (!chatId) {
        if (!onCreateChat) return;
        const created = await onCreateChat(payload.finalMessage, {
          attachments: payload.finalAttachments,
          attachmentPrompt: payload.attachmentPrompt,
        });
        if (created === false) return;
      } else {
        if (!onSendMessage) return;
        await onSendMessage(payload.finalMessage, {
          attachments: payload.finalAttachments,
          attachmentPrompt: payload.attachmentPrompt,
        });
      }
      if (options.clearDraft !== false) {
        setInput("");
        setFiles([]);
        setFigmaUrl("");
        setIsFigmaInputOpen(false);
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
    await sendMessagePayload(baseMessage);
  };

  const handleTextContentReady = async (content: string, filename: string) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const baseMessage = `Use the following content from "${filename}" as source text:\n\n${trimmedContent}`;
    await sendMessagePayload(baseMessage);
  };

  const handleDesignSystemAction = async (
    selection: ShadcnBlockSelection,
    action: ShadcnBlockAction,
  ) => {
    if (!selection.registryItem) return;

    setIsDesignSystemAction(true);
    try {
      if (action === "start") {
        if (!onStartFromRegistry) return;
        await onStartFromRegistry(selection);
        setIsShadcnPickerOpen(false);
        return;
      }

      if (!onCreateChat && !onSendMessage) return;

      const isComponent =
        selection.itemType === "component" ||
        selection.registryItem?.type?.toLowerCase().includes("component");

      // Build the full technical prompt for v0 with placement info
      const technicalPrompt = isComponent
        ? buildShadcnComponentPrompt(selection.registryItem, {
            style: selection.style,
            displayName: selection.block.title,
            description: selection.block.description,
            dependencyItems: selection.dependencyItems,
            placement: selection.placement,
            detectedSections: selection.detectedSections,
          })
        : buildShadcnBlockPrompt(selection.registryItem, {
            style: selection.style,
            displayName: selection.block.title,
            description: selection.block.description,
            dependencyItems: selection.dependencyItems,
            placement: selection.placement,
            detectedSections: selection.detectedSections,
          });

      // Create a user-friendly summary at the start of the message
      const itemTitle = selection.block.title || selection.registryItem.name;
      const deps = selection.registryItem.registryDependencies?.length
        ? ` (${selection.registryItem.registryDependencies.slice(0, 4).join(", ")}${selection.registryItem.registryDependencies.length > 4 ? "..." : ""})`
        : "";

      // Get placement label for user-friendly display
      // Use PLACEMENT_OPTIONS as fallback, but prefer dynamic label from the placement value
      const placementOption = PLACEMENT_OPTIONS.find((p) => p.value === selection.placement);
      const placementLabel =
        placementOption?.label ||
        (selection.placement?.startsWith("after-")
          ? `Efter ${selection.placement.replace("after-", "").charAt(0).toUpperCase() + selection.placement.replace("after-", "").slice(1)}`
          : "Längst ner");

      // Format: Short user summary + technical instructions for v0
      // The UI will show the summary, technical details are collapsible
      const fullMessage = `Lägg till shadcn/ui-${isComponent ? "komponent" : "block"}: **${itemTitle}**${deps}
📍 Placering: ${placementLabel}

---

${technicalPrompt}`;

      await sendMessagePayload(fullMessage, { clearDraft: false });
      setIsShadcnPickerOpen(false);
    } finally {
      setIsDesignSystemAction(false);
    }
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
      <PromptInput
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        disabled={inputDisabled}
        className="border-input bg-background rounded-lg border shadow-sm"
      >
        <PromptInputHeader className="flex flex-wrap items-center gap-2">
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {onEnhancePrompt && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleEnhancePrompt}
                disabled={inputDisabled || isEnhancing || !input.trim()}
                title="Rätta stavning/tydlighet i prompten"
              >
                {isEnhancing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Förbättra
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setIsFigmaInputOpen((v) => !v)}
              disabled={inputDisabled}
              title="Lägg till Figma-länk"
            >
              Figma-länk{figmaUrl.trim() ? " ✓" : ""}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setIsShadcnPickerOpen(true)}
              disabled={inputDisabled}
              title="shadcn/ui-block"
            >
              <Blocks className="h-3.5 w-3.5" />
              shadcn/ui
            </Button>
          </div>
        </PromptInputHeader>
        {(isFigmaInputOpen || figmaUrl.trim()) && (
          <div className="space-y-2 px-3 pb-2">
            <div className="flex items-center gap-2">
              <Input
                value={figmaUrl}
                onChange={(event) => setFigmaUrl(event.target.value)}
                placeholder="Figma URL (delningslänk)"
                disabled={inputDisabled}
                className="h-8"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setFigmaUrl("");
                  setIsFigmaInputOpen(false);
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
            {!figmaPreviewUrl && !figmaPreviewLoading && (
              <div className="text-muted-foreground text-[11px]">
                Kräver FIGMA_ACCESS_TOKEN för preview.
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
                <div className="flex-1">
                  <p className="text-muted-foreground text-xs">Figma preview</p>
                  {figmaPreviewName && (
                    <p className="text-foreground text-xs">{figmaPreviewName}</p>
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
        <PromptInputBody>
          <PromptInputTextarea
            placeholder={
              chatId
                ? "Skriv en uppdatering... (Enter för att skicka)"
                : "Beskriv vad du vill bygga... (Enter för att skicka)"
            }
            aria-label={chatId ? "Skriv en uppdatering" : "Beskriv vad du vill bygga"}
            disabled={inputDisabled}
            className="min-h-[80px] border-0 shadow-none focus-visible:ring-0"
          />
        </PromptInputBody>
        <PromptInputFooter className="flex-col items-stretch gap-2">
          {showPreparingPrompt && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Förbereder prompt...
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <PromptInputTools className="flex flex-wrap items-center gap-2">
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
                    className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50"
                    title="Öppna mediabibliotek"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Mediabibliotek
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTextUploaderOpen(true)}
                    disabled={inputDisabled}
                    className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50"
                    title="Lägg till text eller PDF"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Text/PDF
                  </button>
                </>
              )}
              <span className="text-muted-foreground text-xs">Shift+Enter för ny rad</span>
            </PromptInputTools>
            <PromptInputSubmit disabled={submitDisabled}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
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

      <ShadcnBlockPicker
        open={isShadcnPickerOpen}
        onClose={() => setIsShadcnPickerOpen(false)}
        onConfirm={handleDesignSystemAction}
        isBusy={inputDisabled}
        isSubmitting={isDesignSystemAction}
        hasChat={Boolean(chatId)}
        currentCode={currentCode}
      />
    </div>
  );
}
