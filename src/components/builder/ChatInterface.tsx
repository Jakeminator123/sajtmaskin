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
  type ShadcnBlockAction,
  type ShadcnBlockSelection,
  type PlacementOption,
  PLACEMENT_OPTIONS,
} from "@/components/builder/UiElementPicker";
import {
  UnifiedElementPicker,
  type UnifiedPickerTab,
} from "@/components/builder/UnifiedElementPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, ImageIcon, Loader2, Plus, Wand2 } from "lucide-react";
import { VoiceRecorder } from "@/components/forms/voice-recorder";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildAiElementPrompt, type AiElementCatalogItem } from "@/lib/builder/ai-elements-catalog";
import type { PaletteSelection } from "@/lib/builder/palette";
import { buildShadcnBlockPrompt, buildShadcnComponentPrompt } from "@/lib/shadcn-registry-utils";
import {
  DESIGN_THEME_OPTIONS,
  type DesignTheme,
} from "@/lib/builder/theme-presets";
import type { DetectedSection } from "@/lib/builder/sectionAnalyzer";
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
  onStartFromRegistry?: (selection: ShadcnBlockSelection) => Promise<boolean | void>;
  onStartFromTemplate?: (templateId: string) => void;
  onPaletteSelection?: (selection: PaletteSelection) => void;
  paletteSelections?: PaletteSelection[];
  designTheme?: DesignTheme;
  onDesignThemeChange?: (theme: DesignTheme) => void;
  onEnhancePrompt?: (message: string) => Promise<string>;
  isBusy?: boolean;
  isPreparingPrompt?: boolean;
  mediaEnabled?: boolean;
  currentCode?: string;
  existingUiComponents?: string[];
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
  onStartFromTemplate,
  onPaletteSelection,
  paletteSelections,
  designTheme = "blue",
  onDesignThemeChange,
  onEnhancePrompt,
  isBusy,
  isPreparingPrompt = false,
  mediaEnabled = false,
  currentCode,
  existingUiComponents,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [isFigmaInputOpen, setIsFigmaInputOpen] = useState(false);
  const [isTextUploaderOpen, setIsTextUploaderOpen] = useState(false);
  const [isUiElementAction, setIsUiElementAction] = useState(false);
  const [figmaPreviewUrl, setFigmaPreviewUrl] = useState<string | null>(null);
  const [figmaPreviewName, setFigmaPreviewName] = useState<string | null>(null);
  const [figmaPreviewError, setFigmaPreviewError] = useState<string | null>(null);
  const [figmaPreviewLoading, setFigmaPreviewLoading] = useState(false);

  // Single unified picker state replaces 4 separate picker states
  const [pickerTab, setPickerTab] = useState<UnifiedPickerTab | null>(null);

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

  const handlePlanRequest = async () => {
    if (inputDisabled) return;
    const current = input.trim();
    if (!current) {
      toast.error("Skriv en kort beskrivning innan du skapar en plan.");
      return;
    }

    const planPrompt = [
      "Skapa en plan/PRD innan du skriver kod.",
      "Beskriv mål, sidor/sektioner, UI/UX-krav, dataflöden vid behov och risker.",
      "Ställ frågor om något är oklart. Skriv ingen kod ännu.",
      "",
      "Projektbeskrivning:",
      current,
    ].join("\n");

    await sendMessagePayload(planPrompt, { clearDraft: false });
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

  const resolvePlacementLabel = (placement?: PlacementOption) => {
    const placementOption = PLACEMENT_OPTIONS.find((p) => p.value === placement);
    if (placementOption?.label) return placementOption.label;
    if (placement?.startsWith("after-")) {
      const label = placement.replace("after-", "");
      return `Efter ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
    }
    return "Längst ner";
  };

  const handleDesignSystemAction = async (
    selection: ShadcnBlockSelection,
    action: ShadcnBlockAction,
  ) => {
    if (!selection.registryItem) return;

    setIsUiElementAction(true);
    try {
      const isComponent =
        selection.itemType === "component" ||
        selection.registryItem?.type?.toLowerCase().includes("component");

      const technicalPrompt = isComponent
        ? buildShadcnComponentPrompt(selection.registryItem, {
            style: selection.style,
            displayName: selection.block.title,
            description: selection.block.description,
            dependencyItems: selection.dependencyItems,
            placement: selection.placement,
            detectedSections: selection.detectedSections,
            existingUiComponents,
          })
        : buildShadcnBlockPrompt(selection.registryItem, {
            style: selection.style,
            displayName: selection.block.title,
            description: selection.block.description,
            dependencyItems: selection.dependencyItems,
            placement: selection.placement,
            detectedSections: selection.detectedSections,
            existingUiComponents,
          });

      const itemTitle = selection.block.title || selection.registryItem.name;
      const deps = selection.registryItem.registryDependencies?.length
        ? ` (${selection.registryItem.registryDependencies.slice(0, 4).join(", ")}${
            selection.registryItem.registryDependencies.length > 4 ? "..." : ""
          })`
        : "";
      const placementLabel = resolvePlacementLabel(selection.placement);

      const fullMessage = `Lägg till UI‑element (${isComponent ? "komponent" : "block"}): **${itemTitle}**${deps}
📍 Placering: ${placementLabel}

---

${technicalPrompt}`;

      if (action === "start") {
        if (onStartFromRegistry) {
          try {
            const startedDirectly = await onStartFromRegistry(selection);
            if (startedDirectly !== false) {
              setPickerTab(null);
              return;
            }
            toast.error("Kunde inte starta direkt från registry. Fortsätter via fallback-läge.");
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Kunde inte starta direkt från registry";
            toast.error(`${message}. Fortsätter via fallback-läge.`);
          }
        }

        if (!onCreateChat) return;
        await sendMessagePayload(fullMessage, { clearDraft: false });
        onPaletteSelection?.({
          id: selection.registryItem.name || selection.block.name,
          label: itemTitle,
          description: selection.block.description || selection.registryItem.description,
          source: isComponent ? "shadcn-component" : "shadcn-block",
          dependencies: selection.registryItem.registryDependencies ?? undefined,
        });
        setPickerTab(null);
        return;
      }

      if (!onCreateChat && !onSendMessage) return;

      await sendMessagePayload(fullMessage, { clearDraft: false });
      onPaletteSelection?.({
        id: selection.registryItem.name || selection.block.name,
        label: itemTitle,
        description: selection.block.description || selection.registryItem.description,
        source: isComponent ? "shadcn-component" : "shadcn-block",
        dependencies: selection.registryItem.registryDependencies ?? undefined,
      });
      setPickerTab(null);
    } finally {
      setIsUiElementAction(false);
    }
  };

  const handleDesignThemeSelect = useCallback(
    async (theme: DesignTheme) => {
      if (!onDesignThemeChange) return;
      onDesignThemeChange(theme);
      const label =
        DESIGN_THEME_OPTIONS.find((option) => option.value === theme)?.label || theme;
      toast.success(
        theme === "off"
          ? "Tema avstängt."
          : `Tema uppdaterat: ${label}.`,
      );
      setPickerTab(null);
    },
    [onDesignThemeChange],
  );

  const handleAiElementAction = async (
    item: AiElementCatalogItem,
    options: { placement?: PlacementOption; detectedSections?: DetectedSection[] } = {},
  ) => {
    if (!onCreateChat && !onSendMessage) return;

    setIsUiElementAction(true);
    try {
      const placementLabel = resolvePlacementLabel(options.placement);
      const technicalPrompt = buildAiElementPrompt(item, {
        placement: options.placement,
        detectedSections: options.detectedSections,
      });
      const deps = item.dependencies?.length
        ? ` (${item.dependencies.slice(0, 4).join(", ")}${item.dependencies.length > 4 ? "..." : ""})`
        : "";
      const fullMessage = `Lägg till AI‑element: **${item.label}**${deps}
📍 Placering: ${placementLabel}

---

${technicalPrompt}`;

      await sendMessagePayload(fullMessage, { clearDraft: false });
      onPaletteSelection?.({
        id: item.id,
        label: item.label,
        description: item.description,
        source: "ai-element",
        tags: item.tags,
        dependencies: item.dependencies,
      });
      setPickerTab(null);
    } finally {
      setIsUiElementAction(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    if (!onStartFromTemplate) return;
    onStartFromTemplate(templateId);
    setPickerTab(null);
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
          <div className="ml-auto flex items-center gap-2">
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
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Wand2 className="size-3.5" />
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
              className="h-8 gap-2"
              onClick={handlePlanRequest}
              disabled={inputDisabled || !input.trim()}
              title="Skapa plan/PRD innan kod"
            >
              <FileText className="size-3.5" />
              Plan
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={() => setPickerTab("ui")}
              disabled={inputDisabled}
              title="Lägg till element (UI, AI, Mallar, Tema)"
            >
              <Plus className="size-3.5" />
              Lägg till
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
                autoComplete="url"
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
            autoComplete="off"
            disabled={inputDisabled}
            className="min-h-[80px] border-0 shadow-none focus-visible:ring-0"
          />
        </PromptInputBody>
        <PromptInputFooter className="flex-col items-stretch gap-2">
          {showPreparingPrompt && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
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
                    <ImageIcon className="size-3.5" />
                    Mediabibliotek
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTextUploaderOpen(true)}
                    disabled={inputDisabled}
                    className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50"
                    title="Lägg till text eller PDF"
                  >
                    <FileText className="size-3.5" />
                    Text/PDF
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
              <span className="text-muted-foreground text-xs">Shift+Enter för ny rad</span>
            </PromptInputTools>
            <PromptInputSubmit disabled={submitDisabled}>
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

      {pickerTab && (
        <UnifiedElementPicker
          open={Boolean(pickerTab)}
          initialTab={pickerTab}
          onClose={() => setPickerTab(null)}
          onUiConfirm={handleDesignSystemAction}
          onAiConfirm={handleAiElementAction}
          onTemplateSelect={handleTemplateSelect}
          onThemeSelect={handleDesignThemeSelect}
          isBusy={inputDisabled}
          isSubmitting={isUiElementAction}
          hasChat={Boolean(chatId)}
          currentCode={currentCode}
          paletteSelections={paletteSelections}
          currentTheme={designTheme}
          showThemeTab={Boolean(onDesignThemeChange)}
        />
      )}
    </div>
  );
}
