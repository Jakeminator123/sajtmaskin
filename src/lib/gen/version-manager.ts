import {
  createVersion,
  getLatestVersion,
  getVersionById,
  type Version,
} from "@/lib/db/chat-repository";
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
export function createVersionFromContent(
  chatId: string,
  messageId: string | null,
  content: string,
  sandboxUrl?: string,
): Version {
  const filesJson = parseFilesFromContent(content);
  return createVersion(chatId, messageId, filesJson, sandboxUrl);
}

/**
 * Retrieves parsed files for a given version ID.
 * Returns null if the version doesn't exist.
 */
export function getVersionFiles(versionId: string): CodeFile[] | null {
  const version = getVersionById(versionId);
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
export function getLatestVersionFiles(chatId: string): CodeFile[] | null {
  const version = getLatestVersion(chatId);
  if (!version) return null;

  try {
    return JSON.parse(version.files_json) as CodeFile[];
  } catch {
    return [];
  }
}

/**
 * Merges new generated files into the previous file set.
 * Files in newFiles overwrite matching paths; all other previous files are kept.
 * Result is sorted by path for deterministic ordering.
 */
export function mergeVersionFiles(
  previousFiles: CodeFile[],
  newFiles: CodeFile[],
): CodeFile[] {
  const merged = new Map<string, CodeFile>();
  for (const f of previousFiles) {
    merged.set(f.path, f);
  }
  for (const f of newFiles) {
    merged.set(f.path, f);
  }
  return Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path));
}
