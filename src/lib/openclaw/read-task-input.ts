import type { SelectedSourcePage } from "./source-page";

export interface OpenClawReadTask {
  search?: boolean;
  attachmentIds?: number[];
  source?: SelectedSourcePage;
}

const WEB_ADDRESS_SPAN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu;

export function requestedWebAddresses(text: string): string[] {
  return [...text.matchAll(WEB_ADDRESS_SPAN)].map(([address]) => address);
}

export function isExplicitOpenClawWebSearch(text: string): boolean {
  const intentText = text.replace(WEB_ADDRESS_SPAN, " URL ").trim();
  return /^(?:(?:kan du|vänligen)\s+)?(?:sök(?:a)?(?:\s+(?:efter\s+[^\n!?]{1,350})?)?\s+(?:på|via)\s+(?:webben|internet|nätet)|webbsök|googla)(?:[\s:?!.,]|$)/iu.test(intentText);
}

export function resolveOpenClawReadTask(text: string, task?: OpenClawReadTask): OpenClawReadTask | undefined {
  return isExplicitOpenClawWebSearch(text) ? { ...task, search: true } : task;
}

export function readTaskAttachmentIds(files: ReadonlyArray<{ id: string; status: string; mimeType: string }>): number[] {
  return files.flatMap((file) => {
    const id = Number(file.id.replace(/^media-/, ""));
    return file.status === "success" && Number.isSafeInteger(id) && id > 0 &&
      isReadableTaskAttachment(file.mimeType) ? [id] : [];
  });
}

export function isReadableTaskAttachment(mime: string): boolean {
  return /^(?:image\/(?:jpeg|png|webp|gif)|text\/[\w.+-]+|application\/json)$/i.test(mime);
}
