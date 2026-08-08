import type { ChatAttachment } from "./types";

export function appendAttachmentPrompt(
  message: string,
  attachmentPrompt?: string,
  attachments?: ChatAttachment[],
): string {
  if (attachments && attachments.length > 0) return message;
  if (!attachmentPrompt) return message;
  return `${message}${attachmentPrompt}`.trim();
}
