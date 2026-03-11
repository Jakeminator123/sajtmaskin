import {
  createVersion,
  getLatestVersion,
  getVersionById,
  type Version,
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

/**
 * Creates a new version from assistant-generated content.
 *
 * Parses the content into individual files, stores them as files_json,
 * and auto-increments the version number within the chat.
 */
export async function createVersionFromContent(
  chatId: string,
  messageId: string | null,
  content: string,
  sandboxUrl?: string,
): Promise<Version> {
  const filesJson = parseFilesFromContent(content);
  return createVersion(chatId, messageId, filesJson, sandboxUrl);
}

/**
 * Retrieves parsed files for a given version ID.
 * Returns null if the version doesn't exist.
 */
export async function getVersionFiles(versionId: string): Promise<CodeFile[] | null> {
  const version = await getVersionById(versionId);
  if (!version) return null;

  try {
    return JSON.parse(version.files_json) as CodeFile[];
  } catch {
    return [];
  }
}

/**
 * Retrieves parsed files for the latest version of a chat.
 * Returns null if no versions exist.
 */
export async function getLatestVersionFiles(chatId: string): Promise<CodeFile[] | null> {
  const version = await getLatestVersion(chatId);
  if (!version) return null;

  try {
    return JSON.parse(version.files_json) as CodeFile[];
  } catch {
    return [];
  }
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
export function mergeVersionFiles(
  previousFiles: CodeFile[],
  newFiles: CodeFile[],
): CodeFile[] {
  const { files } = mergeVersionFilesWithWarnings(previousFiles, newFiles);
  return files;
}

export function mergeVersionFilesWithWarnings(
  previousFiles: CodeFile[],
  newFiles: CodeFile[],
): MergeResult {
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
    }
    merged.set(f.path, f);
  }

  return {
    files: Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path)),
    warnings,
  };
}
