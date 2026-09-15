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

export class TemplateInitLookupError extends Error {
  readonly code = "TEMPLATE_INIT_LOOKUP_FAILED" as const;
  readonly retryable = true;
  constructor(message = "Kunde inte läsa tidigare template-import.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TemplateInitLookupError";
  }
}

export function isTemplateInitLookupError(error: unknown): error is TemplateInitLookupError {
  return (
    error instanceof TemplateInitLookupError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "TEMPLATE_INIT_LOOKUP_FAILED")
  );
}

async function readImportedVersion(chatId: string) {
  let preferred;
  try {
    preferred = await chatRepo.getPreferredVersion(chatId);
  } catch (error) {
    throw new TemplateInitLookupError("Kunde inte läsa tidigare template-version.", {
      cause: error,
    });
  }
  if (preferred) return preferred;
  try {
    return await chatRepo.getLatestVersion(chatId);
  } catch (error) {
    throw new TemplateInitLookupError("Kunde inte läsa tidigare template-version.", {
      cause: error,
    });
  }
}

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

  let chats;
  try {
    chats = await chatRepo.listChatsByProject(scopedProjectId);
  } catch (error) {
    throw new TemplateInitLookupError("Kunde inte läsa projektets chattar.", { cause: error });
  }
  for (const chat of chats) {
    let snapshot;
    try {
      snapshot = await loadChatSnapshot(chat);
    } catch (error) {
      throw new TemplateInitLookupError("Kunde inte läsa chat-snapshot för template-import.", {
        cause: error,
      });
    }
    if (readTemplateIdFromOrchestrationSnapshot(snapshot) !== wanted) continue;
    const version = await readImportedVersion(chat.id);
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

  let projectData;
  try {
    projectData = await getProjectData(scopedProjectId);
  } catch (error) {
    throw new TemplateInitLookupError("Kunde inte läsa projektets template-metadata.", {
      cause: error,
    });
  }
  const persistedChatId = trimId(projectData?.chat_id);
  if (!persistedChatId || readTemplateIdFromProjectMeta(projectData?.meta) !== wanted) {
    return null;
  }

  const alreadySeen = chats.some((chat) => chat.id === persistedChatId);
  if (alreadySeen) return null;

  let chat;
  try {
    chat = await chatRepo.getChat(persistedChatId);
  } catch (error) {
    throw new TemplateInitLookupError("Kunde inte läsa den sparade template-chatten.", {
      cause: error,
    });
  }
  if (!chat || chat.project_id !== scopedProjectId) return null;
  let snapshot;
  try {
    snapshot = await loadChatSnapshot(chat);
  } catch (error) {
    throw new TemplateInitLookupError("Kunde inte läsa chat-snapshot för template-import.", {
      cause: error,
    });
  }
  if (readTemplateIdFromOrchestrationSnapshot(snapshot) !== wanted) return null;
  const version = await readImportedVersion(chat.id);
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
