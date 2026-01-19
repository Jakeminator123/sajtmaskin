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
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  FileUploadZone,
  filesToAttachments,
  filesToPromptText,
  MediaDrawer,
  TextUploader,
  type UploadedFile,
  type V0UserFileAttachment,
} from "@/components/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type MessageOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
  skipPromptAssist?: boolean;
};

type FigmaPreviewResponse = {
  imageUrl?: string;
  fileName?: string;
  error?: string;
};

interface ChatInterfaceProps {
  chatId: string | null;
  onCreateChat?: (message: string, options?: MessageOptions) => Promise<void>;
  onSendMessage?: (message: string, options?: MessageOptions) => Promise<void>;
  onEnhancePrompt?: (message: string) => Promise<string>;
  promptAssistStatus?: string | null;
  isBusy?: boolean;
  designSystemMode?: boolean;
}

const DESIGN_SYSTEM_HINT = `DESIGN SYSTEM MODE:
- Use a consistent design token system (colors, spacing, typography).
- Define CSS variables for core tokens and reuse them across components.
- Create reusable UI primitives (buttons, inputs, cards).
- Keep spacing scale consistent (4/8/12/16/24/32/48).
- Ensure good accessibility and dark-mode compatibility.`;

const IMAGE_EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

type PromptPreset = {
  id: string;
  label: string;
  description: string;
  template: string;
};

const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: "landing",
    label: "Landing Page",
    description: "SaaS/produkt-sida med CTA och social proof",
    template:
      "Build a modern landing page for [brand]. Include hero, features, social proof, pricing, FAQ, and a strong CTA.",
  },
  {
    id: "app",
    label: "Web App",
    description: "App-layout med navigation, tomtillstånd och settings",
    template:
      "Build a web app UI for [use case]. Include navigation, dashboard overview, tables or cards, and a settings page.",
  },
  {
    id: "ecommerce",
    label: "E-handel",
    description: "Produktlistor, produkt-sida och checkout-flöde",
    template:
      "Build an ecommerce storefront for [brand]. Include product listing, product detail, cart, and checkout.",
  },
  {
    id: "redesign",
    label: "Redesign",
    description: "Modernisera UI och förbättra UX",
    template:
      "Redesign the existing UI to feel modern and premium. Improve spacing, typography, and accessibility without changing core content.",
  },
  {
    id: "copy",
    label: "Copy/SEO",
    description: "Förbättra texter och SEO-struktur",
    template:
      "Improve the copywriting and SEO. Rewrite headings, add a clear CTA, and ensure semantic structure and meta content.",
  },
];

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
  onCreateChat,
  onSendMessage,
  onEnhancePrompt,
  promptAssistStatus,
  isBusy,
  designSystemMode = false,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [hasEnhancedDraft, setHasEnhancedDraft] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [isFigmaInputOpen, setIsFigmaInputOpen] = useState(false);
  const [isTextUploaderOpen, setIsTextUploaderOpen] = useState(false);
  const [promptPresetId, setPromptPresetId] = useState<string>("");
  const [figmaPreviewUrl, setFigmaPreviewUrl] = useState<string | null>(null);
  const [figmaPreviewName, setFigmaPreviewName] = useState<string | null>(null);
  const [figmaPreviewError, setFigmaPreviewError] = useState<string | null>(null);
  const [figmaPreviewLoading, setFigmaPreviewLoading] = useState(false);

  const hasUploading = files.some((file) => file.status === "uploading");
  const hasSuccessFiles = files.some((file) => file.status === "success");
  const inputDisabled = isSending || isBusy;
  const submitDisabled = inputDisabled || hasUploading;

  const handleInputChange = (value: string) => {
    setInput(value);
    setHasEnhancedDraft(false);
  };

  const selectedPreset = useMemo(
    () => PROMPT_PRESETS.find((preset) => preset.id === promptPresetId) || null,
    [promptPresetId]
  );

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

  const applyPromptTemplate = (template: string) => {
    setInput((prev) => {
      const base = prev.trim();
      return base ? `${base}\n\n${template}` : template;
    });
    setHasEnhancedDraft(false);
  };

  const applyPromptPreset = () => {
    if (!selectedPreset) return;
    applyPromptTemplate(selectedPreset.template);
  };

  const handleEnhancePrompt = async () => {
    if (!onEnhancePrompt) return;
    const current = input.trim();
    if (!current) return;

    setIsEnhancing(true);
    try {
      const enhanced = await onEnhancePrompt(current);
      if (enhanced.trim()) {
        setInput(enhanced.trim());
        setHasEnhancedDraft(true);
      }
    } finally {
      setIsEnhancing(false);
    }
  };

  const resolveFigmaAttachment = async (
    figmaLink: string
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

  const sendMessagePayload = async (baseMessage: string) => {
    setIsSending(true);
    try {
      const payload = await buildMessagePayload(baseMessage);
      if (!payload.finalMessage.trim()) return;
      if (!chatId) {
        if (!onCreateChat) return;
        await onCreateChat(payload.finalMessage, {
          attachments: payload.finalAttachments,
          attachmentPrompt: payload.attachmentPrompt,
          skipPromptAssist: hasEnhancedDraft,
        });
      } else {
        if (!onSendMessage) return;
        await onSendMessage(payload.finalMessage, {
          attachments: payload.finalAttachments,
          attachmentPrompt: payload.attachmentPrompt,
        });
      }
      setInput("");
      setFiles([]);
      setHasEnhancedDraft(false);
      setFigmaUrl("");
      setIsFigmaInputOpen(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async ({ text }: { text: string }) => {
    if (submitDisabled) return;

    const trimmed = text.trim();
    if (!trimmed && !hasSuccessFiles) return;

    const baseMessage =
      trimmed || "Use the attached files as visual references for the design.";
    await sendMessagePayload(baseMessage);
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
    <div className="border-t border-border bg-background p-4">
      <PromptInput
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        disabled={inputDisabled}
        className="rounded-lg border border-input bg-background shadow-sm"
      >
        <PromptInputHeader className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={promptPresetId} onValueChange={setPromptPresetId}>
              <SelectTrigger className="h-8 w-[180px]" size="sm">
                <SelectValue placeholder="Prompttyp" />
              </SelectTrigger>
              <SelectContent align="start">
                {PROMPT_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={applyPromptPreset}
              disabled={!selectedPreset || inputDisabled}
              title={selectedPreset?.description || "Välj en prompttyp"}
            >
              Infoga mall
            </Button>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {promptAssistStatus && (
              <span className="text-[11px] text-muted-foreground">
                AI-assist: {promptAssistStatus}
              </span>
            )}
            {onEnhancePrompt && promptAssistStatus && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleEnhancePrompt}
                disabled={inputDisabled || isEnhancing || !input.trim()}
                title="Förbättra nuvarande prompt"
              >
                {isEnhancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
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
              Figma{figmaUrl.trim() ? " ✓" : ""}
            </Button>
          </div>
          {selectedPreset && (
            <span className="w-full text-[11px] text-muted-foreground">
              {selectedPreset.description}
            </span>
          )}
        </PromptInputHeader>
        {(isFigmaInputOpen || figmaUrl.trim()) && (
          <div className="px-3 pb-2 space-y-2">
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
              <div className="text-xs text-muted-foreground">Hämtar Figma-preview...</div>
            )}
            {figmaPreviewError && (
              <div className="text-xs text-red-500">{figmaPreviewError}</div>
            )}
            {figmaPreviewUrl && (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={figmaPreviewUrl}
                  alt={figmaPreviewName || "Figma preview"}
                  className="h-14 w-20 rounded-sm object-cover"
                />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Figma preview</p>
                  {figmaPreviewName && (
                    <p className="text-xs text-foreground">{figmaPreviewName}</p>
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
        <div className="px-3 pb-2">
          <Suggestions>
            {PROMPT_PRESETS.map((preset) => (
              <Suggestion
                key={preset.id}
                suggestion={preset.template}
                onClick={(template) => applyPromptTemplate(template)}
                title={preset.description}
              >
                {preset.label}
              </Suggestion>
            ))}
          </Suggestions>
        </div>
        <PromptInputBody>
          <PromptInputTextarea
            placeholder={
              chatId
                ? "Skriv en uppdatering... (Enter för att skicka)"
                : "Beskriv vad du vill bygga... (Enter för att skicka)"
            }
            disabled={inputDisabled}
            className="min-h-[80px] border-0 shadow-none focus-visible:ring-0"
          />
        </PromptInputBody>
        <PromptInputFooter className="flex-col items-stretch gap-2">
          <div className="flex items-center justify-between gap-2">
            <PromptInputTools className="flex flex-wrap items-center gap-2">
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
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                title="Öppna mediabibliotek"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Mediabibliotek
              </button>
              <button
                type="button"
                onClick={() => setIsTextUploaderOpen(true)}
                disabled={inputDisabled}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                title="Lägg till text eller PDF"
              >
                <FileText className="h-3.5 w-3.5" />
                Text/PDF
              </button>
              <span className="text-xs text-muted-foreground">
                Shift+Enter för ny rad
              </span>
            </PromptInputTools>
            <PromptInputSubmit disabled={submitDisabled}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            </PromptInputSubmit>
          </div>
        </PromptInputFooter>
      </PromptInput>

      <MediaDrawer
        isOpen={isMediaDrawerOpen}
        onClose={() => setIsMediaDrawerOpen(false)}
        onFileSelect={handleMediaSelect}
      />

      <TextUploader
        isOpen={isTextUploaderOpen}
        onClose={() => setIsTextUploaderOpen(false)}
        onContentReady={handleTextContentReady}
        disabled={inputDisabled}
      />
    </div>
  );
}
