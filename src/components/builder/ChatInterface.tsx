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
  type UploadedFile,
  type V0UserFileAttachment,
} from "@/components/media";
import { Loader2 } from "lucide-react";
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
}

export function ChatInterface({
  chatId,
  onCreateChat,
  onSendMessage,
  isBusy,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const hasUploading = files.some((file) => file.status === "uploading");
  const hasSuccessFiles = files.some((file) => file.status === "success");
  const inputDisabled = isSending || isBusy;
  const submitDisabled = inputDisabled || hasUploading;

  const handleSubmit = async ({ text }: { text: string }) => {
    if (submitDisabled) return;

    const trimmed = text.trim();
    if (!trimmed && !hasSuccessFiles) return;

    const baseMessage =
      trimmed || "Use the attached files as visual references for the design.";
    const attachments = hasSuccessFiles ? filesToAttachments(files) : undefined;
    const attachmentPrompt = hasSuccessFiles ? filesToPromptText(files) : "";

    setIsSending(true);
    try {
      if (!chatId) {
        if (!onCreateChat) return;
        await onCreateChat(baseMessage, { attachments, attachmentPrompt });
      } else {
        if (!onSendMessage) return;
        await onSendMessage(baseMessage, { attachments, attachmentPrompt });
      }
      setInput("");
      setFiles([]);
    } finally {
      setIsSending(false);
    }
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
        <PromptInputFooter>
          <PromptInputTools>
            <FileUploadZone
              projectId={null}
              files={files}
              onFilesChange={setFiles}
              disabled={inputDisabled}
              compact
            />
            <span className="text-xs text-muted-foreground">
              Shift+Enter för ny rad
            </span>
          </PromptInputTools>
          <PromptInputSubmit disabled={submitDisabled}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
