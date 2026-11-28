import { isExplicitOpenClawSiteReview } from "@/lib/builder/composer-route";
import { isExplicitOpenClawWebSearch, type SelectedSourcePage } from "./source-page";

export interface OpenClawReadTask {
  search?: boolean;
  reviewCurrentSite?: boolean;
  attachmentIds?: number[];
  source?: SelectedSourcePage;
}

export function resolveOpenClawReadTask(text: string, task?: OpenClawReadTask): OpenClawReadTask | undefined {
  const search = isExplicitOpenClawWebSearch(text);
  const reviewCurrentSite = isExplicitOpenClawSiteReview(text);
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
