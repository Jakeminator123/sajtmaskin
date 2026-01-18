"use client";

import {
  PromptInput,
  PromptInputBody,
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
import { FileText, ImageIcon, Loader2 } from "lucide-react";
import { useState } from "react";

type MessageOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
};

interface ChatInterfaceProps {
  chatId: string | null;
  onCreateChat?: (message: string, options?: MessageOptions) => Promise<void>;
  onSendMessage?: (message: string, options?: MessageOptions) => Promise<void>;
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

export function ChatInterface({
  chatId,
  onCreateChat,
  onSendMessage,
  isBusy,
  designSystemMode = false,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [isFigmaInputOpen, setIsFigmaInputOpen] = useState(false);
  const [isTextUploaderOpen, setIsTextUploaderOpen] = useState(false);

  const hasUploading = files.some((file) => file.status === "uploading");
  const hasSuccessFiles = files.some((file) => file.status === "success");
  const inputDisabled = isSending || isBusy;
  const submitDisabled = inputDisabled || hasUploading;

  const buildMessagePayload = (baseMessage: string) => {
    const figmaLink = normalizeDesignUrl(figmaUrl);
    const contextBlocks = [
      designSystemMode ? DESIGN_SYSTEM_HINT : "",
      figmaLink ? `Use this Figma design as a reference: ${figmaLink}` : "",
    ].filter(Boolean);
    const finalMessage = contextBlocks.length
      ? `${baseMessage}\n\n${contextBlocks.join("\n\n")}`
      : baseMessage;
    const fileAttachments = hasSuccessFiles ? filesToAttachments(files) : [];
    const figmaAttachment = getImageAttachmentFromUrl(figmaLink);
    const attachments =
      figmaAttachment &&
      !fileAttachments.some((attachment) => attachment.url === figmaAttachment.url)
        ? [...fileAttachments, figmaAttachment]
        : fileAttachments;
    const finalAttachments = attachments.length ? attachments : undefined;
    const attachmentPrompt = hasSuccessFiles ? filesToPromptText(files) : "";

    return { finalMessage, finalAttachments, attachmentPrompt };
  };

  const sendMessagePayload = async (payload: {
    finalMessage: string;
    finalAttachments?: V0UserFileAttachment[];
    attachmentPrompt: string;
  }) => {
    if (!payload.finalMessage.trim()) return;

    setIsSending(true);
    try {
      if (!chatId) {
        if (!onCreateChat) return;
        await onCreateChat(payload.finalMessage, {
          attachments: payload.finalAttachments,
          attachmentPrompt: payload.attachmentPrompt,
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
    const payload = buildMessagePayload(baseMessage);

    await sendMessagePayload(payload);
  };

  const handleTextContentReady = async (content: string, filename: string) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const baseMessage = `Use the following content from "${filename}" as source text:\n\n${trimmedContent}`;
    const payload = buildMessagePayload(baseMessage);
    await sendMessagePayload(payload);
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
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={inputDisabled}
        className="rounded-lg border border-input bg-background shadow-sm"
      >
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
            <button
              type="button"
              onClick={() => setIsFigmaInputOpen((v) => !v)}
              disabled={inputDisabled}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Lägg till Figma-länk"
            >
              Figma
              {figmaUrl.trim() ? " ✓" : ""}
            </button>
            <span className="text-xs text-muted-foreground">
              Shift+Enter för ny rad
            </span>
            </PromptInputTools>
            <PromptInputSubmit disabled={submitDisabled}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            </PromptInputSubmit>
          </div>
          {(isFigmaInputOpen || figmaUrl.trim()) && (
            <div className="flex items-center gap-2">
              <input
                value={figmaUrl}
                onChange={(event) => setFigmaUrl(event.target.value)}
                placeholder="Figma URL (delningslänk)"
                disabled={inputDisabled}
                className="h-8 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => {
                  setFigmaUrl("");
                  setIsFigmaInputOpen(false);
                }}
                disabled={inputDisabled}
                className="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                Rensa
              </button>
            </div>
          )}
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
