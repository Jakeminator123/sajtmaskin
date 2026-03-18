import {
  getVersionFiles,
  getLatestVersionFiles,
} from "@/lib/gen/version-manager";

type FileEntry = { name: string; content: string; language?: string };

export interface FileContext {
  files: FileEntry[];
  manifest: string;
  fullText: string | null;
}

const MAX_FULL_TEXT_CHARS = 60_000;
const MAX_MANIFEST_FILES = 50;

export interface ResolveFileContextOptions {
  includeFullText?: boolean;
  maxFullTextChars?: number;
  maxManifestFiles?: number;
}

/**
 * Fetches generated files for a chat/version and formats them for agent context.
 * Returns a manifest (always) and full text (when project is small enough).
 */
export async function resolveFileContext(
  chatId: string,
  versionId?: string | null,
  options?: ResolveFileContextOptions,
): Promise<FileContext | null> {
  try {
    const files = await fetchFiles(chatId, versionId ?? null);
    if (!files || files.length === 0) return null;

    const maxManifestFiles = options?.maxManifestFiles ?? MAX_MANIFEST_FILES;
    const manifest = files
      .slice(0, maxManifestFiles)
      .map((f) => `  ${f.name} (${f.language ?? inferLang(f.name)}, ${f.content.length}b)`)
      .join("\n");

    const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
    const maxFullTextChars = options?.maxFullTextChars ?? MAX_FULL_TEXT_CHARS;
    const includeFullText = options?.includeFullText !== false;

    let fullText: string | null = null;
    if (includeFullText && totalChars <= maxFullTextChars) {
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

function inferLang(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    tsx: "tsx", ts: "ts", jsx: "jsx", js: "js",
    css: "css", json: "json", md: "md", html: "html",
  };
  return map[ext] ?? "text";
}
