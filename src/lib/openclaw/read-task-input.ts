import type { SelectedSourcePage } from "./source-page";

export interface OpenClawReadTask {
  search?: boolean;
  reviewCurrentSite?: boolean;
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
  const search = isExplicitOpenClawWebSearch(text);
  const reviewCurrentSite = /^(?:(?:kan du|vänligen)\s+)?(?:hur ser\s+(?:(?:min|vår|den)\s+)?(?:sajt(?:en)?|sida(?:n)?|webbplats(?:en)?|förhandsvisning(?:en)?)\s+ut|(?:granska|bedöm|titta på)\s+(?:utseendet|designen|layouten)\s+(?:på|för)\s+(?:(?:min|vår|den)\s+)?(?:sajt(?:en)?|sida(?:n)?|webbplats(?:en)?|förhandsvisning(?:en)?))(?:\s+(?:just nu|nu|idag))?\s*[?!.]*$/iu.test(text.trim());
  if (!search && !reviewCurrentSite) return task;
  return { ...task, ...(search ? { search: true } : {}), ...(reviewCurrentSite ? { reviewCurrentSite: true } : {}) };
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
