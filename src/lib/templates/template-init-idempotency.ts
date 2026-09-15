import * as chatRepo from "@/lib/db/chat-repository-pg";
import { getProjectData, saveProjectData } from "@/lib/db/services/projects";

export type TemplateInitLegacyFile = {
  name: string;
  content: string;
};

export type ExistingTemplateInit = {
  chatId: string;
  projectId: string;
  versionId: string;
  previewUrl: string | null;
  files: TemplateInitLegacyFile[];
  code: string;
  model: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * `project_data.meta.templateId` is the owner-scoped lookup key when the
 * client has no `projectId` yet. Other surfaces already persist this field;
 * we only read it.
 */
export function readTemplateIdFromProjectMeta(meta: unknown): string | null {
  return trimId(asRecord(meta)?.templateId);
}

/**
 * Lenient origin read so a retry still matches after a fail-open snapshot
 * persist. Full contract hashing is not required for idempotency.
 */
export function readTemplateIdFromOrchestrationSnapshot(snapshot: unknown): string | null {
  const root = asRecord(snapshot);
  if (!root) return null;
  const baseline = asRecord(root.importedRepoBaseline);
  const contract = asRecord(baseline?.contract);
  return (
    trimId(asRecord(contract?.origin)?.templateId) ??
    trimId(asRecord(baseline?.origin)?.templateId) ??
    trimId(asRecord(root.origin)?.templateId)
  );
}

export function parseTemplateInitFiles(filesJson: string): TemplateInitLegacyFile[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(filesJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const files: TemplateInitLegacyFile[] = [];
  for (const file of parsed) {
    const rec = asRecord(file);
    if (!rec) continue;
    const name = trimId(rec.path) ?? trimId(rec.name);
    if (!name || typeof rec.content !== "string") continue;
    files.push({ name, content: rec.content });
  }
  return files;
}

export function pickMainTemplateCode(files: TemplateInitLegacyFile[]): string {
  if (!files.length) return "";
  const main =
    files.find(
      (file) =>
        file.name.includes("page.tsx") ||
        file.name.includes("Page.tsx") ||
        file.name.endsWith(".tsx"),
    ) ?? files[0];
  return main.content;
}

async function loadChatSnapshot(
  chat: {
    id: string;
    orchestration_snapshot?: Record<string, unknown> | null;
  },
): Promise<Record<string, unknown> | null> {
  const embedded = asRecord(chat.orchestration_snapshot);
  if (embedded) return embedded;
  return chatRepo.getChatOrchestrationSnapshot(chat.id);
}

/**
 * Replay a completed template init for `(projectId, templateId)`.
 * Incomplete chats (no imported version yet) are ignored so initialize can
 * finish on the same project without inventing a second chat when a version
 * already exists for this template.
 */
export async function findExistingTemplateInit(
  projectId: string,
  templateId: string,
): Promise<ExistingTemplateInit | null> {
  const wanted = trimId(templateId);
  const scopedProjectId = trimId(projectId);
  if (!wanted || !scopedProjectId) return null;

  const chats = await chatRepo.listChatsByProject(scopedProjectId);
  for (const chat of chats) {
    const snapshot = await loadChatSnapshot(chat);
    if (readTemplateIdFromOrchestrationSnapshot(snapshot) !== wanted) continue;
    const version =
      (await chatRepo.getPreferredVersion(chat.id).catch(() => null)) ??
      (await chatRepo.getLatestVersion(chat.id).catch(() => null));
    if (!version) continue;
    const files = parseTemplateInitFiles(version.files_json);
    return {
      chatId: chat.id,
      projectId: scopedProjectId,
      versionId: version.id,
      previewUrl: trimId(version.preview_url),
      files,
      code: pickMainTemplateCode(files),
      model: typeof chat.model === "string" && chat.model.trim() ? chat.model : "",
    };
  }

  const projectData = await getProjectData(scopedProjectId);
  const persistedChatId = trimId(projectData?.chat_id);
  if (!persistedChatId || readTemplateIdFromProjectMeta(projectData?.meta) !== wanted) {
    return null;
  }

  const alreadySeen = chats.some((chat) => chat.id === persistedChatId);
  if (alreadySeen) return null;

  const chat = await chatRepo.getChat(persistedChatId);
  if (!chat || chat.project_id !== scopedProjectId) return null;
  const snapshot = await loadChatSnapshot(chat);
  if (readTemplateIdFromOrchestrationSnapshot(snapshot) !== wanted) return null;
  const version =
    (await chatRepo.getPreferredVersion(chat.id).catch(() => null)) ??
    (await chatRepo.getLatestVersion(chat.id).catch(() => null));
  if (!version) return null;
  const files = parseTemplateInitFiles(version.files_json);
  return {
    chatId: chat.id,
    projectId: scopedProjectId,
    versionId: version.id,
    previewUrl: trimId(version.preview_url),
    files,
    code: pickMainTemplateCode(files),
    model: typeof chat.model === "string" && chat.model.trim() ? chat.model : "",
  };
}

export async function markTemplateInitPending(
  projectId: string,
  templateId: string,
): Promise<void> {
  await saveProjectData({
    project_id: projectId,
    meta_patch: {
      templateId,
      source: "template-init:pending",
    },
  });
}
