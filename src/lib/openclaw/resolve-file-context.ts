import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import {
  getVersionFiles,
  getLatestVersionFiles,
} from "@/lib/gen/version-manager";
import { resolveVersionFiles } from "@/lib/v0/resolve-version-files";
import { v0 } from "@/lib/v0";

type FileEntry = { name: string; content: string; language?: string };

export interface FileContext {
  files: FileEntry[];
  manifest: string;
  fullText: string | null;
}

const MAX_FULL_TEXT_CHARS = 60_000;
const MAX_MANIFEST_FILES = 50;

/**
 * Fetches generated files for a chat/version and formats them for agent context.
 * Returns a manifest (always) and full text (when project is small enough).
 */
export async function resolveFileContext(
  chatId: string,
  versionId?: string | null,
): Promise<FileContext | null> {
  try {
    const files = await fetchFiles(chatId, versionId ?? null);
    if (!files || files.length === 0) return null;

    const manifest = files
      .slice(0, MAX_MANIFEST_FILES)
      .map((f) => `  ${f.name} (${f.language ?? inferLang(f.name)}, ${f.content.length}b)`)
      .join("\n");

    const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);

    let fullText: string | null = null;
    if (totalChars <= MAX_FULL_TEXT_CHARS) {
      fullText = files
        .map((f) => `--- ${f.name} ---\n${f.content}`)
        .join("\n\n");
    }

    return { files, manifest, fullText };
  } catch (err) {
    console.error("[resolveFileContext] Failed:", err);
    return null;
  }
}

async function fetchFiles(
  chatId: string,
  versionId: string | null,
): Promise<FileEntry[]> {
  if (!shouldUseV0Fallback()) {
    const raw = versionId
      ? await getVersionFiles(versionId)
      : await getLatestVersionFiles(chatId);
    if (!raw) return [];
    return raw.map((f) => ({
      name: f.path,
      content: f.content,
      language: f.language,
    }));
  }

  const v0ApiKey = process.env.V0_API_KEY?.trim();
  if (!v0ApiKey) return [];

  const chat = await v0.chats.getById({ chatId });
  const targetId =
    versionId ?? getLatestV0VersionId(chat) ?? null;
  if (!targetId) return [];

  const result = await resolveVersionFiles({
    chatId,
    versionId: targetId,
    options: { maxAttempts: 5, delayMs: 1000, minFiles: 1 },
  });

  if (result.files.length > 0) {
    return result.files.map((f) => ({
      name: f.name,
      content: typeof f.content === "string" ? f.content : "",
      language: inferLang(f.name),
    }));
  }

  return [];
}

function getLatestV0VersionId(chat: unknown): string | null {
  const payload = chat as {
    latestVersion?: { id?: string | null } | null;
  } | null;
  const id = payload?.latestVersion?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function inferLang(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    tsx: "tsx", ts: "ts", jsx: "jsx", js: "js",
    css: "css", json: "json", md: "md", html: "html",
  };
  return map[ext] ?? "text";
}
