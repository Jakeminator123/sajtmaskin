import {
  getPreferredVersion,
  getLatestVersion,
  getVersionById,
} from "@/lib/db/chat-repository-pg";
import { parseCodeProject, type CodeFile } from "./parser";

/**
 * Extracts files from raw assistant content using the CodeProject parser.
 * Returns a JSON string suitable for storing in versions.files_json.
 */
export function parseFilesFromContent(content: string): string {
  const project = parseCodeProject(content);
  return JSON.stringify(project.files);
}

/** Parse `versions.files_json` into code files (e.g. sandbox bootstrap when markdown parse yields nothing). */
export function parseCodeFilesFromFilesJson(filesJson: string): CodeFile[] | null {
  try {
    const parsed = JSON.parse(filesJson);
    return Array.isArray(parsed) ? (parsed as CodeFile[]) : null;
  } catch {
    return null;
  }
}

function parseStoredVersionFiles(
  filesJson: string,
  context: { versionId?: string; chatId?: string },
): CodeFile[] | null {
  try {
    const parsed = JSON.parse(filesJson);
    return Array.isArray(parsed) ? (parsed as CodeFile[]) : null;
  } catch (error) {
    console.error("[version-manager] Failed to parse stored version files", {
      versionId: context.versionId ?? null,
      chatId: context.chatId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Retrieves parsed files for a given version ID.
 * Returns null if the version doesn't exist.
 */
export async function getVersionFiles(versionId: string): Promise<CodeFile[] | null> {
  const version = await getVersionById(versionId);
  if (!version) return null;
  return parseStoredVersionFiles(version.files_json, {
    versionId: version.id,
    chatId: version.chat_id,
  });
}

/**
 * Retrieves parsed files for the latest version of a chat.
 * Returns null if no versions exist.
 */
export async function getLatestVersionFiles(chatId: string): Promise<CodeFile[] | null> {
  const version = (await getPreferredVersion(chatId)) ?? (await getLatestVersion(chatId));
  if (!version) return null;
  return parseStoredVersionFiles(version.files_json, {
    versionId: version.id,
    chatId: version.chat_id,
  });
}

/**
 * Canonical follow-up base: `engine_versions.files_json` for the explicitly selected version
 * (`engineBaseVersionId` from builder meta), else preferred lifecycle version, else latest.
 */
export async function resolveFollowUpPreviousFiles(
  chatId: string,
  engineBaseVersionId?: string | null,
): Promise<CodeFile[]> {
  const id = typeof engineBaseVersionId === "string" ? engineBaseVersionId.trim() : "";
  if (id) {
    const version = await getVersionById(id);
    if (version && version.chat_id === chatId) {
      const parsed = parseStoredVersionFiles(version.files_json, {
        versionId: version.id,
        chatId: version.chat_id,
      });
      if (parsed && parsed.length > 0) {
        return parsed;
      }
    }
  }
  const version = (await getPreferredVersion(chatId)) ?? (await getLatestVersion(chatId));
  if (!version?.files_json) return [];
  return (
    parseStoredVersionFiles(version.files_json, {
      versionId: version.id,
      chatId: version.chat_id,
    }) ?? []
  );
}

export interface MergeWarning {
  type: "significant-shrink" | "scaffold-file-dropped";
  file: string;
  previousSize: number;
  newSize: number;
}

export interface MergeResult {
  files: CodeFile[];
  warnings: MergeWarning[];
}

/**
 * Merges new generated files into the previous file set.
 * Files in newFiles overwrite matching paths; all other previous files are kept.
 * Result is sorted by path for deterministic ordering.
 *
 * Warns when a generated file is significantly smaller than the scaffold
 * original (potential token truncation).
 */
export function mergeVersionFilesWithWarnings(
  previousFiles: CodeFile[],
  newFiles: CodeFile[],
  options?: { rejectSignificantShrinks?: boolean },
): MergeResult {
  const rejectShrinks = options?.rejectSignificantShrinks === true;
  const merged = new Map<string, CodeFile>();
  const warnings: MergeWarning[] = [];

  for (const f of previousFiles) {
    merged.set(f.path, f);
  }
  for (const f of newFiles) {
    const prev = merged.get(f.path);
    if (prev && f.content.length < prev.content.length * 0.3) {
      warnings.push({
        type: "significant-shrink",
        file: f.path,
        previousSize: prev.content.length,
        newSize: f.content.length,
      });
      if (rejectShrinks) {
        continue;
      }
    }
    merged.set(f.path, f);
  }

  return {
    files: Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path)),
    warnings,
  };
}
