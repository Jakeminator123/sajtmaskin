import JSZip from "jszip";

import { getVersionById } from "@/lib/db/chat-repository-pg";
import { parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";

/**
 * Build a ZIP of an own-engine version from `engine_versions.files_json`.
 * Returns null if the version is missing, not owned by the chat, or has no files.
 */
export async function buildZipBufferFromEngineVersion(
  chatId: string,
  versionId: string,
): Promise<ArrayBuffer | null> {
  const version = await getVersionById(versionId);
  if (!version || version.chat_id !== chatId) {
    return null;
  }
  const files = parseCodeFilesFromFilesJson(version.files_json);
  if (!files || files.length === 0) {
    return null;
  }
  const zip = new JSZip();
  for (const file of files) {
    const path = typeof file.path === "string" ? file.path.trim() : "";
    if (!path || typeof file.content !== "string") continue;
    zip.file(path, file.content);
  }
  return zip.generateAsync({ type: "arraybuffer" });
}
